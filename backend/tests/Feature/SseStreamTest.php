<?php

namespace Tests\Feature;

use Tests\TestCase;

class SseStreamTest extends TestCase
{
    /**
     * Testa se o endpoint SSE responde com os headers de streaming corretos.
     */
    public function test_can_stream_ai_response_via_sse(): void
    {
        $response = $this->get('/api/chat/stream');

        // Confirma que a resposta foi 200 OK
        $response->assertStatus(200);

        // Verifica se o Content-Type contém 'text/event-stream'
        $this->assertStringContainsString(
            'text/event-stream',
            $response->headers->get('Content-Type')
        );

        // Verifica se o Cache-Control contém 'no-cache'
        $this->assertStringContainsString(
            'no-cache',
            $response->headers->get('Cache-Control')
        );
    }
}