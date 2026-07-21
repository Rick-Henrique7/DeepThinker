<?php

namespace App\Http\Controllers;

use Symfony\Component\HttpFoundation\StreamedResponse;

class AiStreamController extends Controller
{
    /**
     * Simula o streaming de resposta da IA em tempo real via SSE (Server-Sent Events).
     */
    public function stream(): StreamedResponse
    {
        return response()->stream(function () {
            // Texto de exemplo que a IA enviaria em pedaços (tokens)
            $text = "Olá, Henri! O DeepThinker processou seu conceito e identificou conexões automáticas com o seu Grafo de Conhecimento em tempo real.";
            $words = explode(" ", $text);

            foreach ($words as $word) {
                // O protocolo SSE EXIGE o formato: "data: {conteúdo}\n\n"
                echo "data: " . json_encode(['chunk' => $word . ' ']) . "\n\n";

                // Libera o buffer do PHP para enviar a palavra IMEDIATAMENTE ao cliente
                if (ob_get_level() > 0) {
                    ob_flush();
                }
                flush();

                // Simula o tempo de geração de um modelo de linguagem (120ms por palavra)
                usleep(120000);
            }

            // Evento de finalização para avisar o Frontend que o streaming acabou
            echo "data: " . json_encode(['done' => true]) . "\n\n";
            if (ob_get_level() > 0) {
                ob_flush();
            }
            flush();
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no', // Evita que Nginx ou Nginx-Proxy segurem o buffer
        ]);
    }
}