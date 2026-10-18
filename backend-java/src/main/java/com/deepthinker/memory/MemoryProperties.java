package com.deepthinker.memory;

import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuração da memória da IA (bloco deepthinker.memory do application.yml).
 *
 * modelDir:       pasta com model.onnx e tokenizer.json do modelo de embeddings.
 * autoDownload:   se a pasta estiver vazia, baixa o modelo de modelUrl/tokenizerUrl na primeira vez.
 * queryPrefix /
 * passagePrefix:  a família e5 foi treinada com "query: " na pergunta e "passage: " no documento.
 * minScore:       similaridade mínima (0 a 1) para uma nota entrar no contexto (modelo local).
 * margin:         só entram notas a até esta distância da melhor (corte relativo, modelo local).
 * topK:           quantas notas parecidas buscar; neighbors: quantas vizinhas no grafo somar a elas.
 */
@ConfigurationProperties("deepthinker.memory")
public record MemoryProperties(
        boolean enabled,
        String modelName,
        Path modelDir,
        boolean autoDownload,
        String modelUrl,
        String tokenizerUrl,
        String queryPrefix,
        String passagePrefix,
        double minScore,
        double margin,
        int topK,
        int neighbors,
        boolean indexOnStartup) {
}
