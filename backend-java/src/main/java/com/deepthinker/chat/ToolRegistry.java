package com.deepthinker.chat;

import com.deepthinker.note.Note;
import com.deepthinker.note.NoteService;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Ferramentas que o Advogado do Diabo pode chamar durante a conversa.
 * O catálogo segue o formato de "function calling" da OpenAI: a IA lê a descrição
 * e decide sozinha quando chamar. Hoje só existe create_note.
 */
@Component
public class ToolRegistry {

    private final NoteService notes;

    public ToolRegistry(NoteService notes) {
        this.notes = notes;
    }

    public List<Map<String, Object>> catalog() {
        return List.of(Map.of(
                "type", "function",
                "function", Map.of(
                        "name", "create_note",
                        "description", "Cria uma nota no grafo de conhecimento do DeepThinker. Use quando o usuario "
                                + "disser explicitamente que quer salvar algo, ou quando identificar uma "
                                + "ideia/decision/conceito importante durante a conversa.",
                        "parameters", Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "title", Map.of("type", "string", "description",
                                                "Titulo curto em portugues (max ~60 chars). Idealmente 2-4 palavras. "
                                                        + "Ex: \"Medo de falir\", \"Capital inicial\"."),
                                        "content", Map.of("type", "string", "description",
                                                "Conteudo principal da nota. Pode ser 1-3 paragrafos explicando a ideia."),
                                        "summary", Map.of("type", "string", "description",
                                                "Resumo em 1 frase da nota (opcional).")),
                                "required", List.of("title", "content")))));
    }

    public Set<String> names() {
        return Set.of("create_note");
    }

    /** Executa a ferramenta pedida pela IA. Lança exceção se algo der errado. */
    public Map<String, Object> execute(String name, Map<String, Object> args) {
        if (!"create_note".equals(name)) {
            throw new IllegalArgumentException("Tool desconhecida: " + name);
        }
        return createNote(args);
    }

    private Map<String, Object> createNote(Map<String, Object> args) {
        String title = truncate(String.valueOf(args.getOrDefault("title", "Nota sem titulo")).trim(), 255);
        String content = String.valueOf(args.getOrDefault("content", ""));
        Object summaryArg = args.get("summary");
        String summary = summaryArg == null ? null : truncate(summaryArg.toString(), 500);
        if (title.isEmpty() || content.isEmpty()) {
            return Map.of("error", "title e content sao obrigatorios");
        }

        Note note = notes.createWithSource(title, content, summary, "conversation", Map.of(
                "created_via", "tool_call",
                "created_at_tool", Instant.now().toString()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("note_id", note.getId());
        out.put("title", note.getTitle());
        out.put("message", "Nota #" + note.getId() + " '" + note.getTitle() + "' criada.");
        return out;
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
