package com.deepthinker.memory;

import dev.langchain4j.model.embedding.onnx.OnnxEmbeddingModel;
import dev.langchain4j.model.embedding.onnx.PoolingMode;
import java.nio.file.Path;

/**
 * Modelo de embeddings de verdade rodando dentro do Java, pelo ONNX Runtime
 * (o mesmo motor que a Microsoft usa para rodar modelos sem Python).
 *
 * A LangChain4j cuida da parte chata: quebrar o texto em tokens (tokenizer.json),
 * rodar a rede neural e fazer a média dos vetores dos tokens ("mean pooling").
 */
public class OnnxEmbedder implements Embedder {

    private final String id;
    private final OnnxEmbeddingModel model;
    private final String queryPrefix;
    private final String passagePrefix;
    private final double minScore;
    private final double margin;

    public OnnxEmbedder(String id, Path modelFile, Path tokenizerFile,
                        String queryPrefix, String passagePrefix, double minScore, double margin) {
        this.id = id;
        this.model = new OnnxEmbeddingModel(modelFile, tokenizerFile, PoolingMode.MEAN);
        this.queryPrefix = queryPrefix == null ? "" : queryPrefix;
        this.passagePrefix = passagePrefix == null ? "" : passagePrefix;
        this.minScore = minScore;
        this.margin = margin;
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
        return embed(passagePrefix + text);
    }

    @Override
    public float[] embedQuery(String text) {
        return embed(queryPrefix + text);
    }

    @Override
    public double minScore() {
        return minScore;
    }

    @Override
    public double margin() {
        return margin;
    }

    private float[] embed(String text) {
        String safe = text == null || text.isBlank() ? "." : text;
        return Embedder.normalize(model.embed(safe).content().vector());
    }
}
