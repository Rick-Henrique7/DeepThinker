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
import java.util.stream.Collectors;
import java.util.stream.Stream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Plugin para a API da Anthropic (Claude), que tem formato próprio:
 * - endpoint /messages em vez de /chat/completions;
 * - a chave vai no header x-api-key;
 * - o prompt de sistema é um campo separado, não uma mensagem;
 * - o streaming manda eventos tipados (content_block_delta, ...);
 * - ferramentas usam input_schema em vez de parameters.
 *
 * Esta classe traduz tudo isso para o mesmo contrato LlmClient,
 * então o chat e o resumo nem sabem que estão falando com o Claude.
 */
public class AnthropicClient implements LlmClient {

    private static final String API_VERSION = "2023-06-01";
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final LlmPlugin plugin;
    private final String baseUrl;
    private final String apiKey;
    private final String defaultModel;
    private final Duration timeout;
    private final JsonMapper json;

    public AnthropicClient(LlmPlugin plugin, String baseUrl, String apiKey, String defaultModel,
                           Duration timeout, JsonMapper json) {
        this.plugin = plugin;
        this.baseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
        this.timeout = timeout;
        this.json = json;
    }

    @Override
    public LlmPlugin plugin() {
        return plugin;
    }

    @Override
    public boolean isAvailable() {
        return apiKey != null && !apiKey.isBlank() && !baseUrl.isEmpty();
    }

    @Override
    public String chat(List<Message> messages, String model, Options options) {
        requireKey();
        try {
            HttpResponse<String> res = HTTP.send(request(payload(messages, model, options, false, null)),
                    HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                throw LlmException.fromHttp(plugin.label(), res.statusCode(), res.body());
            }
            StringBuilder text = new StringBuilder();
            for (JsonNode block : json.readTree(res.body()).path("content")) {
                if ("text".equals(block.path("type").asString(""))) {
                    text.append(block.path("text").asString(""));
                }
            }
            return text.toString();
        } catch (IOException e) {
            throw new LlmException(plugin.label() + " não respondeu: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Requisição interrompida", e);
        }
    }

    @Override
    public List<ToolCall> stream(List<Message> messages, String model, Options options,
                                 List<Map<String, Object>> tools, Consumer<String> onText) {
        requireKey();
        // index do bloco -> [id, nome, json dos argumentos]
        Map<Integer, String[]> toolParts = new TreeMap<>();
        try {
            HttpResponse<Stream<String>> res = HTTP.send(request(payload(messages, model, options, true, tools)),
                    HttpResponse.BodyHandlers.ofLines());
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
        toolParts.values().forEach(p -> calls.add(
                new ToolCall(p[0], "function", new ToolCall.Function(p[1], p[2].isEmpty() ? "{}" : p[2]))));
        return calls;
    }

    /** Cada linha "data: {...}" traz um evento com um campo "type". */
    private void handleLine(String line, Consumer<String> onText, Map<Integer, String[]> toolParts) {
        if (!line.startsWith("data:")) {
            return; // linhas "event: ..." repetem o tipo que já vem dentro do JSON
        }
        JsonNode event = json.readTree(line.substring(5).trim());
        switch (event.path("type").asString("")) {
            case "content_block_start" -> {
                JsonNode block = event.path("content_block");
                if ("tool_use".equals(block.path("type").asString(""))) {
                    toolParts.put(event.path("index").asInt(),
                            new String[] {block.path("id").asString(""), block.path("name").asString(""), ""});
                }
            }
            case "content_block_delta" -> {
                JsonNode delta = event.path("delta");
                switch (delta.path("type").asString("")) {
                    case "text_delta" -> onText.accept(delta.path("text").asString(""));
                    case "input_json_delta" -> {
                        String[] parts = toolParts.get(event.path("index").asInt());
                        if (parts != null) {
                            parts[2] += delta.path("partial_json").asString("");
                        }
                    }
                    default -> { }
                }
            }
            case "error" -> throw new LlmException(event.path("error").path("message").asString("erro desconhecido"));
            default -> { }
        }
    }

    private String payload(List<Message> messages, String model, Options options, boolean stream,
                           List<Map<String, Object>> tools) {
        // O Claude recebe o prompt de sistema à parte; as outras mensagens vão em "messages".
        String system = messages.stream().filter(m -> "system".equals(m.role()))
                .map(Message::content).collect(Collectors.joining("\n\n"));
        List<Map<String, String>> chat = messages.stream()
                .filter(m -> !"system".equals(m.role()))
                .map(m -> Map.of("role", "assistant".equals(m.role()) ? "assistant" : "user", "content", m.content()))
                .toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model != null && !model.isBlank() ? model : defaultModel);
        body.put("max_tokens", options.maxTokens());
        if (!system.isEmpty()) {
            body.put("system", system);
        }
        body.put("messages", chat);
        body.put("stream", stream);
        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools.stream().map(AnthropicClient::toAnthropicTool).toList());
        }
        return json.writeValueAsString(body);
    }

    /** {type, function:{name, description, parameters}} -> {name, description, input_schema}. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> toAnthropicTool(Map<String, Object> openAiTool) {
        Map<String, Object> fn = (Map<String, Object>) openAiTool.get("function");
        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("name", fn.get("name"));
        tool.put("description", fn.get("description"));
        tool.put("input_schema", fn.get("parameters"));
        return tool;
    }

    private HttpRequest request(String body) {
        return HttpRequest.newBuilder(URI.create(baseUrl + "/messages"))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", API_VERSION)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
    }

    private void requireKey() {
        if (!isAvailable()) {
            throw new LlmException("API key de " + plugin.label() + " não configurada. Defina em Configurações.");
        }
    }
}
