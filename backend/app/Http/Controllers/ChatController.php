<?php

namespace App\Http\Controllers;

use App\Models\ConversationMessage;
use App\Services\Contracts\LlmServiceContract;
use App\Services\LmStudioService;
use App\Services\OpenAiCloudService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streaming de chat com suporte a multiplos providers.
 *
 * POST /api/chat/stream
 * Body: { messages, mode?, provider?, model? }
 *
 * Se provider/model nao forem passados, usa o provider default
 * configurado em config/llm.php (env LLM_PROVIDER).
 */
class ChatController extends Controller
{
    private const PROVIDERS = ['lmstudio', 'openai'];

    public function stream(Request $request): StreamedResponse
    {
        $messages = $this->normalizeMessages($request);
        $mode = $request->input('mode', 'socratic');
        $provider = $this->resolveProvider($request);
        $model = $request->input('model');

        if (empty($messages)) {
            return response()->stream(function () {
                echo "data: " . json_encode(['error' => 'Nenhuma mensagem fornecida.']) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }, 400, ['Content-Type' => 'text/event-stream']);
        }

        $llm = $this->makeService($provider);
        if (!$llm->isAvailable()) {
            return response()->stream(function () use ($provider) {
                $hint = $provider === 'openai'
                    ? 'Configure OPENAI_API_KEY no .env do backend.'
                    : "Verifique se LM Studio esta rodando.";
                echo "data: " . json_encode(['error' => "Provider '{$provider}' indisponivel. {$hint}"]) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }, 503, ['Content-Type' => 'text/event-stream']);
        }

        $systemPrompt = $this->buildSystemPrompt($mode);
        $fullMessages = array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        );

        $noteId = $request->input('note_id');

        return response()->stream(function () use ($fullMessages, $llm, $model, $noteId, $provider) {
            $fullReply = '';
            try {
                foreach ($llm->stream($fullMessages, $model) as $chunk) {
                    $fullReply .= $chunk;
                    echo "data: " . json_encode(['chunk' => $chunk, 'provider' => $provider]) . "\n\n";
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

            // Persistir mensagem do assistant (best-effort)
            try {
                if (!empty($noteId)) {
                    ConversationMessage::create([
                        'note_id' => $noteId,
                        'role' => 'assistant',
                        'content' => $fullReply,
                    ]);
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
            'X-Provider' => $provider,
        ]);
    }

    /**
     * GET /api/chat/providers — lista providers e modelos disponiveis.
     */
    public function providers(): \Illuminate\Http\JsonResponse
    {
        $default = config('llm.provider', 'lmstudio');
        $catalog = (array) config('llm.catalog', []);
        $available = [];
        foreach (self::PROVIDERS as $p) {
            $svc = $this->makeService($p);
            $available[$p] = [
                'available' => $svc->isAvailable(),
                'models' => $catalog[$p] ?? [],
            ];
        }
        return response()->json([
            'default' => $default,
            'providers' => $available,
        ]);
    }

    private function resolveProvider(Request $request): string
    {
        $req = $request->input('provider');
        if (in_array($req, self::PROVIDERS, true)) {
            return $req;
        }
        return config('llm.provider', 'lmstudio');
    }

    private function makeService(string $provider): LlmServiceContract
    {
        return match ($provider) {
            'openai' => new OpenAiCloudService(),
            default => new LmStudioService(),
        };
    }

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

    private function buildSystemPrompt(string $mode): string
    {
        $base = "Voce e o Advogado do Diabo do DeepThinker, um assistente que ajuda o usuario a pensar com mais profundidade. Responda em portugues do Brasil, de forma clara e direta.";
        return match ($mode) {
            'critic' => $base . " Seu papel e encontrar falhas, vieses e pontos fracos nos argumentos do usuario. Seja implacavel mas construtivo.",
            'brainstorm' => $base . " Seu papel e expandir horizontes: gere alternativas, conexoes inesperadas e perguntas provocativas. Sem julgamento, foco em volume de ideias.",
            default => $base . " Seu papel e guiar o pensamento do usuario com perguntas socraticas: nao de respostas, faca perguntas que estimulem a reflexao e revelem contradicoes.",
        };
    }
}
