<?php

namespace Tests\Feature;

use App\Models\Note;
use App\Models\Connection;
use App\Services\Contracts\LlmServiceContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SummarizeTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, int> */
    private array $llmCalls;

    protected function setUp(): void
    {
        parent::setUp();
        $this->llmCalls = [];

        // Bind a fake LLM service that returns a predictable JSON response.
        $this->app->bind(LlmServiceContract::class, function () {
            return new class implements LlmServiceContract {
                public function chat(array $messages, ?string $model = null, array $options = []): string
                {
                    return json_encode([
                        'title' => 'Síntese da Conversa',
                        'summary' => 'Resumo de teste criado pelo LLM mock.',
                        'key_points' => [
                            ['key' => 'Ponto Alpha', 'detail' => 'Detalhe alpha.'],
                            ['key' => 'Ponto Beta', 'detail' => 'Detalhe beta.'],
                        ],
                    ], JSON_UNESCAPED_UNICODE);
                }

                public function stream(array $messages, ?string $model = null, array $options = []): \Generator
                {
                    yield 'chunk';
                }

                public function estimateTokens(string $text): int
                {
                    return max(1, (int) ceil(str_word_count($text) / 0.75));
                }

                public function contextWindow(): int
                {
                    return 8192;
                }

                public function isAvailable(): bool
                {
                    return true;
                }

                public function listModels(): array
                {
                    return ['mock-model'];
                }
            };
        });
    }

    public function test_summarize_creates_main_note(): void
    {
        $response = $this->postJson('/api/notes/summarize', [
            'messages' => [
                ['role' => 'user', 'content' => 'Quero entender sobre X.'],
                ['role' => 'assistant', 'content' => 'Conte-me mais sobre X.'],
            ],
            'mode' => 'socratic',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('note.title', 'Síntese da Conversa')
            ->assertJsonPath('created', 2)
            ->assertJsonPath('reused', 0);

        $this->assertDatabaseHas('notes', ['title' => 'Síntese da Conversa']);
        $this->assertDatabaseHas('notes', ['title' => 'Ponto Alpha']);
        $this->assertDatabaseHas('notes', ['title' => 'Ponto Beta']);
    }

    public function test_summarize_reuses_existing_key_with_normalization(): void
    {
        // Cria uma nota existente com título que difere apenas em acentos/caixa
        Note::create(['title' => 'Processo Ágil']);

        $this->app->bind(LlmServiceContract::class, function () {
            return new class implements LlmServiceContract {
                public function chat(array $messages, ?string $model = null, array $options = []): string
                {
                    // LLM devolve título com acentos diferentes — o algoritmo deve normalizar
                    return json_encode([
                        'title' => 'Resumo Novo',
                        'summary' => 'Síntese.',
                        'key_points' => [
                            ['key' => 'processo agil', 'detail' => 'Reuso esperado.'],
                            ['key' => 'Outro Ponto', 'detail' => 'Deve criar.'],
                        ],
                    ], JSON_UNESCAPED_UNICODE);
                }

                public function stream(array $messages, ?string $model = null, array $options = []): \Generator { yield 'x'; }
                public function estimateTokens(string $text): int { return 1; }
                public function contextWindow(): int { return 8192; }
                public function isAvailable(): bool { return true; }
                public function listModels(): array { return ['mock']; }
            };
        });

        $response = $this->postJson('/api/notes/summarize', [
            'messages' => [
                ['role' => 'user', 'content' => 'msg'],
                ['role' => 'assistant', 'content' => 'resp'],
            ],
        ]);

        $response->assertStatus(201);
        $data = $response->json();
        // "processo agil" normalizado == "processo agil" da nota existente => 1 reuso, 1 criação
        $this->assertEquals(1, $data['reused']);
        $this->assertEquals(1, $data['created']);

        // Não deve ter criado uma nova nota "Processo Ágil (2)"
        $this->assertDatabaseMissing('notes', ['title' => 'Processo Ágil (2)']);
    }

    public function test_summarize_validates_messages(): void
    {
        $response = $this->postJson('/api/notes/summarize', [
            'messages' => [],
        ]);
        $response->assertStatus(422);
    }
}
