package com.deepthinker.llm;

import java.time.Duration;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Monta o cliente certo para cada plugin, com as configurações atuais.
 * Como lê as configurações a cada chamada, trocar a chave pela tela vale na hora.
 */
@Component
public class LlmClientFactory {

    private final LlmSettingsService settings;
    private final PluginCatalog catalog;
    private final LlmProperties props;
    private final JsonMapper json;

    public LlmClientFactory(LlmSettingsService settings, PluginCatalog catalog, LlmProperties props, JsonMapper json) {
        this.settings = settings;
        this.catalog = catalog;
        this.props = props;
        this.json = json;
    }

    public LlmClient active() {
        return forPlugin(settings.activePlugin());
    }

    /** Plugin pedido pelo frontend; se não existir, usa o ativo. */
    public LlmClient forId(String pluginId) {
        return catalog.find(pluginId).map(this::forPlugin).orElseGet(this::active);
    }

    public LlmClient forPlugin(LlmPlugin p) {
        Duration timeout = Duration.ofSeconds(Math.max(1, props.timeoutSeconds()));
        String baseUrl = settings.get(p, "base_url");
        String apiKey = settings.get(p, "api_key");
        String model = settings.get(p, "model");
        return switch (p.protocol()) {
            case ANTHROPIC -> new AnthropicClient(p, baseUrl, apiKey, model, timeout, json);
            case OPENAI_COMPATIBLE -> new OpenAiCompatibleClient(p, baseUrl, apiKey,
                    settings.get(p, "organization"), model, timeout, json);
        };
    }
}
