<?php

namespace App\Providers;

use App\Services\Contracts\LlmServiceContract;
use App\Services\LmStudioService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Liga o contrato ao LM Studio. Para trocar de backend (Ollama, OpenAI cloud),
        // basta bindar outra implementação aqui sem mexer nos controllers.
        $this->app->bind(LlmServiceContract::class, LmStudioService::class);
    }

    public function boot(): void
    {
        //
    }
}
