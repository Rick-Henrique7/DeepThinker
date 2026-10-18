package com.deepthinker.memory;

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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Embeddings por API, no formato da OpenAI (POST {base}/embeddings).
 * OpenAI, Gemini, Mistral, Ollama e LM Studio aceitam esse mesmo formato,
 * então esta classe atende todos: só mudam endereço, chave e modelo.
 *
 * Manda vários textos de uma vez ("batch"): indexar 1000 notas vira ~30 chamadas, não 1000.
 */
public class RemoteEmbedder implements Embedder {

    static final int BATCH = 32;

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private final String id;
    private final String label;
    private final String baseUrl;
    private final String apiKey;
    private final String model;
    private final double floor;
    private final double margin;
    private final JsonMapper json;

    public RemoteEmbedder(EmbeddingOption option, String baseUrl, String apiKey, String model, JsonMapper json) {
        String fullId = option.id() + ":" + model;
        this.id = fullId.length() > 64 ? fullId.substring(0, 64) : fullId; // cabe na coluna note_embeddings.model
        this.label = option.label();
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey;
        this.model = model;
        this.floor = option.floor();
        this.margin = option.margin();
        this.json = json;
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public boolean semantic() {
        return true;
    }

    @Override
    public float[] embedPassage(String text) {
        return embedAll(List.of(text)).getFirst();
    }

    @Override
    public float[] embedQuery(String text) {
        return embedAll(List.of(text)).getFirst();
    }

    @Override
    public List<float[]> embedPassages(List<String> texts) {
        return embedAll(texts);
    }

    @Override
    public double minScore() {
        return floor;
    }

    @Override
    public double margin() {
        return margin;
    }

    private List<float[]> embedAll(List<String> texts) {
        List<float[]> out = new ArrayList<>(texts.size());
        for (int i = 0; i < texts.size(); i += BATCH) {
            out.addAll(call(texts.subList(i, Math.min(texts.size(), i + BATCH))));
        }
        return out;
    }

    private List<float[]> call(List<String> texts) {
        List<String> safe = texts.stream().map(t -> t == null || t.isBlank() ? "." : t).toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("input", safe);
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(baseUrl + "/embeddings"))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        if (apiKey != null && !apiKey.isBlank()) {
            req.header("Authorization", "Bearer " + apiKey);
        }
        HttpResponse<String> res;
        try {
            res = HTTP.send(req.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new IllegalStateException(label + " não respondeu em " + baseUrl + " (" + e.getMessage() + ").");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrompido.");
        }
        if (res.statusCode() / 100 != 2) {
            String hint = switch (res.statusCode()) {
                case 401, 403 -> " Confira a API key.";
                case 404 -> " Confira o nome do modelo (" + model + ") e o endereço.";
                case 429 -> " Limite de uso atingido; tente de novo mais tarde.";
                default -> "";
            };
            String detail = res.body() == null ? "" : res.body().substring(0, Math.min(200, res.body().length()));
            throw new IllegalStateException(label + " respondeu HTTP " + res.statusCode() + "." + hint + " " + detail);
        }
        JsonNode data = json.readTree(res.body()).path("data");
        float[][] vectors = new float[safe.size()][];
        for (int i = 0; i < data.size(); i++) {
            JsonNode item = data.get(i);
            int index = item.has("index") ? item.get("index").asInt() : i; // a API pode devolver fora de ordem
            JsonNode emb = item.path("embedding");
            float[] v = new float[emb.size()];
            for (int j = 0; j < v.length; j++) {
                v[j] = (float) emb.get(j).asDouble();
            }
            vectors[index] = Embedder.normalize(v);
        }
        for (float[] v : vectors) {
            if (v == null || v.length == 0) {
                throw new IllegalStateException(label + " devolveu menos vetores do que textos enviados.");
            }
        }
        return List.of(vectors);
    }
}
