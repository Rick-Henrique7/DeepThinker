package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.ValidationException;
import com.deepthinker.llm.LlmClient;
import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.llm.LlmClientFactory;
import com.deepthinker.llm.LlmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * "Resumo em áudio" (a ideia do Audio Overview do NotebookLM): a IA escreve um roteiro curto
 * sobre o que você anotou nos últimos dias e o navegador lê esse roteiro em voz alta.
 *
 * Por que o servidor devolve TEXTO e não um arquivo MP3?
 * - Gerar voz no servidor pede um serviço pago de "text-to-speech" e arquivos pesados;
 * - todo navegador moderno já tem vozes em português (a Web Speech API, speechSynthesis),
 *   de graça, que funcionam até no app desktop sem internet quando a IA é local.
 * Então o Java faz só a parte inteligente: escolher as notas e escrever o roteiro.
 */
@Service
public class AudioSummaryService {

    /** days: quantos dias para trás (1 a 90). style: "resumo" (uma voz) ou "conversa" (duas). */
    public record AudioSummaryRequest(Integer days, String style, String model) {
    }

    /** Uma fala do roteiro: quem fala e o que diz. */
    public record ScriptLine(String speaker, String text) {
    }

    public record AudioSummary(String title, String style, int days, List<NoteDtos.NoteRef> notes,
                               List<ScriptLine> lines) {
    }

    static final int MAX_NOTES = 25;
    static final int MAX_LINES = 40;
    private static final int MAX_NOTE_CHARS = 800;
    private static final int MAX_LINE_CHARS = 600;
    static final String NARRATOR = "Narrador";
    static final List<String> HOSTS = List.of("Ana", "Bruno");

    private final NoteRepository notes;
    private final LlmClientFactory clients;
    private final KnowledgeExtractor extractor;

    public AudioSummaryService(NoteRepository notes, LlmClientFactory clients, KnowledgeExtractor extractor) {
        this.notes = notes;
        this.clients = clients;
        this.extractor = extractor;
    }

    public AudioSummary summarize(AudioSummaryRequest req) {
        int days = req == null || req.days() == null ? 7 : req.days();
        if (days < 1 || days > 90) {
            throw ValidationException.of("days", "Escolha entre 1 e 90 dias.");
        }
        String style = req == null || req.style() == null ? "resumo" : req.style();
        if (!List.of("resumo", "conversa").contains(style)) {
            throw ValidationException.of("style", "style deve ser resumo ou conversa.");
        }

        // As notas mexidas no período (criar também conta, porque criar já preenche updated_at).
        // As mais recentes primeiro; acima de 25 o roteiro vira uma lista corrida, então paramos.
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);
        List<Note> recent = notes.findByUserId(CurrentUser.id()).stream()
                .filter(n -> !n.getUpdatedAt().isBefore(since))
                .sorted(Comparator.comparing(Note::getUpdatedAt).reversed())
                .limit(MAX_NOTES)
                .toList();
        if (recent.isEmpty()) {
            throw ValidationException.of("days", days == 1
                    ? "Você não escreveu nenhuma nota hoje."
                    : "Você não escreveu nenhuma nota nos últimos " + days + " dias.");
        }

        String prompt = prompt(style, days, notesText(recent));
        LlmClient llm = clients.active();
        List<Message> ask = List.of(new Message("user", prompt));
        // Temperatura um pouco mais alta que a do resumo (0,2): aqui queremos um texto natural de ouvir.
        LlmClient.Options options = new LlmClient.Options(0.6, 2048);
        String raw;
        try {
            raw = llm.chat(ask, req == null ? null : req.model(), options);
        } catch (LlmException first) {
            if (!first.isRetryable()) {
                throw first;
            }
            raw = llm.chat(ask, req == null ? null : req.model(), options);
        }

        String fallbackTitle = days == 1 ? "Suas notas de hoje" : "Suas notas dos últimos " + days + " dias";
        Map<String, Object> parsed = extractor.parseLenient(raw);
        List<ScriptLine> lines = parsed == null ? List.of() : readLines(parsed.get("lines"), style);
        String title = parsed != null && parsed.get("title") instanceof String t && !t.isBlank()
                ? KnowledgeExtractor.truncate(t.strip(), 120) : fallbackTitle;
        if (lines.isEmpty()) {
            // Plano B: modelos locais às vezes ignoram o JSON e escrevem o texto direto.
            // Um texto corrido ainda dá para ouvir; ele vira falas do narrador, parágrafo por parágrafo.
            lines = plainTextLines(raw);
            title = fallbackTitle;
        }
        if (lines.isEmpty()) {
            throw ValidationException.of("style", "A IA não devolveu um roteiro. Tente de novo.");
        }
        return new AudioSummary(title, style, days, recent.stream().map(NoteDtos.NoteRef::of).toList(), lines);
    }

    /** As notas em texto para o prompt: título, tags e o começo do conteúdo (sem o cabeçalho YAML). */
    static String notesText(List<Note> recent) {
        StringBuilder sb = new StringBuilder();
        for (Note n : recent) {
            NoteMetadata.Parsed meta = NoteMetadata.parse(n.getContent());
            String body = meta.body().strip();
            if (body.length() > MAX_NOTE_CHARS) {
                body = body.substring(0, MAX_NOTE_CHARS) + "...";
            }
            sb.append("## ").append(n.getTitle()).append('\n');
            if (!meta.tags().isEmpty()) {
                sb.append("Tags: ").append(String.join(", ", meta.tags())).append('\n');
            }
            sb.append(body.isEmpty() ? "(nota sem texto)" : body).append("\n\n");
        }
        return KnowledgeExtractor.truncateForLlm(sb.toString(), "notas truncadas");
    }

    static String prompt(String style, int days, String notesText) {
        String period = days == 1 ? "hoje" : "nos últimos " + days + " dias";
        String how = "conversa".equals(style)
                ? "Formato: dois apresentadores conversam como num podcast. Ana resume e liga as ideias; "
                  + "Bruno é o advogado do diabo: questiona, pede exemplos e aponta contradições. "
                  + "Eles se alternam. Escreva de 10 a 16 falas. Use \"speaker\": \"Ana\" ou \"Bruno\".\n"
                : "Formato: um narrador só, que fala direto com a pessoa (\"você\"). "
                  + "Escreva de 6 a 10 falas. Use \"speaker\": \"Narrador\".\n";
        return "Você escreve roteiros de áudio curtos, em português do Brasil, para o Deep thinker, "
                + "um app de notas para pensar melhor.\n\n"
                + "Leia as notas que a pessoa escreveu " + period + " e escreva um roteiro para ser OUVIDO, "
                + "por exemplo no caminho para o trabalho.\n"
                + how
                + "Regras:\n"
                + "- Comece dizendo em uma frase sobre o que foram as notas.\n"
                + "- Junte ideias parecidas, cite o título das notas e aponte uma ligação que a pessoa talvez "
                + "não tenha visto.\n"
                + "- Termine com uma pergunta para a pessoa pensar.\n"
                + "- Cada fala tem de 1 a 3 frases curtas. Nada de listas, markdown, emojis, links ou siglas.\n"
                + "- Não invente fatos que não estão nas notas.\n\n"
                + "Responda APENAS com um objeto JSON, começando com { e terminando com }, neste formato:\n"
                + "{\"title\":\"<título curto do episódio>\",\"lines\":[{\"speaker\":\"<quem fala>\","
                + "\"text\":\"<a fala>\"}]}\n\n"
                + "Notas:\n---\n" + notesText + "---\n\nJSON:";
    }

    /**
     * Confere cada fala que a IA devolveu: precisa ter texto; o nome de quem fala é corrigido
     * para os nomes que o navegador conhece (Narrador, ou Ana e Bruno se alternando).
     */
    static List<ScriptLine> readLines(Object value, String style) {
        List<ScriptLine> out = new ArrayList<>();
        if (!(value instanceof List<?> items)) {
            return out;
        }
        for (Object item : items) {
            if (out.size() >= MAX_LINES) {
                break;
            }
            String text = null;
            String speaker = null;
            if (item instanceof Map<?, ?> m) {
                text = m.get("text") instanceof String s ? s : null;
                speaker = m.get("speaker") instanceof String s ? s.strip() : null;
            } else if (item instanceof String s) {
                text = s;
            }
            text = cleanSpeech(text);
            if (text.isEmpty()) {
                continue;
            }
            String who;
            if ("conversa".equals(style)) {
                // Aceita "Ana", "ana:" ou "Apresentadora Ana"; sem nome, alterna com a fala anterior.
                String previous = out.isEmpty() ? HOSTS.get(1) : out.get(out.size() - 1).speaker();
                String alternate = previous.equals(HOSTS.get(0)) ? HOSTS.get(1) : HOSTS.get(0);
                String lower = speaker == null ? "" : speaker.toLowerCase(java.util.Locale.ROOT);
                who = lower.contains("bruno") ? HOSTS.get(1) : lower.contains("ana") ? HOSTS.get(0) : alternate;
            } else {
                who = NARRATOR;
            }
            out.add(new ScriptLine(who, text));
        }
        return out;
    }

    /** Texto corrido vira falas do narrador: um parágrafo por fala (texto curto demais não serve). */
    static List<ScriptLine> plainTextLines(String raw) {
        String text = raw == null ? "" : raw.replaceAll("(?s)<think>.*?</think>", "").strip();
        if (text.length() < 120 || text.startsWith("{")) {
            return List.of();
        }
        List<ScriptLine> out = new ArrayList<>();
        for (String paragraph : text.split("\\n\\s*\\n")) {
            String clean = cleanSpeech(paragraph.replace('\n', ' '));
            if (!clean.isEmpty() && out.size() < MAX_LINES) {
                out.add(new ScriptLine(NARRATOR, clean));
            }
        }
        return out;
    }

    /**
     * Tira o que soaria estranho em voz alta: **negrito**, # títulos, [[links]] e marcadores de lista.
     * A voz do navegador leria "asterisco asterisco" literalmente.
     */
    static String cleanSpeech(String text) {
        if (text == null) {
            return "";
        }
        String s = text
                .replaceAll("\\[\\[([^\\]|]*\\|)?([^\\]]*)]]", "$2")
                .replaceAll("[*_`#>]+", "")
                .replaceAll("(?m)^\\s*[-•]\\s+", "")
                .replaceAll("\\s+", " ")
                .strip();
        return KnowledgeExtractor.truncate(s, MAX_LINE_CHARS);
    }
}
