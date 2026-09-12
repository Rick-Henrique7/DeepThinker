<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // CORS para o frontend Vite (:5173) e origens locais.
        // Em produção, substituir por domínio real (env FRONTEND_ORIGIN).
        $frontendOrigin = env('FRONTEND_ORIGIN', 'http://localhost:5173');

        $middleware->statefulApi();

        $middleware->validateCsrfTokens(except: [
            'api/*',
        ]);

        $middleware->append(\Illuminate\Http\Middleware\HandleCors::class);

        // Middleware customizado para permitir preflight e headers adicionais
        $middleware->append(\App\Http\Middleware\AllowCorsFromFrontend::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();