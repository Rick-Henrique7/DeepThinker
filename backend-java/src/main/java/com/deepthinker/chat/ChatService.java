package com.deepthinker.chat;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.llm.LlmClient;
import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.llm.ToolCall;
import com.deepthinker.memory.MemoryService;
import com.deepthinker.memory.MemoryService.Recall;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * A conversa com o Advogado do Diabo: monta o prompt do modo escolhido,
 * transmite a resposta em pedaços e executa as ferramentas que a IA pedir.
 * Cada "evento" é um Map que o controller transforma numa linha SSE.
 *
 * Com a memória ligada, antes de chamar a IA busca as notas do usuário parecidas
 * com a conversa e coloca no system prompt (RAG). As notas usadas vão para a tela
 * num evento {"memory": [...]} antes do texto.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    /** Mensagens que o frontend usa só para desenhar a tela; não vão para a IA. */
    static final String UI_ONLY_PREFIX = "__memory__";

    private final ToolRegistry tools;
    private final JsonMapper json;
    private final MemoryService memory;

    public ChatService(ToolRegistry tools, JsonMapper json, MemoryService memory) {
        this.tools = tools;
        this.json = json;
        this.memory = memory;
    }

    public void stream(LlmClient llm, List<Message> messages, String mode, String model,
                       boolean toolsEnabled, boolean memoryEnabled, Consumer<Map<String, Object>> emit) {
        String provider = llm.plugin().id();
        List<Message> conversation = messages.stream()
                .filter(m -> m.content() == null || !m.content().startsWith(UI_ONLY_PREFIX))
                .toList();

        String system = systemPrompt(mode, toolsEnabled);
        if (memoryEnabled) {
            Recall recall = recall(conversation);
            if (!recall.hits().isEmpty()) {
                system += recall.prompt();
                emit.accept(Map.of("memory", recall.forClient()));
            }
        }

        List<Message> full = new ArrayList<>();
        full.add(new Message("system", system));
        full.addAll(conversation);

        List<ToolCall> calls = llm.stream(full, model, LlmClient.Options.DEFAULT,
                toolsEnabled ? tools.catalog() : null,
                chunk -> emit.accept(Map.of("chunk", chunk, "provider", provider)));

        for (ToolCall call : calls) {
            emit.accept(Map.of("tool_call", call, "provider", provider));
            emit.accept(Map.of("tool_result", runTool(call)));
        }
        emit.accept(Map.of("done", true));
    }

    /** A memória ajuda, mas nunca pode derrubar a conversa: se falhar, a IA responde sem ela. */
    private Recall recall(List<Message> conversation) {
        try {
            return memory.recall(CurrentUser.id(), conversation);
        } catch (RuntimeException e) {
            log.warn("Memoria: busca falhou, respondendo sem ela: {}", e.getMessage());
            return Recall.EMPTY;
        }
    }

    private Map<String, Object> runTool(ToolCall call) {
        String name = call.function().name();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("call_id", call.id() == null ? "" : call.id());
        result.put("name", name);
        if (!tools.names().contains(name)) {
            result.put("ok", false);
            result.put("error", "Tool desconhecida: " + name);
            return result;
        }
        try {
            Map<String, Object> args = parseArgs(call.function().arguments());
            result.put("ok", true);
            result.put("result", tools.execute(name, args));
        } catch (RuntimeException e) {
            result.put("ok", false);
            result.put("error", e.getMessage());
        }
        return result;
    }

    private Map<String, Object> parseArgs(String raw) {
        try {
            Map<String, Object> args = json.readValue(raw == null || raw.isBlank() ? "{}" : raw, new TypeReference<>() {});
            return args == null ? Map.of() : args;
        } catch (RuntimeException e) {
            return Map.of(); // a IA mandou JSON inválido: segue como sem argumentos, igual ao Laravel
        }
    }

    static String systemPrompt(String mode, boolean toolsEnabled) {
        String base = "Voce e o Advogado do Diabo do DeepThinker, um assistente que ajuda o usuario a pensar com mais "
                + "profundidade. Responda em portugues do Brasil, de forma clara e direta.";
        String role = switch (mode == null ? "socratic" : mode) {
            case "critic" -> "Seu papel e encontrar falhas, vieses e pontos fracos nos argumentos do usuario. "
                    + "Seja implacavel mas construtivo.";
            case "brainstorm" -> "Seu papel e expandir horizontes: gere alternativas, conexoes inesperadas e "
                    + "perguntas provocativas. Sem julgamento, foco em volume de ideias.";
            default -> "Seu papel e guiar o pensamento do usuario com perguntas socraticas: nao de respostas, faca "
                    + "perguntas que estimulem a reflexao e revelem contradicoes.";
        };
        String toolHint = toolsEnabled
                ? "\n\nVoce tem acesso a ferramenta `create_note(title, content, summary)`. Use SOMENTE quando o "
                        + "usuario pedir explicitamente para salvar algo OU quando voce identificar uma ideia madura "
                        + "o suficiente que valha virar nota. NAO use para mensagens triviais."
                : "";
        return base + " " + role + toolHint;
    }
}
