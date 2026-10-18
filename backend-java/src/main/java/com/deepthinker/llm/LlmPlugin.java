package com.deepthinker.llm;

import java.util.List;

/**
 * A "ficha técnica" de um plugin de IA: tudo que o sistema precisa saber
 * para conversar com um provedor e para desenhar a tela de Configurações.
 *
 * Adicionar um provedor novo = adicionar uma ficha em PluginCatalog.
 * Nenhum controller ou tela precisa mudar.
 *
 * @param id             identificador usado na API e no banco (ex.: "groq")
 * @param label          nome mostrado na tela
 * @param description    uma linha explicando o provedor
 * @param protocol       que "língua" a API fala (ver Protocol)
 * @param baseUrl        endereço padrão da API
 * @param baseUrlEditable se o usuário pode trocar o endereço (ex.: provedor personalizado)
 * @param requiresApiKey se precisa de chave para funcionar
 * @param keyUrl         onde o usuário cria a chave (link na tela)
 * @param defaultModel   modelo usado quando o usuário não escolhe
 * @param models         sugestões de modelo (o usuário pode digitar qualquer outro)
 * @param local          true se roda no computador do usuário (não funciona em produção na nuvem)
 */
public record LlmPlugin(
        String id,
        String label,
        String description,
        Protocol protocol,
        String baseUrl,
        boolean baseUrlEditable,
        boolean requiresApiKey,
        String keyUrl,
        String defaultModel,
        List<String> models,
        boolean local) {

    /** As duas "línguas" de API que sabemos falar. */
    public enum Protocol {
        /** /chat/completions da OpenAI. A maioria dos provedores copia este formato. */
        OPENAI_COMPATIBLE,
        /** /messages da Anthropic (Claude), que tem formato próprio. */
        ANTHROPIC
    }
}
