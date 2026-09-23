<?php

namespace App\Http\Controllers;

use App\Models\ConversationMessage;
use App\Services\Contracts\LlmServiceContract;
use App\Services\LlmSettingsService;
use App\Services\LmStudioService;
use App\Services\OpenAiCloudService;
use App\Services\Tools\ToolRegistry;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streaming de chat com suporte a multiplos providers e tool calling.
 *
 * POST /api/chat/stream
 * Body: {
 *   messages: [{role, content}],
 *   mode?: 'socratic' | 'critic' | 'brainstorm',
 *   provider?: 'lmstudio' | 'openai',
 *   model?: string,
 *   tools_enabled?: bool,        // habilita tool calling (create_note)
 *   session_id?: string,
 *   note_id?: int,
 * }
 *
 * Se provider/model nao forem passados, usa o provider default
 * configurado em LlmSettingsService (editavel em runtime).
 *
 * Quando `tools_enabled=true` e o modelo decide chamar uma tool
 * (ex: create_note), o backend:
 *   1. Emite evento SSE `tool_call` com id/name/arguments
 *   2. Executa o handler da tool
 *   3. Emite evento SSE `tool_result` com o retorno
 * O frontend renderiza inline (sem travar o stream do texto).
 */
class ChatController extends Controller
{
    private const PROVIDERS = ['lmstudio', 'openai'];

    public function stream(Request $request): StreamedResponse
    {
        $settings = app(LlmSettingsService::class);
        $messages = $this->normalizeMessages($request);
        $mode = $request->input('mode', 'socratic');
        $provider = $this->resolveProvider($request, $settings);
        $model = $request->input('model');
        $toolsEnabled = $request->boolean('tools_enabled');
        $sessionId = $request->input('session_id');
        $noteId = $request->input('note_id');

        if (empty($messages)) {
            // Compat: GET sem body devolve um stream curto de boas-vindas (200).
            if ($request->getMethod() === 'GET') {
                return response()->stream(function () {
                    $msg = 'Ola! Sou o Advogado do Diabo do DeepThinker. Envie uma mensagem para comecar.';
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

        $llm = $this->makeService($provider);
        if (!$llm->isAvailable()) {
            return response()->stream(function () use ($provider) {
                $hint = $provider === 'openai'
                    ? 'Defina a API key em Settings -> IA.'
                    : "Verifique se LM Studio esta rodando.";
                echo "data: " . json_encode(['error' => "Provider '{$provider}' indisponivel. {$hint}"]) . "\n\n";
                if (ob_get_level() > 0) ob_flush();
                flush();
            }, 503, ['Content-Type' => 'text/event-stream']);
        }

        $systemPrompt = $this->buildSystemPrompt($mode, $toolsEnabled);
        $fullMessages = array_merge(
            [['role' => 'system', 'content' => $systemPrompt]],
            $messages
        );

        $tools = $toolsEnabled ? ToolRegistry::catalog() : null;

        return response()->stream(function () use ($fullMessages, $llm, $model, $noteId, $sessionId, $provider, $tools) {
            $fullReply = '';
            try {
                foreach ($llm->stream($fullMessages, $model, [], $tools) as $item) {
                    if (is_array($item) && isset($item['tool_call'])) {
                        // Tool call detectado — emite evento e executa handler
                        $tc = $item['tool_call'];
                        echo "data: " . json_encode(['tool_call' => $tc, 'provider' => $provider]) . "\n\n";
                        if (ob_get_level() > 0) ob_flush();
                        flush();
                        $this->handleToolCall($tc);
                        continue;
                    }
                    if (is_array($item) && isset($item['error'])) {
                        throw new \RuntimeException($item['error']);
                    }
                    $fullReply .= (string) $item;
                    echo "data: " . json_encode(['chunk' => (string) $item, 'provider' => $provider]) . "\n\n";
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
                if (!empty($noteId) && $fullReply !== '') {
                    ConversationMessage::create([
                        'note_id' => $noteId,
                        'role' => 'assistant',
                        'content' => $fullReply,
                    ]);
                }
                // Persistir tb na sessao (audio_url hack que ja existe)
                if (!empty($sessionId) && $fullReply !== '') {
                    ConversationMessage::create([
                        'role' => 'assistant',
                        'content' => $fullReply,
                        'audio_url' => 'session:' . $sessionId,
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
     * Executa uma tool_call e emite o tool_result como SSE event.
     *
     * @param array<string, mixed> $tc
     */
    private function handleToolCall(array $tc): void
    {
        $name = (string) ($tc['function']['name'] ?? '');
        $argsRaw = (string) ($tc['function']['arguments'] ?? '{}');
        $callId = (string) ($tc['id'] ?? '');

        $handlers = ToolRegistry::handlers();
        if (!isset($handlers[$name])) {
            echo "data: " . json_encode([
                'tool_result' => [
                    'call_id' => $callId,
                    'name' => $name,
                    'ok' => false,
                    'error' => "Tool desconhecida: {$name}",
                ],
            ]) . "\n\n";
            if (ob_get_level() > 0) ob_flush();
            flush();
            return;
        }

        $args = json_decode($argsRaw, true);
        if (!is_array($args)) {
            $args = [];
        }

        try {
            $result = $handlers[$name]($args);
            echo "data: " . json_encode([
                'tool_result' => [
                    'call_id' => $callId,
                    'name' => $name,
                    'ok' => true,
                    'result' => $result,
                ],
            ]) . "\n\n";
        } catch (\Throwable $e) {
            echo "data: " . json_encode([
                'tool_result' => [
                    'call_id' => $callId,
                    'name' => $name,
                    'ok' => false,
                    'error' => $e->getMessage(),
                ],
            ]) . "\n\n";
        }
        if (ob_get_level() > 0) ob_flush();
        flush();
    }

    /**
     * GET /api/chat/providers — lista providers e modelos disponiveis.
     * Agora reflete o `active_provider` em LlmSettingsService (editavel).
     */
    public function providers(): \Illuminate\Http\JsonResponse
    {
        $settings = app(LlmSettingsService::class);
        $catalog = (array) config('llm.catalog', []);
        $available = [];
        foreach (self::PROVIDERS as $p) {
            $svc = $this->makeService($p);
            $available[$p] = [
                'available' => $svc->isAvailable(),
                'models' => $catalog[$p] ?? [],
                'default_model' => (string) ($settings->getKey($p, 'model')
                    ?? config("llm.providers.{$p}.default_model")),
            ];
        }
        return response()->json([
            'default' => $settings->getActiveProvider(),
            'providers' => $available,
        ]);
    }

    /**
     * GET /api/chat/tools — catalogo de tools disponiveis para o Advogado.
     */
    public function tools(): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'tools' => ToolRegistry::catalog(),
            'handlers' => array_keys(ToolRegistry::handlers()),
        ]);
    }

    private function resolveProvider(Request $request, LlmSettingsService $settings): string
    {
        $req = $request->input('provider');
        if (in_array($req, self::PROVIDERS, true)) {
            return $req;
        }
        return $settings->getActiveProvider();
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

    private function buildSystemPrompt(string $mode, bool $toolsEnabled): string
    {
        $base = "Voce e o Advogado do Diabo do DeepThinker, um assistente que ajuda o usuario a pensar com mais profundidade. Responda em portugues do Brasil, de forma clara e direta.";
        $role = match ($mode) {
            'critic' => "Seu papel e encontrar falhas, vieses e pontos fracos nos argumentos do usuario. Seja implacavel mas construtivo.",
            'brainstorm' => "Seu papel e expandir horizontes: gere alternativas, conexoes inesperadas e perguntas provocativas. Sem julgamento, foco em volume de ideias.",
            default => "Seu papel e guiar o pensamento do usuario com perguntas socraticas: nao de respostas, faca perguntas que estimulem a reflexao e revelem contradicoes.",
        };
        $toolHint = $toolsEnabled
            ? "\n\nVoce tem acesso a ferramenta `create_note(title, content, summary)`. Use SOMENTE quando o usuario pedir explicitamente para salvar algo OU quando voce identificar uma ideia madura o suficiente que valha virar nota. NAO use para mensagens triviais."
            : '';
        return $base . ' ' . $role . $toolHint;
    }
}
