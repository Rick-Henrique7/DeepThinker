package com.deepthinker.llm;

import com.deepthinker.llm.LlmPlugin.Protocol;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Lista de plugins de IA disponíveis. A ordem aqui é a ordem na tela.
 *
 * Os modelos são só sugestões e envelhecem rápido: o usuário sempre pode
 * digitar o nome de qualquer modelo que o provedor oferecer.
 */
@Component
public class PluginCatalog {

    private final Map<String, LlmPlugin> plugins = new LinkedHashMap<>();

    public PluginCatalog() {
        add(new LlmPlugin("openai", "OpenAI", "ChatGPT e família GPT. Cobrado por uso.",
                Protocol.OPENAI_COMPATIBLE, "https://api.openai.com/v1", false, true,
                "https://platform.openai.com/api-keys",
                "gpt-4o-mini", List.of("gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"), false));
        add(new LlmPlugin("anthropic", "Anthropic (Claude)", "Modelos Claude. Cobrado por uso.",
                Protocol.ANTHROPIC, "https://api.anthropic.com/v1", false, true,
                "https://console.anthropic.com/settings/keys",
                "claude-haiku-5-5", List.of("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"), false));
        add(new LlmPlugin("gemini", "Google Gemini", "Modelos Gemini do Google. Tem cota gratuita.",
                Protocol.OPENAI_COMPATIBLE, "https://generativelanguage.googleapis.com/v1beta/openai", false, true,
                "https://aistudio.google.com/apikey",
                "gemini-2.5-flash", List.of("gemini-2.5-flash", "gemini-2.5-pro"), false));
        add(new LlmPlugin("groq", "Groq", "Modelos abertos (Llama e outros) com resposta muito rápida. Tem cota gratuita.",
                Protocol.OPENAI_COMPATIBLE, "https://api.groq.com/openai/v1", false, true,
                "https://console.groq.com/keys",
                "llama-3.3-70b-versatile", List.of("llama-3.3-70b-versatile", "llama-3.1-8b-instant"), false));
        add(new LlmPlugin("openrouter", "OpenRouter", "Uma chave só para centenas de modelos de vários provedores.",
                Protocol.OPENAI_COMPATIBLE, "https://openrouter.ai/api/v1", false, true,
                "https://openrouter.ai/keys",
                "openrouter/auto", List.of("openrouter/auto", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"),
                false));
        add(new LlmPlugin("deepseek", "DeepSeek", "Modelos DeepSeek, de baixo custo.",
                Protocol.OPENAI_COMPATIBLE, "https://api.deepseek.com/v1", false, true,
                "https://platform.deepseek.com/api_keys",
                "deepseek-chat", List.of("deepseek-chat", "deepseek-reasoner"), false));
        add(new LlmPlugin("mistral", "Mistral AI", "Modelos da Mistral, empresa europeia.",
                Protocol.OPENAI_COMPATIBLE, "https://api.mistral.ai/v1", false, true,
                "https://console.mistral.ai/api-keys",
                "mistral-small-latest", List.of("mistral-small-latest", "mistral-large-latest"), false));
        add(new LlmPlugin("custom", "Personalizado", "Qualquer API compatível com a OpenAI: informe o endereço e a chave.",
                Protocol.OPENAI_COMPATIBLE, "", true, false, null,
                "", List.of(), false));
        add(new LlmPlugin("lmstudio", "LM Studio (local)", "IA rodando no seu computador, de graça e sem internet. Funciona no app desktop.",
                Protocol.OPENAI_COMPATIBLE, "http://localhost:1234/v1", true, false, "https://lmstudio.ai",
                "meta-llama-3.1-8b-instruct", List.of("meta-llama-3.1-8b-instruct", "gemma-1.1-2b-it"), true));
    }

    private void add(LlmPlugin plugin) {
        plugins.put(plugin.id(), plugin);
    }

    public List<LlmPlugin> all() {
        return List.copyOf(plugins.values());
    }

    public Optional<LlmPlugin> find(String id) {
        return Optional.ofNullable(id).map(plugins::get);
    }
}
