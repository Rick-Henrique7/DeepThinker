<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\Connection;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class NoteController extends Controller
{
    /**
     * Retorna a lista completa de notas para a listagem no Frontend.
     */
    public function index(): JsonResponse
    {
        $notes = Note::select('id', 'title', 'summary', 'created_at')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($notes);
    }

    /**
     * Endpoint leve consumido pelo n8n: devolve apenas títulos e IDs
     * para alimentar a IA com o contexto de notas existentes.
     */
    public function titles(): JsonResponse
    {
        $titles = Note::select('id', 'title')->get();

        return response()->json($titles);
    }

    /**
     * Endpoint consumido pelo React: Devolve a estrutura de Nó (Nodes)
     * e Arestas (Links) para renderizar o Grafo de Conhecimento.
     */
    public function graph(): JsonResponse
    {
        // 1. Busca todos os Nós (Notas)
        $nodes = Note::select('id', 'title as label')->get();

        // 2. Busca todas as Arestas (Conexões entre notas)
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

    /**
     * Cria uma nova nota (Pode ser chamado tanto pelo React quanto pelo n8n).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|unique:notes,title|max:255',
            'content' => 'nullable|string',
            'summary' => 'nullable|string',
        ]);

        // O Observer será disparado aqui automaticamente ao salvar!
        $note = Note::create($validated);

        return response()->json($note, 201);
    }

    /**
     * Exibe o conteúdo detalhado de uma nota específica.
     */
    public function show(Note $note): JsonResponse
    {
        // Carrega também quais notas ela cita (connectedNotes)
        $note->load('connectedNotes');

        return response()->json($note);
    }
}