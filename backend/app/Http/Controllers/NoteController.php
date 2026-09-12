<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\Connection;
use App\Services\Contracts\LlmServiceContract;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class NoteController extends Controller
{
    public function __construct(private LlmServiceContract $llm) {}

    public function index(): JsonResponse
    {
        $notes = Note::select('id', 'title', 'summary', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($notes);
    }

    public function titles(): JsonResponse
    {
        $titles = Note::select('id', 'title')->get();
        return response()->json($titles);
    }

    public function graph(): JsonResponse
    {
        $nodes = Note::select('id', 'title')->get();
        $links = Connection::select(
            'source_note_id as source',
            'target_note_id as target',
            'weight'
        )->get();

        return response()->json([
            'nodes' => $nodes,
            'links' => $links,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|unique:notes,title|max:255',
            'content' => 'nullable|string',
            'summary' => 'nullable|string',
        ]);

        $note = Note::create($validated);

        return response()->json($note, 201);
    }

    public function show(Note $note): JsonResponse
    {
        $note->load('connectedNotes');
        return response()->json($note);
    }

    public function update(Request $request, Note $note): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255|unique:notes,title,' . $note->id,
            'content' => 'nullable|string',
            'summary' => 'nullable|string',
        ]);

        $note->update($validated);
        return response()->json($note);
    }

    public function destroy(Note $note): JsonResponse
    {
        $note->outgoingConnections()->delete();
        $note->incomingConnections()->delete();
        $note->delete();

        return response()->json(['message' => 'Nota excluída com sucesso.']);
    }

    /**
     * Gera resumo estruturado da conversa e cria notas linkadas ao grafo.
     * Reaproveita chaves existentes (lookup O(N) via hashmap normalizado).
     */
    public function summarize(Request $request): JsonResponse
    {
        // Gemma 2B pode levar >30s pra gerar 1500 tokens; relaxa limite
        @set_time_limit(180);

        // Força leitura de JSON quando o body não é parseado automaticamente
        // (workaround para php artisan serve em alguns cenários)
        $json = $request->json()->all();
        if (empty($json) && !empty($request->getContent())) {
            $decoded = json_decode($request->getContent(), true);
            if (is_array($decoded)) {
                $request->merge($decoded);
            }
        }

        $validated = $request->validate([
            'messages' => 'required|array|min:2',
            'messages.*.role' => 'required|in:user,assistant,system',
            'messages.*.content' => 'required|string',
            'mode' => 'nullable|in:socratic,critic,brainstorm',
        ]);

        $existing = Note::query()->select('id', 'title')->get();
        $existingMap = [];
        foreach ($existing as $n) {
            $existingMap[$this->normalize($n->title)] = $n->id;
        }

        $conversation = '';
        foreach ($validated['messages'] as $m) {
            if ($m['role'] === 'system') continue;
            $conversation .= strtoupper($m['role']) . ": " . $m['content'] . "\n\n";
        }

        if (strlen($conversation) > 12000) {
            $conversation = substr($conversation, 0, 12000) . "\n\n[... conversa truncada ...]";
        }

        $prompt = "Você é o Advogado do Diabo do DeepThinker.\n\n"
            . "TAREFA ÚNICA: leia a conversa abaixo e produza APENAS um objeto JSON válido. Não continue a conversa, não comente, não use markdown.\n\n"
            . "Formato EXATO (siga à risca):\n"
            . "{\"title\":\"<titulo curto em portugues>\",\"summary\":\"<resumo em 2 frases>\",\"key_points\":[{\"key\":\"<titulo do ponto>\",\"detail\":\"<detalhe em 1 frase>\"},{\"key\":\"<titulo do ponto 2>\",\"detail\":\"<detalhe>\"}]}\n\n"
            . "Reaproveite chaves existentes quando fizer sentido — se um ponto-chave coincide com uma destas notas, use o título EXATO:\n"
            . json_encode($existing->pluck('title')->all(), JSON_UNESCAPED_UNICODE) . "\n\n"
            . "IMPORTANTE: Responda começando com { e terminando com }. Nada antes, nada depois.\n\n"
            . "Conversa:\n---\n"
            . $conversation . "\n---\n\nJSON:";

        $raw = $this->llm->chat(
            [['role' => 'user', 'content' => $prompt]],
            options: ['temperature' => 0.2, 'max_tokens' => 600]
        );

        $parsed = $this->parseJsonLenient($raw);
        if ($parsed === null) {
            return response()->json(['error' => 'LLM não retornou JSON válido.', 'raw' => $raw], 422);
        }

        $title = substr($parsed['title'] ?? 'Resumo Advogado do Diabo', 0, 255);
        $summary = $parsed['summary'] ?? '';

        $mainNote = Note::create([
            'title' => $this->uniqueTitle($title, $existingMap),
            'content' => $conversation,
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
            if ($targetId === $mainNote->id) continue;
            Connection::firstOrCreate([
                'source_note_id' => $mainNote->id,
                'target_note_id' => $targetId,
            ]);
        }

        return response()->json([
            'note' => $mainNote,
            'created' => $created,
            'reused' => $reused,
        ], 201);
    }

    private function normalize(string $s): string
    {
        $s = mb_strtolower($s, 'UTF-8');
        $s = preg_replace('/\s+/u', ' ', $s);
        $s = preg_replace('/[áàãâä]/u', 'a', $s);
        $s = preg_replace('/[éèêë]/u', 'e', $s);
        $s = preg_replace('/[íìîï]/u', 'i', $s);
        $s = preg_replace('/[óòõôö]/u', 'o', $s);
        $s = preg_replace('/[úùûü]/u', 'u', $s);
        $s = preg_replace('/ç/u', 'c', $s);
        return trim($s);
    }

    private function parseJsonLenient(string $raw): ?array
    {
        $clean = trim($raw);
        if (str_starts_with($clean, '```')) {
            $clean = preg_replace('/^```(?:json)?\s*/i', '', $clean);
            $clean = preg_replace('/\s*```$/', '', $clean);
        }
        $decoded = json_decode($clean, true);
        if (is_array($decoded)) return $decoded;
        if (preg_match('/\{.*\}/s', $clean, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded)) return $decoded;
        }
        return null;
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
