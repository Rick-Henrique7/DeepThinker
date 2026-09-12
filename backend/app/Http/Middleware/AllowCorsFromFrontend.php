<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware de CORS permissivo para dev local.
 *
 * Em produção, usar config/cors.php + HandleCors. Este middleware existe
 * para garantir que OPTIONS preflight sempre volte 200, mesmo se a config
 * falhar em ser carregada. Pode ser removido quando o projeto estiver em
 * produção com CORS via reverse proxy.
 */
class AllowCorsFromFrontend
{
    public function handle(Request $request, Closure $next): Response
    {
        $allowed = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ];

        $origin = $request->headers->get('Origin');
        if ($origin && in_array($origin, $allowed, true)) {
            $response = $next($request);
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
            $response->headers->set('Access-Control-Max-Age', '86400');
            return $response;
        }

        if ($request->getMethod() === 'OPTIONS') {
            return response('', 204);
        }

        return $next($request);
    }
}
