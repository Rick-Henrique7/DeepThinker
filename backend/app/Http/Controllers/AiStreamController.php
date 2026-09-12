<?php

namespace App\Http\Controllers;

use App\Models\ConversationMessage;
use App\Models\Note;
use App\Services\Contracts\LlmServiceContract;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streaming SSE de resposta da IA para o Devil's Advocate sidebar.
 *
 * Recebe um array de mensagens (histórico de conversa) e streama a resposta
 * do LLM local (LM Studio) de volta para o frontend.
 *
 * Endpoint: GET /api/chat/stream (compatibilidade com versão anterior)
 *           POST /api/chat/stream (recomendado, envia body com messages + mode)
 */
class AiStreamController extends Controller
{
    public function __construct(private LlmServiceContract $llm) {}

    public function stream(Request $request): StreamedResponse
    {
        $messages = $this->normalizeMessages($request);
        $mode = $request->input('mode', 'socratic');

        if (empty($messages)) {
            // Compat: GET sem body retorna um stream curto de boas-vindas.
            if ($request->getMethod() === 'GET') {
                return response()->stream(function () {
                    $msg = "Olá! Sou o Advogado do Diabo do DeepThinker. Envie uma mensagem para começar.";
                    foreach (explode(' ', $msg) as $word) {
                        echo "data: " . json_encode(['chunk' => $word . ' ']) . "\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                        usleep(50000);
                    }
                    echo "data: " . json_encode(['done' => true]) . "\n\n";
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }, 200, [
                    'Content-Type' => 'text/event-stream',
                    'Cache-Control' => 'no-cache',
                    'Connection' => 'keep-alive',
                    'X-Accel-Buffering' => 'no',
                ]);
            }
            return response()->stream(function () {
                echo "data: " . json_encode(['error' => 'Nenhuma mensagem fornecida.']) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }, 400, ['Content-Type' => 'text/event-stream']);
        }

        $systemPrompt = $this->buildSystemPrompt($mode);
        $fullMessages = array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        );

        $llm = $this->llm;
        $conversationId = $request->input('note_id'); // null por enquanto

        return response()->stream(function () use ($fullMessages, $llm, $conversationId) {
            $fullReply = '';

            try {
                foreach ($llm->stream($fullMessages) as $chunk) {
                    $fullReply .= $chunk;
                    echo "data: " . json_encode(['chunk' => $chunk]) . "\n\n";
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }
            } catch (\Throwable $e) {
                echo "data: " . json_encode(['error' => $e->getMessage()]) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
                return;
            }

            echo "data: " . json_encode(['done' => true]) . "\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();

            // Persistir mensagem do assistente ao final do stream (best-effort).
            try {
                if (!empty($conversationId)) {
                    ConversationMessage::create([
                        'note_id' => $conversationId,
                        'role' => 'assistant',
                        'content' => $fullReply,
                    ]);
                }
            } catch (\Throwable $e) {
                // Não bloquear a UX por falha de persistência.
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * Normaliza o input em array OpenAI-style.
     * Aceita: { messages: [...] } ou { message: "..." } (modo single-turn).
     */
    private function normalizeMessages(Request $request): array
    {
        if ($request->has('messages') && is_array($request->input('messages'))) {
            return $request->input('messages');
        }

        $single = $request->input('message');
        if (is_string($single) && $single !== '') {
            return [['role' => 'user', 'content' => $single]];
        }

        return [];
    }

    /**
     * Prompt de sistema conforme o modo selecionado pelo usuário.
     * Três modos: socratic, critic, brainstorm.
     */
    private function buildSystemPrompt(string $mode): string
    {
        $base = "Você é o Advogado do Diabo do DeepThinker, um assistente que ajuda o usuário a pensar com mais profundidade. Responda em português do Brasil, de forma clara e direta.";

        return match ($mode) {
            'critic' => $base . " Seu papel é encontrar falhas, vieses e pontos fracos nos argumentos do usuário. Seja implacável mas construtivo.",
            'brainstorm' => $base . " Seu papel é expandir horizontes: gere alternativas, conexões inesperadas e perguntas provocativas. Sem julgamento, foco em volume de ideias.",
            default => $base . " Seu papel é guiar o pensamento do usuário com perguntas socráticas: não dê respostas, faça perguntas que estimulem a reflexão e revelem contradições.",
        };
    }
}
