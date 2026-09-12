<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->string('title')->unique();
            $table->text('content')->nullable();
            $table->text('summary')->nullable();
            // Embedding armazenado como JSON (string) para manter compatibilidade
            // com o ambiente local SQLite. Em produção com Postgres + pgvector
            // esta coluna pode ser migrada para vector(768) e ganhar busca semântica.
            $table->text('embedding')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
