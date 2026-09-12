<?php

return [
    /*
    |--------------------------------------------------------------------------
    | CORS (Cross-Origin Resource Sharing) Configuration
    |--------------------------------------------------------------------------
    |
    | Configuração necessária para o frontend Vite em http://localhost:5173
    | acessar a API em http://localhost:8000 sem bloqueio de preflight.
    |
    | Em produção, substituir FRONTEND_ORIGIN pelo domínio real.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        env('FRONTEND_ORIGIN', 'http://localhost:5173'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['X-Token-Usage', 'X-Model-Name'],

    'max_age' => 86400,

    'supports_credentials' => false,
];
