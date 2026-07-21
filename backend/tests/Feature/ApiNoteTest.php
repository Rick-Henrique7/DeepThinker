<?php

namespace Tests\Feature;

use App\Models\Note;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiNoteTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Testa a criação de nota via POST /api/notes
     */
    public function test_can_create_note_via_api(): void
    {
        $payload = [
            'title' => 'Introdução ao Laravel 11',
            'content' => 'O framework PHP para artesãos da Web.',
            'summary' => 'Resumo inicial',
        ];

        $response = $this->postJson('/api/notes', $payload);

        $response->assertStatus(201)
                 ->assertJsonFragment(['title' => 'Introdução ao Laravel 11']);

        $this->assertDatabaseHas('notes', ['title' => 'Introdução ao Laravel 11']);
    }

    /**
     * Testa o endpoint leve GET /api/notes/titles (usado pelo n8n)
     */
    public function test_can_get_note_titles_for_n8n(): void
    {
        Note::create(['title' => 'Nota 1']);
        Note::create(['title' => 'Nota 2']);

        $response = $this->getJson('/api/notes/titles');

        $response->assertStatus(200)
                 ->assertJsonCount(2)
                 ->assertJsonStructure([
                     '*' => ['id', 'title']
                 ]);
    }

    /**
     * Testa o endpoint do Grafo GET /api/graph (usado pelo React)
     */
    public function test_can_fetch_graph_structure(): void
    {
        $target = Note::create(['title' => 'Docker']);
        $source = Note::create([
            'title' => 'Laravel Sail',
            'content' => 'Roda dentro do [[Docker]]'
        ]);

        $response = $this->getJson('/api/graph');

        $response->assertStatus(200)
                 ->assertJsonStructure([
                     'nodes' => [['id', 'label']],
                     'links' => [['source', 'target', 'weight']]
                 ])
                 ->assertJsonFragment(['source' => $source->id, 'target' => $target->id]);
    }
}