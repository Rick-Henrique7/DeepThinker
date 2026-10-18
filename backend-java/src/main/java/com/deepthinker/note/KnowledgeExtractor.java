package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.llm.LlmClient;
import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.llm.LlmClientFactory;
import com.deepthinker.llm.LlmException;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * A parte comum entre "Criar resumo" (conversa) e upload de documento:
 * pede para a IA extrair título, resumo e pontos-chave de um texto e
 * transforma isso em notas ligadas no grafo.
 *
 * No Laravel esse código estava copiado em dois controllers; aqui fica num lugar só.
 *
 * Para não duplicar ideias, monta um HashMap de títulos normalizados (minúsculo,
 * sem acento). Procurar num HashMap é O(1), então o reaproveitamento todo é O(N).
 */
@Service
public class KnowledgeExtractor {

    /** Resultado da gravação: a nota principal e quantas notas foram criadas ou reaproveitadas. */
    public record Linked(Note note, int created, int reused) {
    }

    public static final int MAX_CHARS = 12_000;
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{.*}", Pattern.DOTALL);

    private final NoteRepository notes;
    private final ConnectionRepository connections;
    private final NoteService noteService;
    private final LlmClientFactory clients;
    private final JsonMapper json;
    private final TransactionTemplate tx;

    public KnowledgeExtractor(NoteRepository notes, ConnectionRepository connections, NoteService noteService,
                              LlmClientFactory clients, JsonMapper json, TransactionTemplate tx) {
        this.notes = notes;
        this.connections = connections;
        this.noteService = noteService;
        this.clients = clients;
        this.json = json;
        this.tx = tx;
    }

    /** Corta textos longos para não estourar o limite de contexto da IA. */
    public static String truncateForLlm(String text, String marker) {
        return text.length() > MAX_CHARS ? text.substring(0, MAX_CHARS) + "\n\n[... " + marker + " ...]" : text;
    }

    /**
     * Pergunta à IA ativa e devolve o JSON já convertido em Map, ou null se ela
     * não devolveu um JSON válido. A chamada fica fora de transação de propósito:
     * pode levar dezenas de segundos e não queremos prender o banco esperando.
     *
     * @param what  "a conversa" ou "o documento" (entra no prompt)
     * @param label "Conversa" ou "Documento" (cabeçalho do texto no prompt)
     */
    public Map<String, Object> extract(String what, String label, String text, String model) {
        List<String> existingTitles = notes.findByUserId(CurrentUser.id()).stream().map(Note::getTitle).toList();
        String prompt = "Você é o Advogado do Diabo do DeepThinker.\n\n"
                + "TAREFA ÚNICA: leia " + what + " abaixo e produza APENAS um objeto JSON válido. Não continue a "
                + "conversa, não comente, não use markdown.\n\n"
                + "Formato EXATO (siga à risca):\n"
                + "{\"title\":\"<titulo curto em portugues>\",\"summary\":\"<resumo em 2 frases>\",\"key_points\":"
                + "[{\"key\":\"<titulo do ponto>\",\"detail\":\"<detalhe em 1 frase>\"},"
                + "{\"key\":\"<titulo do ponto 2>\",\"detail\":\"<detalhe>\"}]}\n\n"
                + "Reaproveite chaves existentes quando fizer sentido — se um ponto-chave coincide com uma destas "
                + "notas, use o título EXATO:\n"
                + json.writeValueAsString(existingTitles) + "\n\n"
                + "IMPORTANTE: Responda começando com { e terminando com }. Nada antes, nada depois.\n\n"
                + label + ":\n---\n" + text + "\n---\n\nJSON:";

        LlmClient llm = clients.active();
        List<Message> ask = List.of(new Message("user", prompt));
        // 2048 tokens: modelos que "pensam" antes de responder (gpt-oss, DeepSeek R1...)
        // gastam parte do limite raciocinando; com 600 o JSON às vezes nem começava.
        LlmClient.Options options = new LlmClient.Options(0.2, 2048);
        String raw;
        try {
            raw = llm.chat(ask, model, options);
        } catch (LlmException first) {
            // Falha passageira (ex.: o gpt-oss do Groq às vezes tenta usar uma ferramenta que
            // não existe e o Groq devolve 400). Uma segunda tentativa costuma resolver;
            // se falhar de novo, a exceção sobe e vira 502 com a mensagem do provedor.
            if (!first.isRetryable()) {
                throw first;
            }
            raw = llm.chat(ask, model, options);
        }
        return parseLenient(raw);
    }

    /**
     * Grava a nota principal e uma nota por ponto-chave (ou reaproveita uma existente),
     * ligando a principal a cada uma. Tudo numa transação: ou grava tudo, ou nada.
     */
    public Linked saveLinked(Map<String, Object> parsed, String defaultTitle, String content,
                             String defaultSummary, String sourceType, Map<String, Object> meta) {
        return tx.execute(status -> {
            // Lemos as notas aqui dentro: alguém pode ter criado outras enquanto a IA pensava.
            Map<String, Long> existing = new HashMap<>();
            notes.findByUserId(CurrentUser.id()).forEach(n -> existing.put(normalize(n.getTitle()), n.getId()));

            String title = truncate(stringOr(parsed.get("title"), defaultTitle), 255);
            Note main = noteService.createWithSource(uniqueTitle(title, existing), content,
                    stringOr(parsed.get("summary"), defaultSummary), sourceType, meta);
            existing.put(normalize(main.getTitle()), main.getId());

            int created = 0;
            int reused = 0;
            if (parsed.get("key_points") instanceof List<?> points) {
                for (Object item : points) {
                    if (!(item instanceof Map<?, ?> kp)) continue;
                    String key = stringOr(kp.get("key"), "").trim();
                    if (key.isEmpty() || key.length() > 200) continue;

                    String normalized = normalize(key);
                    Long targetId = existing.get(normalized);
                    if (targetId != null) {
                        reused++;
                    } else {
                        Note n = noteService.createWithSource(uniqueTitle(key, existing),
                                stringOr(kp.get("detail"), ""), null, null, null);
                        targetId = n.getId();
                        existing.put(normalized, targetId);
                        created++;
                    }
                    if (targetId.equals(main.getId())
                            || connections.existsBySourceNoteIdAndTargetNoteId(main.getId(), targetId)) {
                        continue;
                    }
                    connections.save(new Connection(main.getId(), targetId));
                }
            }
            return new Linked(main, created, reused);
        });
    }

    /** Minúsculo, espaços simples e sem acentos: "Ação  Rápida" vira "acao rapida". */
    static String normalize(String s) {
        String lower = s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        // NFD separa a letra do acento ("ã" -> "a" + "~"); depois removemos os acentos.
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    /** Aceita JSON puro, dentro de ```json ... ``` ou com texto em volta. */
    Map<String, Object> parseLenient(String raw) {
        String clean = raw == null ? "" : raw.trim();
        if (clean.startsWith("```")) {
            clean = clean.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }
        Map<String, Object> direct = tryParse(clean);
        if (direct != null) {
            return direct;
        }
        Matcher m = JSON_OBJECT.matcher(clean);
        return m.find() ? tryParse(m.group()) : null;
    }

    private Map<String, Object> tryParse(String s) {
        try {
            return json.readValue(s, new TypeReference<Map<String, Object>>() {});
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String uniqueTitle(String title, Map<String, Long> existing) {
        String candidate = title;
        int i = 2;
        while (existing.containsKey(normalize(candidate))) {
            candidate = title + " (" + i++ + ")";
        }
        return candidate;
    }

    private static String stringOr(Object value, String fallback) {
        return value == null ? fallback : value.toString();
    }

    static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
