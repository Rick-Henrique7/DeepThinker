package com.deepthinker.memory;

import com.deepthinker.llm.LlmPlugin;
import com.deepthinker.llm.LlmSettingsService;
import com.deepthinker.llm.PluginCatalog;
import com.deepthinker.memory.MemorySettings.Choice;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Decide qual Embedder usar para cada usuário, a partir da escolha dele em Configurações.
 *
 * - Por palavras (padrão): HashingEmbedder, nada para baixar.
 * - Local: o modelo ONNX do próprio servidor (EmbeddingEngine), baixado só quando alguém escolhe.
 * - Remoto: RemoteEmbedder com a chave e o endereço do plugin de IA correspondente.
 * Se a opção remota estiver incompleta (ex.: sem chave), usa a busca por palavras e explica o motivo,
 * em vez de deixar a memória parada.
 */
@Component
public class EmbedderResolver {

    /** O embedder escolhido e, se não deu para usar a opção do usuário, o porquê. */
    public record Resolved(Embedder embedder, Choice choice, String problem) {
    }

    private final MemorySettings settings;
    private final EmbeddingEngine engine;
    private final PluginCatalog plugins;
    private final LlmSettingsService llmSettings;
    private final JsonMapper json;

    public EmbedderResolver(MemorySettings settings, EmbeddingEngine engine, PluginCatalog plugins,
                            LlmSettingsService llmSettings, JsonMapper json) {
        this.settings = settings;
        this.engine = engine;
        this.plugins = plugins;
        this.llmSettings = llmSettings;
        this.json = json;
    }

    public Embedder forUser(Long userId) {
        return resolve(userId).embedder();
    }

    public Resolved resolve(Long userId) {
        Choice choice = settings.choice(userId);
        EmbeddingOption option = choice.option();
        if (option.isWords()) {
            return new Resolved(engine.words(), choice, null);
        }
        if (option.isLocal()) {
            // Primeira vez que alguém usa o modelo local: começa a baixar em segundo plano.
            engine.ensureLoading();
            return new Resolved(engine.current(), choice, null);
        }

        String baseUrl = choice.baseUrl();
        String apiKey = null;
        if (option.pluginId() != null) {
            LlmPlugin plugin = plugins.find(option.pluginId()).orElse(null);
            if (plugin == null) {
                return fallback(choice, "Plugin " + option.pluginId() + " não existe.");
            }
            baseUrl = llmSettings.get(userId, plugin, "base_url");
            apiKey = llmSettings.get(userId, plugin, "api_key");
            if (plugin.requiresApiKey() && apiKey == null) {
                return fallback(choice, "Falta a API key de " + plugin.label()
                        + ". Salve a chave na seção de IA para usar esta opção.");
            }
        }
        if (baseUrl == null || baseUrl.isBlank()) {
            return fallback(choice, "Falta o endereço de " + option.label() + ".");
        }
        return new Resolved(new RemoteEmbedder(option, baseUrl, apiKey, choice.model(), json), choice, null);
    }

    private Resolved fallback(Choice choice, String problem) {
        return new Resolved(engine.words(), choice, problem + " Enquanto isso, a memória busca por palavras.");
    }
}
