<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('connections', function (Blueprint $table) {
            $table->id();
            
            // Nota de origem
            $table->foreignId('source_note_id')
                  ->constrained('notes')
                  ->onDelete('cascade');

            // Nota de destino
            $table->foreignId('target_note_id')
                  ->constrained('notes')
                  ->onDelete('cascade');

            $table->float('weight')->default(1.0); // Peso da conexão
            $table->timestamps();

            // Impede conexões duplicadas entre as mesmas duas notas
            $table->unique(['source_note_id', 'target_note_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('connections');
    }
};