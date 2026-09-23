<?php

namespace Tests\Feature;

use App\Models\Note;
use App\Services\Tools\ToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ToolRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_returns_create_note_tool(): void
    {
        $catalog = ToolRegistry::catalog();
        $this->assertCount(1, $catalog);
        $this->assertEquals('function', $catalog[0]['type']);
        $this->assertEquals('create_note', $catalog[0]['function']['name']);
        $this->assertArrayHasKey('title', $catalog[0]['function']['parameters']['properties']);
        $this->assertArrayHasKey('content', $catalog[0]['function']['parameters']['properties']);
        $this->assertContains('title', $catalog[0]['function']['parameters']['required']);
        $this->assertContains('content', $catalog[0]['function']['parameters']['required']);
    }

    public function test_create_note_handler_persists_note_with_tool_source(): void
    {
        $result = ToolRegistry::handlers()['create_note']([
            'title' => 'Insight do Advogado',
            'content' => 'Conteudo sobre o insight.',
            'summary' => 'Resuminho.',
        ]);

        $this->assertTrue($result['ok']);
        $this->assertArrayHasKey('note_id', $result);
        $this->assertEquals('Insight do Advogado', $result['title']);

        $note = Note::find($result['note_id']);
        $this->assertNotNull($note);
        $this->assertEquals('conversation', $note->source_type);
        $this->assertEquals('tool_call', $note->source_meta['created_via']);
    }

    public function test_create_note_handler_rejects_empty_payload(): void
    {
        $result = ToolRegistry::handlers()['create_note']([
            'title' => '',
            'content' => '',
        ]);
        $this->assertArrayHasKey('error', $result);
    }

    public function test_chat_tools_endpoint_returns_catalog(): void
    {
        $response = $this->getJson('/api/chat/tools');
        $response->assertStatus(200)
            ->assertJsonPath('handlers.0', 'create_note');
        $this->assertCount(1, $response->json('tools'));
    }
}
