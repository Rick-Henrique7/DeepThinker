package com.deepthinker.memory;

import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.memory.NoteSearch.Hit;
import com.deepthinker.note.Note;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Junta a busca com o chat: a partir da conversa, acha as notas relevantes
 * e monta o trecho do prompt que mostra para a IA "o que o usuário já sabe".
 * É o "R" (retrieval) do RAG.
 */
@Service
public class MemoryService {

    /** Tamanho máximo de cada nota dentro do prompt. Muitas notas longas gastariam a janela de contexto. */
    static final int EXCERPT_CHARS = 600;

    /** O que a memória achou: as notas (para a tela) e o texto pronto para o system prompt. */
    public record Recall(List<Hit> hits, String prompt) {
        public static final Recall EMPTY = new Recall(List.of(), "");

        /** Versão enxuta para o frontend mostrar "Notas usadas". */
        public List<Map<String, Object>> forClient() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (Hit h : hits) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", h.note().getId());
                m.put("title", h.note().getTitle());
                m.put("score", Math.round(h.score() * 100) / 100.0);
                m.put("reason", h.reason() == NoteSearch.Reason.SIMILAR ? "similar" : "linked");
                if (h.via() != null) {
                    m.put("via", h.via());
                }
                out.add(m);
            }
            return out;
        }
    }

    private final NoteSearch search;
    private final MemoryProperties props;

    public MemoryService(NoteSearch search, MemoryProperties props) {
        this.search = search;
        this.props = props;
    }

    public boolean enabled() {
        return props.enabled();
    }

    public Recall recall(Long userId, List<Message> messages) {
        if (!props.enabled()) {
            return Recall.EMPTY;
        }
        List<Hit> hits = search.search(userId, queryOf(messages), props.topK(), props.neighbors());
        return hits.isEmpty() ? Recall.EMPTY : new Recall(hits, prompt(hits));
    }

    /**
     * A pergunta da busca: a última mensagem do usuário, mais a anterior
     * (respostas curtas como "e por quê?" sozinhas não dizem do que se trata).
     */
    static String queryOf(List<Message> messages) {
        List<String> userTexts = new ArrayList<>();
        for (int i = messages.size() - 1; i >= 0 && userTexts.size() < 2; i--) {
            Message m = messages.get(i);
            if ("user".equals(m.role()) && m.content() != null && !m.content().isBlank()) {
                userTexts.add(m.content());
            }
        }
        String query = String.join("\n", userTexts);
        return query.length() > 1000 ? query.substring(0, 1000) : query;
    }

    static String prompt(List<Hit> hits) {
        StringBuilder sb = new StringBuilder()
                .append("\n\n## Memoria do usuario\n")
                .append("Abaixo estao notas que o PROPRIO usuario escreveu no DeepThinker e que parecem ter relacao ")
                .append("com a conversa. Use-as para entender o que ele ja sabe e ja pensou. Quando usar uma nota, ")
                .append("cite pelo titulo entre colchetes duplos, ex.: [[Titulo]]. Se o que ele diz agora contradiz ")
                .append("uma nota, aponte a contradicao. Nao invente notas que nao estao aqui e ignore as que nao ")
                .append("forem relevantes.\n");
        for (Hit h : hits) {
            Note n = h.note();
            sb.append("\n### [[").append(n.getTitle()).append("]]");
            if (h.reason() == NoteSearch.Reason.LINKED && h.via() != null) {
                sb.append(" (ligada a [[").append(h.via()).append("]])");
            }
            sb.append("\n").append(excerpt(n)).append("\n");
        }
        return sb.toString();
    }

    static String excerpt(Note n) {
        String text = n.getSummary() != null && !n.getSummary().isBlank()
                ? n.getSummary() + "\n" + (n.getContent() == null ? "" : n.getContent())
                : (n.getContent() == null ? "" : n.getContent());
        text = text.strip();
        return text.length() > EXCERPT_CHARS ? text.substring(0, EXCERPT_CHARS) + "..." : text;
    }
}
