<?php

namespace App\Providers;

use App\Services\Contracts\LlmServiceContract;
use App\Services\LmStudioService;
use App\Services\OpenAiCloudService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bind LLM provider baseado em LLM_PROVIDER (env).
        // Para trocar de provider sem reiniciar: alterar .env + restart.
        $this->app->singleton(LlmServiceContract::class, function ($app) {
            $provider = config('llm.provider', 'lmstudio');
            return match ($provider) {
                'openai' => new OpenAiCloudService(),
                default => new LmStudioService(),
            };
        });
    }

    public function boot(): void
    {
        //
    }
}
