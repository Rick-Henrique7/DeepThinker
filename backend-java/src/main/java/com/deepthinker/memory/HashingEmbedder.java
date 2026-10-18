package com.deepthinker.memory;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * Plano B, sem modelo: cada palavra (e o "radical" dela) cai numa posição do vetor
 * escolhida por hash. Duas notas que usam as mesmas palavras ficam parecidas.
 *
 * Não entende sinônimos ("falir" x "quebrar"), por isso só é usado enquanto o
 * modelo de verdade não carregou, nos testes, ou se o download falhar.
 * A técnica se chama "feature hashing" (ou "hashing trick").
 */
public class HashingEmbedder implements Embedder {

    static final int DIMS = 1024;

    private static final Set<String> STOPWORDS = Set.of(
            "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na",
            "nos", "nas", "por", "para", "pra", "com", "sem", "e", "ou", "que", "se", "nao", "sim", "mais", "menos",
            "muito", "pouco", "eu", "voce", "ele", "ela", "eles", "elas", "meu", "minha", "seu", "sua", "isso",
            "isto", "aquilo", "esse", "essa", "este", "esta", "ao", "aos", "como", "quando", "onde", "porque", "qual",
            "quais", "ja", "tambem", "so", "mas", "sobre", "entre", "ate", "ser", "estar", "ter", "foi", "era", "sao",
            "tem", "ha", "me", "te", "lhe", "the", "of", "and", "to", "in", "is", "it");

    @Override
    public String id() {
        return "hashing-v1";
    }

    @Override
    public boolean semantic() {
        return false;
    }

    @Override
    public float[] embedPassage(String text) {
        return embed(text);
    }

    @Override
    public float[] embedQuery(String text) {
        return embed(text);
    }

    @Override
    public double minScore() {
        return 0.12;
    }

    @Override
    public double margin() {
        return 0.25;
    }

    float[] embed(String text) {
        float[] v = new float[DIMS];
        if (text == null) {
            return v;
        }
        String plain = Normalizer.normalize(text.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        for (String word : plain.split("[^\\p{L}\\p{N}]+")) {
            if (word.length() < 3 || STOPWORDS.contains(word)) {
                continue;
            }
            add(v, word, 1f);
            if (word.length() > 5) {
                add(v, "~" + word.substring(0, 5), 0.6f); // "radical": decisao, decidir, decidido...
            }
        }
        return Embedder.normalize(v);
    }

    private static void add(float[] v, String feature, float weight) {
        int h = feature.hashCode();
        int idx = Math.floorMod(h, DIMS);
        v[idx] += ((h >>> 31) == 0 ? 1f : -1f) * weight;
    }
}
