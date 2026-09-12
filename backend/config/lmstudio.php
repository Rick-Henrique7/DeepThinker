<?php

return [
    /*
    |--------------------------------------------------------------------------
    | LM Studio (Local LLM Runtime) Configuration
    |--------------------------------------------------------------------------
    |
    | LM Studio expõe uma API compatível com OpenAI em /v1/chat/completions
    | quando o servidor local está ativo (Developer → Start Server).
    |
    | Endereço padrão: http://localhost:1234/v1
    | Documentação: https://lmstudio.ai/docs/api
    |
    */

    'base_url' => env('LMSTUDIO_BASE_URL', 'http://localhost:1234/v1'),
    'api_key' => env('LMSTUDIO_API_KEY', 'lm-studio'), // LM Studio ignora o token, mas o cliente HTTP exige um valor
    'default_model' => env('LMSTUDIO_MODEL', 'gemma-1.1-2b-it'),
    'timeout' => (int) env('LMSTUDIO_TIMEOUT', 120),
    'stream_chunk_size' => (int) env('LMSTUDIO_STREAM_CHUNK', 8),
];
