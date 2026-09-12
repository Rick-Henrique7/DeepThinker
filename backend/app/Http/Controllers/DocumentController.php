<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\Connection;
use App\Services\Contracts\LlmServiceContract;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Smalot\PdfParser\Parser as PdfParser;

/**
 * Upload de documentos (PDF/TXT/MD) — extrai texto, gera resumo via LLM
 * e cria uma nota linkada ao grafo.
 */
class DocumentController extends Controller
{
    public function __construct(private LlmServiceContract $llm) {}

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:10240', // 10 MB
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());
        $allowed = ['pdf', 'txt', 'md'];
        if (!in_array($extension, $allowed, true)) {
            return response()->json(['error' => 'Tipo não suportado. Use: ' . implode(', ', $allowed)], 422);
        }

        $path = $file->store('documents', 'local');
        $fullPath = Storage::disk('local')->path($path);

        $text = match ($extension) {
            'pdf' => $this->extractPdf($fullPath),
            'txt', 'md' => file_get_contents($fullPath) ?: '',
        };

        $text = trim($text);
        if (empty($text)) {
            return response()->json(['error' => 'Não foi possível extrair texto do documento.'], 422);
        }

        // Truncar para evitar estourar contexto do LLM
        if (strlen($text) > 12000) {
            $text = substr($text, 0, 12000) . "\n\n[... documento truncado para caber no contexto ...]";
        }

        $existingTitles = Note::pluck('title')->all();

        $prompt = "Você é o Advogado do Diabo do DeepThinker.\n\n"
            . "TAREFA ÚNICA: leia o documento abaixo e produza APENAS um objeto JSON válido. Não comente, não use markdown.\n\n"
            . "Formato EXATO:\n"
            . "{\"title\":\"<titulo curto em portugues>\",\"summary\":\"<resumo em 2 frases>\",\"key_points\":[{\"key\":\"<titulo do ponto>\",\"detail\":\"<detalhe>\"}]}\n\n"
            . "Reaproveite chaves existentes quando fizer sentido — se um ponto-chave coincide com uma destas notas, use o título EXATO:\n"
            . json_encode($existingTitles, JSON_UNESCAPED_UNICODE) . "\n\n"
            . "IMPORTANTE: Responda começando com { e terminando com }. Nada antes, nada depois.\n\n"
            . "Documento:\n---\n"
            . $text . "\n---\n\nJSON:";

        $raw = $this->llm->chat(
            [['role' => 'user', 'content' => $prompt]],
            options: ['temperature' => 0.2, 'max_tokens' => 600]
        );

        $parsed = $this->parseJsonLenient($raw);
        if ($parsed === null) {
            // Fallback: salva o conteúdo bruto como nota sem parsing estruturado
            $note = Note::create([
                'title' => substr('Doc: ' . pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME), 0, 255),
                'content' => $text,
                'summary' => mb_substr($text, 0, 280),
            ]);
            return response()->json([
                'note' => $note,
                'extracted_chars' => strlen($text),
                'fallback' => true,
            ], 201);
        }

        $title = substr($parsed['title'] ?? ('Doc: ' . $file->getClientOriginalName()), 0, 255);
        $summary = $parsed['summary'] ?? mb_substr($text, 0, 280);

        // Normaliza chaves existentes para lookup O(1)
        $existingMap = $this->buildTitleIndex($existingTitles);

        $mainNote = Note::create([
            'title' => $this->uniqueTitle($title, $existingMap),
            'content' => $text,
            'summary' => $summary,
        ]);

        $created = 0;
        $reused = 0;
        foreach (($parsed['key_points'] ?? []) as $kp) {
            $keyTitle = trim((string) ($kp['key'] ?? ''));
            if ($keyTitle === '' || mb_strlen($keyTitle) > 200) continue;
            $normalized = $this->normalize($keyTitle);
            if (isset($existingMap[$normalized])) {
                $targetId = $existingMap[$normalized];
                $reused++;
            } else {
                $newNote = Note::create([
                    'title' => $this->uniqueTitle($keyTitle, $existingMap),
                    'content' => $kp['detail'] ?? '',
                ]);
                $targetId = $newNote->id;
                $existingMap[$normalized] = $targetId;
                $created++;
            }
            // Evita auto-conexão e duplicatas
            if ($targetId === $mainNote->id) continue;
            Connection::firstOrCreate([
                'source_note_id' => $mainNote->id,
                'target_note_id' => $targetId,
            ]);
        }

        return response()->json([
            'note' => $mainNote,
            'extracted_chars' => strlen($text),
            'created' => $created,
            'reused' => $reused,
        ], 201);
    }

    private function extractPdf(string $path): string
    {
        try {
            $parser = new PdfParser();
            $pdf = $parser->parseFile($path);
            return $pdf->getText();
        } catch (\Throwable $e) {
            return '';
        }
    }

    /**
     * Tenta extrair JSON de respostas do LLM mesmo quando ele envolve em markdown.
     */
    private function parseJsonLenient(string $raw): ?array
    {
        $clean = trim($raw);
        // Remove cercas de código markdown
        if (str_starts_with($clean, '```')) {
            $clean = preg_replace('/^```(?:json)?\s*/i', '', $clean);
            $clean = preg_replace('/\s*```$/', '', $clean);
        }
        $decoded = json_decode($clean, true);
        if (is_array($decoded)) return $decoded;
        // Tenta extrair o primeiro bloco { ... }
        if (preg_match('/\{.*\}/s', $clean, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) return $decoded;
        }
        return null;
    }

    private function normalize(string $s): string
    {
        $s = mb_strtolower($s, 'UTF-8');
        $s = preg_replace('/\s+/u', ' ', $s);
        // Remove acentos
        $s = preg_replace('/[áàãâä]/u', 'a', $s);
        $s = preg_replace('/[éèêë]/u', 'e', $s);
        $s = preg_replace('/[íìîï]/u', 'i', $s);
        $s = preg_replace('/[óòõôö]/u', 'o', $s);
        $s = preg_replace('/[úùûü]/u', 'u', $s);
        $s = preg_replace('/ç/u', 'c', $s);
        return trim($s);
    }

    /**
     * @param array<int, string> $titles
     * @return array<string, int> map normalized title => id
     */
    private function buildTitleIndex(array $titles): array
    {
        $map = [];
        foreach (Note::query()->select('id', 'title')->get() as $n) {
            $map[$this->normalize($n->title)] = $n->id;
        }
        return $map;
    }

    private function uniqueTitle(string $title, array &$existingMap): string
    {
        $base = $title;
        $i = 2;
        $normalized = $this->normalize($title);
        while (isset($existingMap[$normalized])) {
            $title = $base . ' (' . $i . ')';
            $normalized = $this->normalize($title);
            $i++;
        }
        return $title;
    }
}
