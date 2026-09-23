<?php

namespace App\Services\Contracts;

use Generator;

/**
 * Contrato para qualquer provedor de LLM (LM Studio, Ollama, OpenAI, etc).
 * Permite trocar o backend sem reescrever controllers.
 */
interface LlmServiceContract
{
    /**
     * Envia uma conversa para o LLM e retorna a resposta completa (não-streaming).
     *
     * @param array<int, array{role: string, content: string}> $messages
     * @param array<string, mixed> $options  temperature, max_tokens, etc.
     * @param array<int, array<string, mixed>>|null $tools  OpenAI-formatted tools array
     * @return string Conteúdo da resposta do assistente
     */
    public function chat(array $messages, ?string $model = null, array $options = [], ?array $tools = null): string;

    /**
     * Stream de tokens (Server-Sent Events). Yields strings incrementais.
     * Quando tools estao presentes, yields tambem podem ser arrays
     * ['tool_call' => ['id' => ..., 'name' => ..., 'arguments' => ...]].
     *
     * @param array<int, array{role: string, content: string}> $messages
     * @param array<string, mixed> $options
     * @param array<int, array<string, mixed>>|null $tools
     * @return Generator<int, string|array{tool_call: array<string, mixed>}>
     */
    public function stream(array $messages, ?string $model = null, array $options = [], ?array $tools = null): Generator;

    /**
     * Conta tokens aproximados de um texto (estimador simples por palavras).
     * Suficiente para janelas de contexto pequenas. Não é exato como tiktoken,
     * mas serve para o requisito de "limite de contexto".
     */
    public function estimateTokens(string $text): int;

    /**
     * Limite de contexto do modelo atual em tokens.
     */
    public function contextWindow(): int;

    /**
     * Verifica se o servidor está acessível.
     */
    public function isAvailable(): bool;

    /**
     * Lista modelos carregados no servidor LM Studio.
     *
     * @return array<int, string>
     */
    public function listModels(): array;
}
