package com.deepthinker.chat;

import com.deepthinker.llm.LlmClient;
import com.deepthinker.llm.LlmClient.Message;
import com.deepthinker.llm.LlmClientFactory;
import com.deepthinker.llm.LlmPlugin;
import com.deepthinker.llm.LlmSettingsService;
import com.deepthinker.llm.PluginCatalog;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.concurrent.DelegatingSecurityContextRunnable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Endpoints do Advogado do Diabo.
 *
 * O chat usa SSE (Server-Sent Events): a resposta HTTP fica aberta e o servidor
 * vai escrevendo linhas "data: {...}" conforme a IA gera o texto. O SseEmitter
 * do Spring cuida do formato; nós só chamamos emitter.send(...).
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    /** Corpo de POST /api/chat/stream (mesmos campos que o frontend já manda). */
    public record StreamRequest(
            List<Message> messages,
            String message,
            String mode,
            String provider,
            String model,
            Boolean toolsEnabled,
            String sessionId,
            Long noteId,
            Boolean memoryEnabled) {
    }

    // Uma thread virtual por conversa: barata, e não segura as threads do servidor.
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    private final ChatService chat;
    private final ToolRegistry tools;
    private final LlmClientFactory clients;
    private final LlmSettingsService settings;
    private final PluginCatalog catalog;

    public ChatController(ChatService chat, ToolRegistry tools, LlmClientFactory clients,
                          LlmSettingsService settings, PluginCatalog catalog) {
        this.chat = chat;
        this.tools = tools;
        this.clients = clients;
        this.settings = settings;
        this.catalog = catalog;
    }

    @RequestMapping(value = "/stream", method = {RequestMethod.GET, RequestMethod.POST},
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream(@RequestBody(required = false) StreamRequest req) {
        List<Message> messages = messagesOf(req);
        if (messages.isEmpty()) {
            return single(HttpStatus.BAD_REQUEST, Map.of("error", "Nenhuma mensagem fornecida."));
        }

        LlmClient llm = clients.forId(req.provider());
        LlmPlugin plugin = llm.plugin();
        if (!llm.isAvailable()) {
            String hint = plugin.requiresApiKey()
                    ? "Defina a API key em Configurações → IA."
                    : "Verifique se o endereço configurado está no ar.";
            return single(HttpStatus.SERVICE_UNAVAILABLE,
                    Map.of("error", plugin.label() + " indisponível. " + hint));
        }

        SseEmitter emitter = new SseEmitter(0L); // 0 = sem limite de tempo; quem limita é o timeout da IA
        boolean toolsEnabled = Boolean.TRUE.equals(req.toolsEnabled());
        // Memória ligada por padrão; o frontend manda memory_enabled=false para desligar
        boolean memoryEnabled = !Boolean.FALSE.equals(req.memoryEnabled());
        // O usuário logado fica guardado na thread da requisição. A IA roda em outra thread,
        // então o DelegatingSecurityContextRunnable copia o login para lá (a ferramenta
        // create_note precisa saber de quem é a nota).
        executor.execute(new DelegatingSecurityContextRunnable(() -> {
            try {
                chat.stream(llm, messages, req.mode(), req.model(), toolsEnabled, memoryEnabled,
                        event -> send(emitter, event));
            } catch (RuntimeException e) {
                send(emitter, Map.of("error", e.getMessage() == null ? "Erro desconhecido" : e.getMessage()));
            }
            emitter.complete();
        }));

        return ResponseEntity.ok()
                .header("Cache-Control", "no-cache")
                .header("X-Accel-Buffering", "no") // pede ao Nginx para não segurar o stream
                .header("X-Provider", plugin.id())
                .body(emitter);
    }

    @GetMapping("/providers")
    public Map<String, Object> providers() {
        Map<String, Object> available = new LinkedHashMap<>();
        for (LlmPlugin p : catalog.all()) {
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("label", p.label());
            info.put("available", clients.forPlugin(p).isAvailable());
            info.put("models", p.models());
            info.put("default_model", settings.get(p, "model"));
            available.put(p.id(), info);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("default", settings.activePlugin().id());
        out.put("providers", available);
        return out;
    }

    @GetMapping("/tools")
    public Map<String, Object> tools() {
        return Map.of("tools", tools.catalog(), "handlers", tools.names());
    }

    private static List<Message> messagesOf(StreamRequest req) {
        if (req == null) {
            return List.of();
        }
        if (req.messages() != null && !req.messages().isEmpty()) {
            return new ArrayList<>(req.messages());
        }
        if (req.message() != null && !req.message().isBlank()) {
            return List.of(new Message("user", req.message()));
        }
        return List.of();
    }

    /** Resposta SSE com um único evento (usada para erros antes de começar). */
    private static ResponseEntity<SseEmitter> single(HttpStatus status, Map<String, Object> event) {
        SseEmitter emitter = new SseEmitter();
        send(emitter, event);
        emitter.complete();
        return ResponseEntity.status(status).body(emitter);
    }

    private static void send(SseEmitter emitter, Map<String, Object> event) {
        try {
            emitter.send(SseEmitter.event().data(event, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            // o navegador fechou a conexão (usuário saiu da página); nada a fazer
        }
    }
}
