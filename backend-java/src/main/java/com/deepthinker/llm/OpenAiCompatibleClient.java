package com.deepthinker.llm;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.stream.Stream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Plugin para qualquer API compatível com a OpenAI (Chat Completions):
 * OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral, LM Studio e o "Personalizado".
 * Todos falam o mesmo protocolo; só mudam o endereço, a chave e o modelo.
 *
 * Usa o HttpClient que já vem no Java (java.net.http), sem biblioteca extra.
 */
public class OpenAiCompatibleClient implements LlmClient {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final LlmPlugin plugin;
    private final String baseUrl;
    private final String apiKey;
    private final String organization;
    private final String defaultModel;
    private final Duration timeout;
    private final JsonMapper json;

    public OpenAiCompatibleClient(LlmPlugin plugin, String baseUrl, String apiKey, String organization,
                                  String defaultModel, Duration timeout, JsonMapper json) {
        this.plugin = plugin;
        this.baseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey;
        this.organization = organization;
        this.defaultModel = defaultModel;
        this.timeout = timeout;
        this.json = json;
    }

    @Override
    public LlmPlugin plugin() {
        return plugin;
    }

    /** Provedores na nuvem: basta ter a chave. Local/personalizado sem chave: precisa responder em /models. */
    @Override
    public boolean isAvailable() {
        if (baseUrl.isEmpty()) {
            return false;
        }
        if (plugin.requiresApiKey()) {
            return apiKey != null && !apiKey.isBlank();
        }
        try {
            HttpRequest req = base("/models").timeout(Duration.ofSeconds(2)).GET().build();
            return HTTP.send(req, HttpResponse.BodyHandlers.discarding()).statusCode() / 100 == 2;
        } catch (IOException | IllegalArgumentException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    @Override
    public String chat(List<Message> messages, String model, Options options) {
        requireReady();
        HttpRequest req = base("/chat/completions")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload(messages, model, options, false, null)))
                .build();
        try {
            HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                throw LlmException.fromHttp(plugin.label(), res.statusCode(), res.body());
            }
            return json.readTree(res.body()).path("choices").path(0).path("message").path("content").asString("");
        } catch (IOException e) {
            throw new LlmException(plugin.label() + " não respondeu: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Requisição interrompida", e);
        }
    }

    /**
     * Streaming: chama onText a cada pedaço de texto assim que ele chega.
     * Pedidos de ferramenta chegam picados em vários eventos; juntamos tudo
     * e devolvemos no final, como o Laravel fazia.
     */
    @Override
    public List<ToolCall> stream(List<Message> messages, String model, Options options,
                                 List<Map<String, Object>> tools, Consumer<String> onText) {
        requireReady();
        HttpRequest req = base("/chat/completions")
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(payload(messages, model, options, true, tools)))
                .build();

        // TreeMap mantém os tool calls na ordem do "index" que a API manda.
        Map<Integer, String[]> toolParts = new TreeMap<>();
        try {
            HttpResponse<Stream<String>> res = HTTP.send(req, HttpResponse.BodyHandlers.ofLines());
            if (res.statusCode() / 100 != 2) {
                String body = String.join("\n", res.body().toList());
                throw LlmException.fromHttp(plugin.label(), res.statusCode(), body);
            }
            try (Stream<String> lines = res.body()) {
                lines.forEach(line -> handleLine(line.trim(), onText, toolParts));
            }
        } catch (IOException e) {
            throw new LlmException(plugin.label() + " stream falhou: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Stream interrompido", e);
        }

        List<ToolCall> calls = new ArrayList<>();
        toolParts.values().forEach(p -> calls.add(new ToolCall(p[0], "function", new ToolCall.Function(p[1], p[2]))));
        return calls;
    }

    /** Processa uma linha "data: {...}" do stream SSE do provedor. */
    private void handleLine(String line, Consumer<String> onText, Map<Integer, String[]> toolParts) {
        if (!line.startsWith("data:")) {
            return;
        }
        String data = line.substring(5).trim();
        if (data.isEmpty() || data.equals("[DONE]")) {
            return;
        }
        JsonNode event = json.readTree(data);
        if (event.has("error")) {
            JsonNode err = event.get("error");
            throw new LlmException(err.isString() ? err.asString() : err.path("message").asString("erro desconhecido"));
        }
        JsonNode delta = event.path("choices").path(0).path("delta");
        String content = delta.path("content").asString("");
        if (!content.isEmpty()) {
            onText.accept(content);
        }
        for (JsonNode tc : delta.path("tool_calls")) {
            String[] parts = toolParts.computeIfAbsent(tc.path("index").asInt(0), i -> new String[] {null, "", ""});
            if (tc.hasNonNull("id")) {
                parts[0] = tc.get("id").asString();
            }
            parts[1] += tc.path("function").path("name").asString("");
            parts[2] += tc.path("function").path("arguments").asString("");
        }
    }

    private String payload(List<Message> messages, String model, Options options, boolean stream,
                           List<Map<String, Object>> tools) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model != null && !model.isBlank() ? model : defaultModel);
        body.put("messages", messages);
        body.put("stream", stream);
        body.put("temperature", options.temperature());
        body.put("max_tokens", options.maxTokens());
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
            body.put("tool_choice", "auto");
        }
        return json.writeValueAsString(body);
    }

    private HttpRequest.Builder base(String path) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(timeout);
        if (apiKey != null && !apiKey.isBlank()) {
            b.header("Authorization", "Bearer " + apiKey);
        }
        if (organization != null && !organization.isBlank()) {
            b.header("OpenAI-Organization", organization);
        }
        return b;
    }

    private void requireReady() {
        if (baseUrl.isEmpty()) {
            throw new LlmException("Informe o endereço da API de " + plugin.label() + " em Configurações.");
        }
        if (plugin.requiresApiKey() && (apiKey == null || apiKey.isBlank())) {
            throw new LlmException("API key de " + plugin.label() + " não configurada. Defina em Configurações.");
        }
    }
}
