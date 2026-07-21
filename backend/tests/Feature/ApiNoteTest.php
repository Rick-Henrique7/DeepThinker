<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiNoteTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_note_via_api(): void
    {
        $response = $this->postJson('/api/notes', [
            'title' => 'Minha Nota de Teste',
            'content' => 'Conteúdo sobre [[Laravel]]'
        ]);

        $response->assertStatus(201);
    }

    public function test_can_get_note_titles_for_n8n(): void
    {
        $response = $this->getJson('/api/notes/titles');

        $response->assertStatus(200);
    }

    public function test_can_fetch_graph_structure(): void
    {
        $response = $this->getJson('/api/graph');

        $response->assertStatus(200);
    }
}