package com.deepthinker.memory;

import java.util.List;

/**
 * Transforma texto em vetor (embedding). Textos com significado parecido
 * viram vetores que apontam para direções parecidas.
 *
 * Os vetores saem normalizados (comprimento 1). Assim a similaridade de cosseno
 * é só o produto escalar, a conta mais barata possível.
 *
 * Mesmo padrão "Strategy" do LlmClient: OnnxEmbedder (modelo de verdade) e
 * HashingEmbedder (plano B por palavras, sem modelo) são intercambiáveis.
 */
public interface Embedder {

    /** Nome gravado junto com cada vetor: vetores de modelos diferentes não se comparam. */
    String id();

    /** true quando entende significado (modelo); false quando só compara palavras. */
    boolean semantic();

    /** Vetor de um texto guardado (uma nota). */
    float[] embedPassage(String text);

    /** Vetor de uma pergunta (a mensagem do chat). */
    float[] embedQuery(String text);

    /** Similaridade mínima ("piso") para considerar duas coisas parecidas. Cada modelo tem a sua escala. */
    double minScore();

    /**
     * Corte relativo: só entram notas a até esta distância da melhor.
     * Alguns modelos (como o e5) dão nota alta para tudo; o que separa o relevante
     * do resto é a diferença para a melhor nota, não o valor absoluto.
     */
    double margin();

    /** Vários textos de uma vez. Quem chama uma API sobrescreve para mandar em lote. */
    default List<float[]> embedPassages(List<String> texts) {
        return texts.stream().map(this::embedPassage).toList();
    }

    static float dot(float[] a, float[] b) {
        int n = Math.min(a.length, b.length);
        float sum = 0f;
        for (int i = 0; i < n; i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }

    static float[] normalize(float[] v) {
        double norm = 0;
        for (float x : v) {
            norm += x * x;
        }
        norm = Math.sqrt(norm);
        if (norm == 0) {
            return v;
        }
        float[] out = new float[v.length];
        for (int i = 0; i < v.length; i++) {
            out[i] = (float) (v[i] / norm);
        }
        return out;
    }
}
