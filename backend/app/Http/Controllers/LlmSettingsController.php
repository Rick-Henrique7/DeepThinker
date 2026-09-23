<?php

namespace App\Http\Controllers;

use App\Services\LlmSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Endpoints pra editar credenciais e provider ativo sem reiniciar o server.
 *
 * GET  /api/settings/llm             -> snapshot (sem expor api_key crua)
 * PUT  /api/settings/llm             -> aplica mudancas (api_key, model, base_url, organization, provider)
 * POST /api/settings/llm/test        -> smoke-test do provider ativo (echo curto)
 */
class LlmSettingsController extends Controller
{
    public function show(LlmSettingsService $settings): JsonResponse
    {
        return response()->json($settings->snapshot());
    }

    public function update(Request $request, LlmSettingsService $settings): JsonResponse
    {
        $data = $request->validate([
            'provider'     => 'sometimes|in:lmstudio,openai',
            'api_key'      => 'sometimes|nullable|string|max:512',
            'model'        => 'sometimes|nullable|string|max:128',
            'base_url'     => 'sometimes|nullable|string|max:255',
            'organization' => 'sometimes|nullable|string|max:128',
        ]);

        $settings->apply($data);

        return response()->json([
            'ok' => true,
            'settings' => $settings->snapshot(),
        ]);
    }

    public function test(LlmSettingsService $settings): JsonResponse
    {
        $provider = $settings->getActiveProvider();
        try {
            $svc = match ($provider) {
                'openai'   => new \App\Services\OpenAiCloudService($settings),
                default    => new \App\Services\LmStudioService($settings),
            };

            if (!$svc->isAvailable()) {
                return response()->json([
                    'ok' => false,
                    'provider' => $provider,
                    'error' => $provider === 'openai'
                        ? 'API key nao configurada. Adicione em Settings.'
                        : 'LM Studio nao responde em /v1/models.',
                ], 503);
            }

            $reply = $svc->chat([
                ['role' => 'user', 'content' => 'Responda apenas com a palavra "ok" para confirmar conexao.'],
            ]);

            return response()->json([
                'ok' => true,
                'provider' => $provider,
                'reply' => trim($reply),
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'provider' => $provider,
                'error' => $e->getMessage(),
            ], 502);
        }
    }
}
