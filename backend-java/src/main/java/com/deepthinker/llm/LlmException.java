package com.deepthinker.llm;

/** Erro ao falar com o provedor de IA (fora do ar, chave inválida, resposta estranha). */
public class LlmException extends RuntimeException {

    /** true = vale tentar de novo (falha passageira do provedor). */
    private final boolean retryable;

    public LlmException(String message) {
        this(message, false);
    }

    public LlmException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    public LlmException(String message, Throwable cause) {
        super(message, cause);
        this.retryable = false;
    }

    public boolean isRetryable() {
        return retryable;
    }

    /**
     * Monta o erro a partir de uma resposta HTTP que não foi 2xx, com uma frase
     * que o usuário entende antes do detalhe técnico do provedor.
     */
    public static LlmException fromHttp(String label, int status, String body) {
        String detail = label + " retornou " + status + ": " + body;
        String hint = switch (status) {
            case 401, 403 -> "A API key de " + label + " foi recusada. Confira em Configurações. ";
            case 404 -> "O modelo escolhido não existe em " + label + ". Troque o modelo em Configurações. ";
            case 413, 429 -> "Limite de uso de " + label + " atingido. Espere um minuto e tente de novo. ";
            default -> "";
        };
        // 5xx = problema do lado do provedor; "tool_use_failed" = o modelo tentou usar
        // uma ferramenta inexistente (acontece com o gpt-oss no Groq). Os dois costumam
        // passar numa segunda tentativa.
        boolean retryable = status >= 500 || (body != null && body.contains("tool_use_failed"));
        return new LlmException(hint + detail, retryable);
    }
}
