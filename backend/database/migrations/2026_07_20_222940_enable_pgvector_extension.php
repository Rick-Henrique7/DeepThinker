<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Esta migration historicamente habilitava a extensão `vector` do
     * PostgreSQL (pgvector) para buscas semânticas. O projeto agora roda
     * em SQLite local — embedding é armazenado como JSON (ver
     * `create_notes_table`). Mantemos a migration como no-op para preservar
     * a ordem histórica do schema e registrar a decisão de stack.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS vector;');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('DROP EXTENSION IF EXISTS vector;');
        }
    }
};
