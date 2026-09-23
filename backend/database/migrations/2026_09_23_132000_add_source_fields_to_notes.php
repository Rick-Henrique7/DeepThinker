<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adiciona campos de origem na nota para "link reverso explicito".
 *
 * source_type:
 *   'conversation' | 'document' | 'upload' | null
 *   Indica QUAL tipo de fluxo gerou esta nota.
 *
 * source_meta (JSON):
 *   Detalhes especificos por tipo:
 *     conversation -> { mode, message_count, provider, model, session_id }
 *     document     -> { filename, mime, extracted_chars, source_pages }
 *
 * Antes desta migration, a unica referencia implicita era o campo
 * `content` (que continha a transcricao inteira quando vinha de
 * summarize). Agora a origem fica em colunas proprias, queryable
 * e exibivel na UI.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->string('source_type', 32)->nullable()->after('summary');
            $table->json('source_meta')->nullable()->after('source_type');
            $table->index('source_type');
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropIndex(['source_type']);
            $table->dropColumn(['source_type', 'source_meta']);
        });
    }
};
