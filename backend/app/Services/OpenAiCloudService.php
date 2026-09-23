<?php

namespace App\Services;

use App\Services\Contracts\LlmServiceContract;
use Generator;
use Illuminate\Support\Facades\Http;

/**
 * Implementação OpenAI Cloud (api.openai.com) usando API key.
 *
 * Credenciais e modelo vem de LlmSettingsService (DB -> .env fallback),
 * permitindo trocar a chave ou modelo sem restart do backend.
 *
 * Suporta modelos: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo, etc.
 * Streaming via SSE (mesmo formato que LM Studio).
 */
class OpenAiCloudService implements LlmServiceContract
{
    private LlmSettingsService $settings;
    private string $apiKey;
    private string $defaultModel;
    private int $timeout;

    public function __construct(?LlmSettingsService $settings = null)
    {
        $this->settings = $settings ?? app(LlmSettingsService::class);
        $this->apiKey = (string) ($this->settings->getKey('openai', 'api_key') ?? '');
        $this->defaultModel = (string) ($this->settings->getKey('openai', 'model')
            ?? config('llm.providers.openai.default_model', 'gpt-4o-mini'));
        $cfg = (array) config('llm.providers.openai', []);
        $this->timeout = (int) ($cfg['timeout'] ?? 60);
    }

    public function chat(array $messages, ?string $model = null, array $options = []): string
    {
        $payload = $this->buildPayload($messages, $model, $options, stream: false);

        if (empty($this->apiKey)) {
            throw new \RuntimeException('OPENAI_API_KEY nao configurada. Defina em Settings.');
        }

        $response = Http::withToken($this->apiKey)
            ->timeout($this->timeout)
            ->withHeaders(['OpenAI-Organization' => $this->getOrg()])
            ->post('https://api.openai.com/v1/chat/completions', $payload);

        if (!$response->successful()) {
            throw new \RuntimeException("OpenAI retornou {$response->status()}: {$response->body()}");
        }

        $data = $response->json();
        return $data['choices'][0]['message']['content'] ?? '';
    }

    public function stream(array $messages, ?string $model = null, array $options = []): Generator
    {
        if (empty($this->apiKey)) {
            throw new \RuntimeException('OPENAI_API_KEY nao configurada. Defina em Settings.');
        }

        $payload = $this->buildPayload($messages, $model, $options, stream: true);

        $queue = new \SplQueue();

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: text/event-stream',
                'Authorization: Bearer ' . $this->apiKey,
                'OpenAI-Organization: ' . $this->getOrg(),
            ],
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_BUFFERSIZE => 128,
            CURLOPT_WRITEFUNCTION => function ($ch, $data) use (&$queue) {
                foreach (explode("\n", $data) as $line) {
                    $line = trim($line);
                    if ($line === '') continue;
                    if (!str_starts_with($line, 'data:')) continue;
                    $payload = trim(substr($line, 5));
                    if ($payload === '[DONE]') continue;
                    $decoded = json_decode($payload, true);
                    if (!is_array($decoded)) continue;
                    if (isset($decoded['error'])) {
                        $queue->push(['error' => $decoded['error']['message'] ?? 'unknown']);
                        continue;
                    }
                    $delta = $decoded['choices'][0]['delta']['content'] ?? null;
                    if ($delta !== null && $delta !== '') {
                        $queue->push($delta);
                    }
                }
                return strlen($data);
            },
        ]);

        $ok = curl_exec($ch);
        if ($ok === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException("OpenAI stream falhou: {$err}");
        }
        curl_close($ch);

        while (!$queue->isEmpty()) {
            $item = $queue->pop();
            if (is_array($item) && isset($item['error'])) {
                throw new \RuntimeException($item['error']);
            }
            yield $item;
        }
    }

    public function estimateTokens(string $text): int
    {
        $words = preg_split('/\s+/', trim($text));
        $count = is_array($words) ? count(array_filter($words)) : 0;
        return (int) max(1, ceil($count / 0.75));
    }

    public function contextWindow(): int
    {
        $model = $this->defaultModel;
        // Limites conhecidos (conservadores)
        return match (true) {
            str_contains($model, 'gpt-4o') => 128_000,
            str_contains($model, 'gpt-4-turbo') => 128_000,
            str_contains($model, 'gpt-3.5') => 16_385,
            default => 8_192,
        };
    }

    public function isAvailable(): bool
    {
        return !empty($this->apiKey);
    }

    public function listModels(): array
    {
        if (empty($this->apiKey)) return [];
        try {
            $r = Http::withToken($this->apiKey)
                ->timeout(5)
                ->get('https://api.openai.com/v1/models');
            if (!$r->successful()) return [];
            $ids = array_map(fn($m) => $m['id'] ?? '', $r->json()['data'] ?? []);
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

    private function getOrg(): string
    {
        return (string) ($this->settings->getKey('openai', 'organization') ?? '');
    }
}
