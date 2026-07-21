<?php

namespace Tests\Feature;

use App\Models\Note;
use App\Models\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NoteGraphTest extends TestCase
{
    use RefreshDatabase; // Reseta o banco de testes após cada execução

    /**
     * Testa se criar uma nota com [[Link]] gera um registro em connections.
     */
    public function test_it_creates_connection_when_note_contains_wiki_link(): void
    {
        // 1. Criamos a nota que será citada (Destino)
        $targetNote = Note::create([
            'title' => 'Arquitetura de Software',
            'content' => 'Conceitos avançados de software...',
        ]);

        // 2. Criamos a nota de Origem contendo [[Arquitetura de Software]]
        $sourceNote = Note::create([
            'title' => 'Design Patterns',
            'content' => 'Os padrões ajudam na [[Arquitetura de Software]] de grandes sistemas.',
        ]);

        // 3. Verificamos se o Observer criou a conexão no banco
        $this->assertDatabaseHas('connections', [
            'source_note_id' => $sourceNote->id,
            'target_note_id' => $targetNote->id,
        ]);

        // 4. Verificamos se o relacionamento do Eloquent funciona
        $this->assertCount(1, $sourceNote->connectedNotes);
        $this->assertEquals('Arquitetura de Software', $sourceNote->connectedNotes->first()->title);
    }

    /**
     * Testa se a remoção de um [[Link]] do texto remove a conexão no banco.
     */
    public function test_it_removes_connection_when_link_is_deleted_from_content(): void
    {
        $noteA = Note::create(['title' => 'Laravel']);
        $noteB = Note::create(['title' => 'PostgreSQL']);

        $mainNote = Note::create([
            'title' => 'Stack do Projeto',
            'content' => 'Usamos [[Laravel]] e [[PostgreSQL]] no backend.',
        ]);

        // Confirma que foram criadas 2 conexões
        $this->assertCount(2, Connection::where('source_note_id', $mainNote->id)->get());

        // Atualizamos o texto removendo a citação ao PostgreSQL
        $mainNote->update([
            'content' => 'Agora usamos apenas [[Laravel]] no backend.',
        ]);

        // Confirma que resta apenas 1 conexão (para o Laravel)
        $this->assertCount(1, Connection::where('source_note_id', $mainNote->id)->get());
        $this->assertDatabaseMissing('connections', [
            'source_note_id' => $mainNote->id,
            'target_note_id' => $noteB->id,
        ]);
    }
}