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

    
    public function titles(): JsonResponse
    {
        $titles = Note::select('id', 'title')->get();

        return response()->json($titles);
    }

    public function graph(): JsonResponse
    {
        // 1. Busca todos os Nós (Notas)
        $nodes = Note::select('id', 'title')->get();

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

    public function show(Note $note): JsonResponse
    {
        // Carrega também quais notas ela cita (connectedNotes)
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
        // Remove conexões relacionadas antes de excluir a nota
        $note->outgoingConnections()->delete();
        $note->incomingConnections()->delete();
        $note->delete();

        return response()->json(['message' => 'Nota excluída com sucesso.']);
    }
}
