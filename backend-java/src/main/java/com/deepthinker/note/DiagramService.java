package com.deepthinker.note;

import com.deepthinker.common.ValidationException;
import com.deepthinker.llm.LlmClient;
import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.llm.LlmClientFactory;
import com.deepthinker.llm.LlmException;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * "Transformar em diagrama": pede para a IA desenhar um texto (uma nota ou uma conversa
 * com o Advogado do Diabo) em Mermaid, a linguagem de diagramas que o Obsidian usa.
 *
 * A IA devolve só texto, por exemplo:
 *   mindmap
 *     root((Abrir uma loja))
 *       Prós
 *         Renda própria
 * e o frontend transforma esse texto em desenho com a biblioteca mermaid.js.
 */
@Service
public class DiagramService {

    public record DiagramRequest(Long noteId, String text, String kind, String model) {
    }

    public record DiagramResult(String mermaid) {
    }

    /** Tipos de diagrama que aceitamos de volta. Qualquer outra coisa é resposta quebrada da IA. */
    private static final List<String> KINDS = List.of("mindmap", "flowchart", "graph", "timeline");
    private static final Pattern FENCE = Pattern.compile("```(?:mermaid)?\\s*\\n(.*?)```", Pattern.DOTALL);

    private final LlmClientFactory clients;
    private final NoteService noteService;

    public DiagramService(LlmClientFactory clients, NoteService noteService) {
        this.clients = clients;
        this.noteService = noteService;
    }

    public DiagramResult diagram(DiagramRequest req) {
        String text;
        boolean document = false;
        if (req.noteId() != null) {
            NoteDtos.NoteDetail note = noteService.show(req.noteId());
            // O mapa mental antigo (se houver) não entra no texto: a IA desenharia o desenho.
            String content = NoteSections.withSection(note.content(), MINDMAP_SECTION, null);
            text = "# " + note.title() + "\n\n" + content;
            document = "document".equals(note.sourceType());
        } else if (req.text() != null && !req.text().isBlank()) {
            text = req.text();
        } else {
            throw ValidationException.of("text", "Envie note_id ou text.");
        }
        String kind = "flowchart".equals(req.kind()) ? "flowchart" : "mindmap";
        String howTo;
        if ("flowchart".equals(kind)) {
            howTo = "Use um fluxograma (flowchart TD) mostrando como uma ideia leva à outra.";
        } else if (document) {
            // Documento não é debate: o mapa mostra do que ele trata, assunto por assunto.
            howTo = "Use um mapa mental (mindmap): o tema do documento na raiz, os assuntos principais como "
                    + "ramos e as ideias mais importantes de cada assunto como sub-ramos.";
        } else {
            howTo = "Use um mapa mental (mindmap): a ideia central na raiz, os argumentos a favor, contra e as "
                    + "perguntas em aberto como ramos.";
        }

        String prompt = "Você desenha diagramas Mermaid para o Deep thinker.\n\n"
                + "Leia o texto abaixo e resuma o raciocínio num diagrama. " + howTo + "\n"
                + "Regras:\n"
                + "- Responda APENAS com o código Mermaid, sem explicação.\n"
                + "- No máximo 20 nós, cada um com até 6 palavras, em português.\n"
                + "- Não use aspas, parênteses, colchetes nem dois-pontos dentro dos textos dos nós.\n\n"
                + "Texto:\n---\n" + KnowledgeExtractor.truncateForLlm(text, "texto truncado") + "\n---";

        LlmClient llm = clients.active();
        List<Message> ask = List.of(new Message("user", prompt));
        LlmClient.Options options = new LlmClient.Options(0.3, 2048);
        String raw;
        try {
            raw = llm.chat(ask, req.model(), options);
        } catch (LlmException first) {
            if (!first.isRetryable()) {
                throw first;
            }
            raw = llm.chat(ask, req.model(), options);
        }
        String code = clean(raw);
        if (code == null) {
            throw ValidationException.of("text", "A IA não devolveu um diagrama válido. Tente de novo.");
        }
        return new DiagramResult(code);
    }

    static final String MINDMAP_SECTION = "Mapa mental";

    /**
     * "Mapa mental do documento" (ideia do NotebookLM): desenha o mapa e grava na própria nota,
     * na seção "## Mapa mental", no topo (é a visão geral; o texto do documento vem depois).
     * Gerar de novo troca o mapa antigo, que fica no histórico de versões.
     * A IA roda fora de transação; só a gravação no fim é transacional.
     */
    public NoteDtos.NoteDetail mindmapIntoNote(Long noteId) {
        DiagramResult result = diagram(new DiagramRequest(noteId, null, "mindmap", null));
        return noteService.putSection(noteId, MINDMAP_SECTION, "```mermaid\n" + result.mermaid() + "\n```", true,
                "mapa-mental");
    }

    /** Tira o ```mermaid ... ``` que alguns modelos colocam e confere se começa com um tipo conhecido. */
    static String clean(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher m = FENCE.matcher(raw);
        String code = (m.find() ? m.group(1) : raw).strip();
        String first = code.split("\\s+", 2)[0].toLowerCase(java.util.Locale.ROOT);
        return KINDS.contains(first) ? code : null;
    }
}
