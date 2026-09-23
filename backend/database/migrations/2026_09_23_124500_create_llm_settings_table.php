<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Settings de LLM por provider, editaveis pela UI (sem restart do server).
 *
 * Cada linha = (provider, chave) -> valor.
 * Ex: (openai, api_key), (openai, model), (lmstudio, base_url) etc.
 *
 * O `LlmSettingsService` le desta tabela primeiro e cai pro .env
 * (`config/llm.php`) quando nao ha valor gravado.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('llm_settings', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 32);
            $table->string('key', 64);
            $table->text('value')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'key']);
            $table->index('provider');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('llm_settings');
    }
};
