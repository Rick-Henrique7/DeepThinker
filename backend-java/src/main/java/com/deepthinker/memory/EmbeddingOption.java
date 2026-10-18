package com.deepthinker.memory;

import java.util.List;

/**
 * Uma opção de modelo de embeddings que o usuário pode escolher na tela de Configurações.
 *
 * @param id             identificador gravado nas configurações (ex.: "openai")
 * @param label          nome mostrado na tela
 * @param description    uma linha explicando a opção
 * @param pluginId       plugin de IA de onde vêm a chave e o endereço (null = não usa plugin)
 * @param defaultBaseUrl endereço padrão quando não usa plugin (ex.: Ollama)
 * @param baseUrlEditable se o usuário pode trocar o endereço
 * @param defaultModel   modelo usado quando o usuário não escolhe
 * @param models         sugestões de modelo
 * @param floor          similaridade mínima para uma nota entrar ("piso")
 * @param margin         distância máxima da melhor nota (corte relativo, ver NoteSearch)
 * @param local          roda no computador do usuário (não funciona com o app na nuvem)
 * @param guide          passo a passo de como conectar, mostrado na tela
 */
public record EmbeddingOption(
        String id,
        String label,
        String description,
        String pluginId,
        String defaultBaseUrl,
        boolean baseUrlEditable,
        String defaultModel,
        List<String> models,
        double floor,
        double margin,
        boolean local,
        List<String> guide) {

    public static final String LOCAL = "local";
    /** Busca por palavras (HashingEmbedder): o padrão, não baixa nada. */
    public static final String WORDS = "palavras";

    /** O modelo ONNX que roda dentro do app (baixado sob demanda). */
    public boolean isLocal() {
        return LOCAL.equals(id);
    }

    public boolean isWords() {
        return WORDS.equals(id);
    }

    /** Roda dentro do próprio app, sem chave nem endereço (palavras ou modelo local). */
    public boolean isBuiltIn() {
        return isLocal() || isWords();
    }
}
