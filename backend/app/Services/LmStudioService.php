<?php

namespace App\Services;

use App\Services\Contracts\LlmServiceContract;
use Generator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Implementação do LlmServiceContract usando LM Studio (OpenAI-compatível).
 *
 * O LM Studio serve modelos locais via API HTTP em http://localhost:1234/v1.
 * Esta classe implementa o padrão OpenAI Chat Completions, então trocar para
 * Ollama ou OpenAI cloud exige mudar só o base_url.
 */
class LmStudioService implements LlmServiceContract
{
    private string $baseUrl;
    private string $apiKey;
    private string $defaultModel;
    private int $timeout;
    private int $chunkSize;

    public function __construct()
    {
        $cfg = config('lmstudio');
        $this->baseUrl = rtrim($cfg['base_url'] ?? 'http://localhost:1234/v1', '/');
        $this->apiKey = $cfg['api_key'] ?? 'lm-studio';
        $this->defaultModel = $cfg['default_model'] ?? 'gemma-1.1-2b-it';
        $this->timeout = (int) ($cfg['timeout'] ?? 120);
        $this->chunkSize = (int) ($cfg['stream_chunk_size'] ?? 8);
    }

    public function chat(array $messages, ?string $model = null, array $options = []): string
    {
        $payload = $this->buildPayload($messages, $model, $options, stream: false);
        $response = Http::withToken($this->apiKey)
            ->timeout($this->timeout)
            ->post($this->baseUrl . '/chat/completions', $payload);

        if (!$response->successful()) {
            throw new \RuntimeException(
                "LM Studio retornou {$response->status()}: {$response->body()}"
            );
        }

        $data = $response->json();
        return $data['choices'][0]['message']['content'] ?? '';
    }

    public function stream(array $messages, ?string $model = null, array $options = []): Generator
    {
        $payload = $this->buildPayload($messages, $model, $options, stream: true);

        $ch = curl_init($this->baseUrl . '/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_WRITEFUNCTION => function ($ch, $data) use (&$buffer, &$yield) {
                $buffer .= $data;
                // Cada evento SSE termina com \n\n; separamos por linhas.
                while (($pos = strpos($buffer, "\n\n")) !== false) {
                    $event = substr($buffer, 0, $pos);
                    $buffer = substr($buffer, $pos + 2);
                    foreach (explode("\n", $event) as $line) {
                        if (str_starts_with($line, 'data:')) {
                            $json = trim(substr($line, 5));
                            if ($json === '[DONE]') {
                                continue;
                            }
                            $decoded = json_decode($json, true);
                            $delta = $decoded['choices'][0]['delta']['content'] ?? null;
                            if ($delta !== null && $delta !== '') {
                                $yield($delta);
                            }
                        }
                    }
                }
                return strlen($data);
            },
        ]);

        $ok = curl_exec($ch);
        if ($ok === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException("LM Studio stream falhou: {$err}");
        }
        curl_close($ch);
    }

    public function estimateTokens(string $text): int
    {
        // Estimador grosseiro: 1 token ≈ 0.75 palavra para inglês/português.
        // Suficiente para o requisito de "limite de contexto" sem dependência
        // de tiktoken (que não roda em PHP sem extensão).
        $words = preg_split('/\s+/', trim($text));
        $count = is_array($words) ? count(array_filter($words)) : 0;
        return (int) max(1, ceil($count / 0.75));
    }

    public function contextWindow(): int
    {
        // Gemma 2B / Llama 3 8B padrão = 8192. Pode ser ajustado por modelo.
        return (int) env('LMSTUDIO_CONTEXT_WINDOW', 8192);
    }

    public function isAvailable(): bool
    {
        try {
            $r = Http::timeout(2)->get($this->baseUrl . '/models');
            return $r->successful();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public function listModels(): array
    {
        try {
            $r = Http::timeout(3)->get($this->baseUrl . '/models');
            if (!$r->successful()) {
                return [];
            }
            $data = $r->json();
            $ids = array_map(fn($m) => $m['id'] ?? '', $data['data'] ?? []);
            return array_values(array_filter($ids));
        } catch (\Throwable $e) {
            return [];
        }
    }

    private function buildPayload(array $messages, ?string $model, array $options, bool $stream): array
    {
        return [
            'model' => $model ?? $this->defaultModel,
            'messages' => $messages,
            'stream' => $stream,
            'temperature' => $options['temperature'] ?? 0.7,
            'max_tokens' => $options['max_tokens'] ?? 1024,
        ];
    }
}
