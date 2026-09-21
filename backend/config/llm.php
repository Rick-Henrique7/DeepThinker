<?php

return [
    /*
    |--------------------------------------------------------------------------
    | LLM Provider Configuration
    |--------------------------------------------------------------------------
    |
    | Define qual provider de LLM usar. Cada provider tem sua config
    | própria (api_key, base_url, default_model, timeout).
    |
    | LLM_PROVIDER no .env escolhe qual servico sera instanciado.
    |
    */

    'provider' => env('LLM_PROVIDER', 'lmstudio'),

    'providers' => [
        'lmstudio' => [
            'base_url' => env('LMSTUDIO_BASE_URL', 'http://localhost:1234/v1'),
            'api_key' => env('LMSTUDIO_API_KEY', 'lm-studio'),
            'default_model' => env('LMSTUDIO_MODEL', 'meta-llama-3.1-8b-instruct'),
            'timeout' => (int) env('LMSTUDIO_TIMEOUT', 120),
            'context_window' => (int) env('LMSTUDIO_CONTEXT_WINDOW', 8192),
        ],

        'openai' => [
            'api_key' => env('OPENAI_API_KEY', ''),
            'organization' => env('OPENAI_ORG_ID', ''),
            'default_model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
            'timeout' => (int) env('OPENAI_TIMEOUT', 60),
        ],
    ],

    /*
    | Lista de modelos sugeridos para o frontend (UI selector).
    */
    'catalog' => [
        'lmstudio' => [
            'meta-llama-3.1-8b-instruct',
            'gemma-1.1-2b-it',
        ],
        'openai' => [
            'gpt-4o-mini',
            'gpt-4o',
            'gpt-4-turbo',
            'gpt-3.5-turbo',
        ],
    ],
];
