package com.deepthinker.llm;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuração da IA lida do application.yml (bloco deepthinker.llm).
 *
 * provider: o plugin ativo quando ninguém escolheu outro pela tela.
 * plugins:  valores por plugin vindos de variáveis de ambiente
 *           (ex.: OPENAI_API_KEY vira plugins.openai.api-key).
 * Tudo que for salvo pela tela de Configurações vale mais que isto.
 */
@ConfigurationProperties("deepthinker.llm")
public record LlmProperties(String provider, int timeoutSeconds, Map<String, PluginOverride> plugins) {

    public record PluginOverride(String baseUrl, String apiKey, String organization, String model) {
    }

    public PluginOverride of(String pluginId) {
        PluginOverride o = plugins == null ? null : plugins.get(pluginId);
        return o == null ? new PluginOverride(null, null, null, null) : o;
    }
}
