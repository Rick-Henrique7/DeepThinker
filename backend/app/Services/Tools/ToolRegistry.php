<?php

namespace App\Services\Tools;

use App\Models\Note;

/**
 * Catalogo de tools que o Advogado do Diabo pode invocar.
 *
 * Segue o formato OpenAI tool calling:
 *   https://platform.openai.com/docs/guides/function-calling
 *
 * Modelos compativeis (LM Studio com Llama 3.1 / Gemma 2, OpenAI gpt-4o-mini)
 * recebem o array `tools` no payload e decidem quando chamar.
 */
class ToolRegistry
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public static function catalog(): array
    {
        return [
            [
                'type' => 'function',
                'function' => [
                    'name' => 'create_note',
                    'description' => 'Cria uma nota no grafo de conhecimento do DeepThinker. Use quando o usuario disser explicitamente que quer salvar algo, ou quando identificar uma ideia/decision/conceito importante durante a conversa.',
                    'parameters' => [
                        'type' => 'object',
                        'properties' => [
                            'title' => [
                                'type' => 'string',
                                'description' => 'Titulo curto em portugues (max ~60 chars). Idealmente 2-4 palavras. Ex: "Medo de falir", "Capital inicial".',
                            ],
                            'content' => [
                                'type' => 'string',
                                'description' => 'Conteudo principal da nota. Pode ser 1-3 paragrafos explicando a ideia.',
                            ],
                            'summary' => [
                                'type' => 'string',
                                'description' => 'Resumo em 1 frase da nota (opcional).',
                            ],
                        ],
                        'required' => ['title', 'content'],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, callable> map name => handler
     */
    public static function handlers(): array
    {
        return [
            'create_note' => [self::class, 'createNote'],
        ];
    }

    /**
     * Handler do create_note. Persiste via Note::create e retorna
     * resumo do que foi criado (id + title + reuse de chave).
     *
     * @param array<string, mixed> $args
     * @return array<string, mixed>
     */
    public static function createNote(array $args): array
    {
        $title = substr(trim((string) ($args['title'] ?? 'Nota sem titulo')), 0, 255);
        $content = (string) ($args['content'] ?? '');
        $summary = isset($args['summary']) ? substr((string) $args['summary'], 0, 500) : null;

        if ($title === '' || $content === '') {
            return ['error' => 'title e content sao obrigatorios'];
        }

        $note = Note::create([
            'title' => $title,
            'content' => $content,
            'summary' => $summary,
            'source_type' => 'conversation',
            'source_meta' => [
                'created_via' => 'tool_call',
                'created_at_tool' => now()->toIso8601String(),
            ],
        ]);

        return [
            'ok' => true,
            'note_id' => $note->id,
            'title' => $note->title,
            'message' => "Nota #{$note->id} '{$note->title}' criada.",
        ];
    }
}
