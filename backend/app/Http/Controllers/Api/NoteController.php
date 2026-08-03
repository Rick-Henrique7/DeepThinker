<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Note;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class NoteController extends Controller
{
    /**
     * Retorna os nós e conexões do PostgreSQL para o frontend renderizar o grafo.
     */
    public function graphData(): JsonResponse
    {
        $notes = Note::all(['id', 'title']);
        $connections = DB::table('connections')
            ->get(['source_note_id as source', 'target_note_id as target']);

        return response()->json([
            'nodes' => $notes,
            'links' => $connections,
        ]);
    }
}