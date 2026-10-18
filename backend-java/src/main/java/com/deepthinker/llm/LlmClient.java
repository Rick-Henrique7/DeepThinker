package com.deepthinker.llm;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * O contrato que todo plugin de IA cumpre. O resto do sistema (chat, resumo,
 * teste de conexão) só conhece esta interface, nunca a classe concreta.
 * É o padrão de projeto "Strategy": trocar de provedor é trocar de objeto.
 *
 * Implementações: OpenAiCompatibleClient e AnthropicClient.
 */
public interface LlmClient {

    /** Uma mensagem da conversa: role = system, user, assistant ou tool. */
    record Message(String role, String content) {
    }

    /** Ajustes por chamada. */
    record Options(double temperature, int maxTokens) {
        public static final Options DEFAULT = new Options(0.7, 1024);
    }

    LlmPlugin plugin();

    /** Tem o necessário para responder agora? (chave configurada, servidor no ar...) */
    boolean isAvailable();

    /** Resposta completa de uma vez. */
    String chat(List<Message> messages, String model, Options options);

    /**
     * Resposta em pedaços: onText é chamado a cada trecho de texto.
     * Devolve as ferramentas que a IA pediu para executar (pode ser vazio).
     * tools vem no formato da OpenAI; cada plugin converte se precisar.
     */
    List<ToolCall> stream(List<Message> messages, String model, Options options,
                          List<Map<String, Object>> tools, Consumer<String> onText);
}
