package com.deepthinker.chat;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * Um provedor de IA "de mentira" para os testes: responde como a API da OpenAI
 * (em /v1/chat/completions) e como a da Anthropic (em /v1/messages),
 * sem precisar de IA de verdade nem de internet. Usa o servidor HTTP que vem no JDK.
 */
public final class FakeLlmServer {

    /** Resposta não-streaming usada pelo resumo (com ```json para testar o parser tolerante). */
    static final String SUMMARY = "```json\\n{\\\"title\\\":\\\"Resumo do teste\\\",\\\"summary\\\":\\\"Duas frases.\\\","
            + "\\\"key_points\\\":[{\\\"key\\\":\\\"ideia existente\\\",\\\"detail\\\":\\\"ja existia\\\"},"
            + "{\\\"key\\\":\\\"Ideia nova\\\",\\\"detail\\\":\\\"detalhe novo\\\"}]}\\n```";

    /**
     * Roteiro do "Resumo em áudio", de propósito com sujeira que o Java precisa limpar:
     * **negrito**, [[link|apelido]], "bruno:" em minúsculas, uma fala sem nome e uma fala vazia.
     */
    static final String AUDIO = "{\\\"title\\\":\\\"Semana de ideias\\\",\\\"lines\\\":["
            + "{\\\"speaker\\\":\\\"Ana\\\",\\\"text\\\":\\\"Esta semana voce pensou em **lojas**.\\\"},"
            + "{\\\"speaker\\\":\\\"bruno:\\\",\\\"text\\\":\\\"Mas sera que [[Medo de falir|o medo]] faz sentido?\\\"},"
            + "{\\\"text\\\":\\\"Sem nome, a fala alterna.\\\"},"
            + "{\\\"speaker\\\":\\\"Ana\\\",\\\"text\\\":\\\"   \\\"}]}";

    /** Texto corrido, sem JSON (para testar o plano B do roteiro). */
    static final String AUDIO_PLAIN = "Nesta semana voce escreveu sobre abrir uma loja e sobre o medo de errar. "
            + "As duas ideias conversam entre si.\\n\\nUma pergunta para o caminho: o que voce faria se soubesse "
            + "que nao vai dar errado?";

    private static HttpServer server;

    /** Corpo do último pedido de chat em streaming (para os testes conferirem o prompt enviado). */
    public static volatile String lastStreamBody;

    private FakeLlmServer() {
    }

    public static synchronized String start() {
        if (server == null) {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
            server.createContext("/v1/models", ex -> write(ex, 200, "application/json", "{\"data\":[{\"id\":\"fake\"}]}"));
            server.createContext("/v1/chat/completions", FakeLlmServer::completions);
            server.createContext("/v1/messages", FakeLlmServer::anthropic);
            server.createContext("/v1/embeddings", FakeLlmServer::embeddings);
            server.start();
        }
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
    }

    private static void completions(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        if (!body.contains("\"stream\":true")) {
            // Se o texto enviado contém SEM_JSON, a IA "erra" o formato (para testar o plano B).
            String content = body.contains("SEM_JSON") ? "Desculpe, nao consegui." : SUMMARY;
            // Pedido de diagrama: devolve Mermaid dentro de ```mermaid, como muitos modelos fazem.
            if (body.contains("diagramas Mermaid")) {
                content = body.contains("SEM_DIAGRAMA") ? "Aqui esta: um diagrama bonito."
                        : "```mermaid\\nmindmap\\n  root((Teste))\\n    Pros\\n```";
            }
            // Pedido de roteiro de áudio: JSON com falas, texto corrido (SEM_ROTEIRO) ou quase nada.
            if (body.contains("escreve roteiros")) {
                content = body.contains("SEM_ROTEIRO") ? AUDIO_PLAIN : body.contains("ROTEIRO_VAZIO") ? "Desculpe." : AUDIO;
            }
            write(ex, 200, "application/json",
                    "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"" + content + "\"}}]}");
            return;
        }
        lastStreamBody = body;
        StringBuilder sse = new StringBuilder()
                .append("data: {\"choices\":[{\"delta\":{\"content\":\"Olá\"}}]}\n\n")
                .append("data: {\"choices\":[{\"delta\":{\"content\":\", mundo\"}}]}\n\n");
        if (body.contains("\"tools\"")) {
            // O pedido de ferramenta chega picado em vários eventos, como na API real.
            sse.append("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\","
                            + "\"function\":{\"name\":\"create_note\",\"arguments\":\"{\\\"title\\\":\\\"Nota da IA\\\",\"}}]}}]}\n\n")
               .append("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,"
                            + "\"function\":{\"arguments\":\"\\\"content\\\":\\\"Criada pela ferramenta\\\"}\"}}]}}]}\n\n");
        }
        sse.append("data: [DONE]\n\n");
        write(ex, 200, "text/event-stream", sse.toString());
    }

    /**
     * Embeddings "de mentira" no formato da OpenAI: cada palavra soma 1 numa de 16 posições.
     * Textos com palavras em comum ficam parecidos, o suficiente para testar a memória.
     */
    private static void embeddings(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        java.util.regex.Matcher input = java.util.regex.Pattern.compile("\"input\":\\[(.*)]").matcher(body);
        if (!input.find()) {
            write(ex, 400, "application/json", "{\"error\":\"sem input\"}");
            return;
        }
        java.util.regex.Matcher str = java.util.regex.Pattern.compile("\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(input.group(1));
        StringBuilder data = new StringBuilder();
        int index = 0;
        while (str.find()) {
            double[] v = new double[16];
            for (String w : str.group(1).toLowerCase().split("[^\\p{L}]+")) {
                if (w.length() > 3) {
                    v[Math.floorMod(w.hashCode(), 16)] += 1;
                }
            }
            StringBuilder nums = new StringBuilder();
            for (int i = 0; i < v.length; i++) {
                nums.append(i == 0 ? "" : ",").append(v[i]);
            }
            data.append(index == 0 ? "" : ",")
                    .append("{\"index\":").append(index++).append(",\"embedding\":[").append(nums).append("]}");
        }
        write(ex, 200, "application/json", "{\"data\":[" + data + "]}");
    }

    /** Formato da Anthropic: eventos tipados e o texto dentro de content_block_delta. */
    private static void anthropic(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        if (ex.getRequestHeaders().getFirst("x-api-key") == null
                || (body.contains("\"stream\":true") && !body.contains("\"system\""))) {
            write(ex, 400, "application/json", "{\"type\":\"error\",\"error\":{\"message\":\"faltou x-api-key ou system\"}}");
            return;
        }
        if (!body.contains("\"stream\":true")) {
            write(ex, 200, "application/json", "{\"content\":[{\"type\":\"text\",\"text\":\"" + SUMMARY + "\"}]}");
            return;
        }
        StringBuilder sse = new StringBuilder()
                .append("event: message_start\ndata: {\"type\":\"message_start\"}\n\n")
                .append("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,"
                        + "\"delta\":{\"type\":\"text_delta\",\"text\":\"Oi do Claude\"}}\n\n");
        if (body.contains("\"input_schema\"")) {
            sse.append("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,"
                            + "\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"create_note\",\"input\":{}}}\n\n")
               .append("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,"
                            + "\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"title\\\":\\\"Nota do Claude\\\",\"}}\n\n")
               .append("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,"
                            + "\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"content\\\":\\\"via tool_use\\\"}\"}}\n\n");
        }
        sse.append("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
        write(ex, 200, "text/event-stream", sse.toString());
    }

    private static void write(HttpExchange ex, int status, String type, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
