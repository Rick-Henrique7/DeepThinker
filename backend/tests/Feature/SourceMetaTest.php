<?php

namespace Tests\Feature;

use App\Models\Note;
use App\Services\Contracts\LlmServiceContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SourceMetaTest extends TestCase
{
    use RefreshDatabase;

    public function test_summarize_persists_source_type_and_meta(): void
    {
        $this->app->bind(LlmServiceContract::class, function () {
            return new class implements LlmServiceContract {
                public function chat(array $messages, ?string $model = null, array $options = [], ?array $tools = null): string
                {
                    return json_encode([
                        'title' => 'Conversa sobre carreira',
                        'summary' => 'Usuario pensando em transicao.',
                        'key_points' => [
                            ['key' => 'Transicao de carreira', 'detail' => 'Deseja mudar de area.'],
                        ],
                    ], JSON_UNESCAPED_UNICODE);
                }
                public function stream(array $messages, ?string $model = null, array $options = [], ?array $tools = null): \Generator { yield 'x'; }
                public function estimateTokens(string $text): int { return 1; }
                public function contextWindow(): int { return 8192; }
                public function isAvailable(): bool { return true; }
                public function listModels(): array { return ['mock']; }
            };
        });

        $response = $this->postJson('/api/notes/summarize', [
            'mode' => 'socratic',
            'session_id' => 'abc-123-uuid',
            'provider' => 'openai',
            'model' => 'gpt-4o-mini',
            'messages' => [
                ['role' => 'user', 'content' => 'Quero mudar de carreira.'],
                ['role' => 'assistant', 'content' => 'Para qual area?'],
                ['role' => 'user', 'content' => 'Nao sei ainda.'],
            ],
        ]);

        $response->assertStatus(201);
        $noteId = $response->json('note.id');

        $note = Note::find($noteId);
        $this->assertEquals('conversation', $note->source_type);
        $this->assertEquals('socratic', $note->source_meta['mode']);
        $this->assertEquals(3, $note->source_meta['message_count']);
        $this->assertEquals(2, $note->source_meta['user_messages']);
        $this->assertEquals(1, $note->source_meta['assistant_messages']);
        $this->assertEquals('abc-123-uuid', $note->source_meta['session_id']);
        $this->assertEquals('openai', $note->source_meta['provider']);
        $this->assertEquals('gpt-4o-mini', $note->source_meta['model']);
        $this->assertEquals('summarize', $note->source_meta['created_via']);
    }

    public function test_get_note_returns_source_meta(): void
    {
        $note = Note::create([
            'title' => 'Nota com fonte',
            'content' => 'x',
            'source_type' => 'conversation',
            'source_meta' => ['mode' => 'critic', 'message_count' => 4],
        ]);

        $response = $this->getJson("/api/notes/{$note->id}");
        $response->assertStatus(200)
            ->assertJsonPath('source_type', 'conversation')
            ->assertJsonPath('source_meta.mode', 'critic')
            ->assertJsonPath('source_meta.message_count', 4);
    }
}
