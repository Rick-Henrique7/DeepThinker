<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Ativa a extensão de busca vetorial no PostgreSQL
        DB::statement('CREATE EXTENSION IF NOT EXISTS vector;');
    }

    public function down(): void
    {
        DB::statement('DROP EXTENSION IF EXISTS vector;');
    }
};