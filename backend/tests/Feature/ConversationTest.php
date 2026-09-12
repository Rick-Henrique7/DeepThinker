<?php

namespace Tests\Feature;

use App\Models\ConversationMessage;
use App\Models\Note;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_conversation_message(): void
    {
        $response = $this->postJson('/api/conversations', [
            'role' => 'user',
            'content' => 'Olá, Advogado do Diabo.',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('role', 'user')
            ->assertJsonPath('content', 'Olá, Advogado do Diabo.');

        $this->assertDatabaseHas('conversation_messages', [
            'role' => 'user',
            'content' => 'Olá, Advogado do Diabo.',
        ]);
    }

    public function test_can_list_conversations_filtered_by_session(): void
    {
        ConversationMessage::create([
            'role' => 'user',
            'content' => 'msg sessão A',
            'audio_url' => 'session:sessao-a',
        ]);
        ConversationMessage::create([
            'role' => 'user',
            'content' => 'msg sessão B',
            'audio_url' => 'session:sessao-b',
        ]);

        $response = $this->getJson('/api/conversations?session_id=sessao-a');
        $response->assertStatus(200);
        $data = $response->json();
        $this->assertCount(1, $data);
        $this->assertEquals('msg sessão A', $data[0]['content']);
    }

    public function test_can_clear_session(): void
    {
        ConversationMessage::create([
            'role' => 'user',
            'content' => 'A',
            'audio_url' => 'session:temp',
        ]);
        ConversationMessage::create([
            'role' => 'assistant',
            'content' => 'B',
            'audio_url' => 'session:temp',
        ]);

        $response = $this->postJson('/api/conversations/clear', [
            'session_id' => 'temp',
        ]);

        $response->assertStatus(200)->assertJsonPath('deleted', 2);
        $this->assertDatabaseCount('conversation_messages', 0);
    }

    public function test_message_can_be_linked_to_note(): void
    {
        $note = Note::create(['title' => 'Contexto Teste']);

        $response = $this->postJson('/api/conversations', [
            'note_id' => $note->id,
            'role' => 'user',
            'content' => 'Conversa sobre a nota.',
        ]);

        $response->assertStatus(201)->assertJsonPath('note_id', $note->id);
    }
}
