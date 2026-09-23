<?php

namespace App\Services;

use App\Models\LlmSetting;

/**
 * Configuracoes editaveis de LLM por provider.
 *
 * Persiste em `llm_settings` (DB) com fallback pra `config/llm.php` (.env).
 *
 * Chave | Significado
 * ------+-----------------------------------------------
 * api_key          | OpenAI / Anthropic API key (LM Studio ignora)
 * base_url         | LM Studio endpoint (default http://localhost:1234/v1)
 * organization     | OpenAI org id
 * model            | modelo default do provider
 *
 * Tambem expoe `getActiveProvider()` que reflete a escolha do user
 * (separado das credenciais por provider).
 */
class LlmSettingsService
{
    /** Provider fixo salvo em `meta`/`provider` quando user troca na UI. */
    private const PROVIDER_KEY = '__active_provider__';

    public function getActiveProvider(): string
    {
        $stored = $this->raw(self::PROVIDER_KEY, null);
        if (in_array($stored, ['lmstudio', 'openai'], true)) {
            return $stored;
        }
        return (string) config('llm.provider', 'lmstudio');
    }

    public function setActiveProvider(string $provider): void
    {
        if (!in_array($provider, ['lmstudio', 'openai'], true)) {
            throw new \InvalidArgumentException("Provider invalido: {$provider}");
        }
        $this->rawSet(self::PROVIDER_KEY, $provider);
    }

    /** @return array{provider:string, model:string} */
    public function getProviderModel(string $provider): array
    {
        return [
            'provider' => $this->getActiveProvider(),
            'model' => $this->getKey($provider, 'model')
                ?: (string) (config("llm.providers.{$provider}.default_model") ?? ''),
        ];
    }

    public function getKey(string $provider, string $key): ?string
    {
        $val = $this->raw("{$provider}.{$key}", null);
        if ($val !== null && $val !== '') {
            return $val;
        }
        // fallback: config/llm.php (.env)
        $cfg = config("llm.providers.{$provider}.{$key}");
        if (is_string($cfg) && $cfg !== '') {
            return $cfg;
        }
        return null;
    }

    public function hasKey(string $provider, string $key): bool
    {
        return $this->raw("{$provider}.{$key}", null) !== null
            || config("llm.providers.{$provider}.{$key}") !== null
                && config("llm.providers.{$provider}.{$key}") !== '';
    }

    /**
     * Aplica PUT vindo da UI. Apenas chaves "publicaveis" sao aceitas
     * aqui (api_key, model, base_url, organization). Token vazio = remove.
     *
     * @param array<string,mixed> $data
     */
    public function apply(array $data): void
    {
        if (isset($data['provider'])) {
            $this->setActiveProvider((string) $data['provider']);
        }

        $writable = ['api_key', 'model', 'base_url', 'organization'];
        $provider = $this->getActiveProvider();

        foreach ($writable as $k) {
            if (!array_key_exists($k, $data)) continue;

            $value = $data[$k];

            // string vazia = sem alteracao em LM Studio ou = remove em API key
            if ($k === 'api_key' && is_string($value) && $value === '') {
                $this->rawDelete("{$provider}.{$k}");
                continue;
            }

            if (is_string($value) && $value !== '') {
                $this->rawSet("{$provider}.{$k}", $value);
            }
        }
    }

    /**
     * Snapshot usado pelo GET /api/settings/llm — nunca expoe o valor
     * da api_key, apenas indica que existe.
     */
    public function snapshot(): array
    {
        $active = $this->getActiveProvider();
        $providers = [];

        foreach (['lmstudio', 'openai'] as $p) {
            $providers[$p] = [
                'model' => $this->getKey($p, 'model')
                    ?: (string) config("llm.providers.{$p}.default_model"),
                'has_api_key' => $this->hasKey($p, 'api_key'),
                'api_key_masked' => $this->mask($this->getKey($p, 'api_key')),
                'base_url' => $this->getKey($p, 'base_url'),
                'organization' => $this->hasKey($p, 'organization')
                    ? '***' . substr((string) $this->getKey($p, 'organization'), -4)
                    : null,
            ];
        }

        return [
            'active_provider' => $active,
            'providers' => $providers,
            'catalog' => (array) config('llm.catalog', []),
        ];
    }

    private function mask(?string $value): ?string
    {
        if ($value === null || $value === '') return null;
        $len = strlen($value);
        if ($len <= 8) return str_repeat('*', $len);
        return substr($value, 0, 3) . str_repeat('*', max(4, $len - 7)) . substr($value, -4);
    }

    private function raw(string $key, ?string $default): ?string
    {
        try {
            [$provider, $name] = $this->splitKey($key);
            $row = LlmSetting::where('provider', $provider)->where('key', $name)->first();
            return $row?->value ?? $default;
        } catch (\Throwable $e) {
            // tabela nao migrada (testes) ou DB indisponivel -> cai pro .env
            return $default;
        }
    }

    private function rawSet(string $key, string $value): void
    {
        try {
            [$provider, $name] = $this->splitKey($key);
            LlmSetting::updateOrCreate(
                ['provider' => $provider, 'key' => $name],
                ['value' => $value],
            );
        } catch (\Throwable $e) {
            // testes ou DB indisponivel: silent fail (write-through nao eh critico)
        }
    }

    private function rawDelete(string $key): void
    {
        try {
            [$provider, $name] = $this->splitKey($key);
            LlmSetting::where('provider', $provider)->where('key', $name)->delete();
        } catch (\Throwable $e) {
            // ignore
        }
    }

    /** @return array{0:string,1:string} */
    private function splitKey(string $key): array
    {
        if ($key === self::PROVIDER_KEY) {
            return ['meta', $key];
        }
        $parts = explode('.', $key, 2);
        return [$parts[0], $parts[1] ?? ''];
    }
}
