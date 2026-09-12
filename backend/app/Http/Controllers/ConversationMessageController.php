<?php

namespace App\Http\Controllers;

use App\Models\ConversationMessage;
use App\Models\Note;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

/**
 * CRUD do histórico de mensagens do chat (Advogado do Diabo).
 * Cada mensagem está ligada opcionalmente a uma nota (note_id).
 */
class ConversationMessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ConversationMessage::query()->orderBy('created_at', 'asc');

        if ($request->filled('note_id')) {
            $query->where('note_id', $request->input('note_id'));
        }

        if ($request->filled('session_id')) {
            // session_id é um UUID livre — agrupamos conversas sem nota
            $query->where('audio_url', 'session:' . $request->input('session_id'));
        }

        return response()->json($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'note_id' => 'nullable|integer|exists:notes,id',
            'role' => 'required|in:user,assistant,system',
            'content' => 'required|string',
            'session_id' => 'nullable|string|max:64',
        ]);

        $message = ConversationMessage::create([
            'note_id' => $validated['note_id'] ?? null,
            'role' => $validated['role'],
            'content' => $validated['content'],
            'audio_url' => isset($validated['session_id'])
                ? 'session:' . $validated['session_id']
                : null,
        ]);

        return response()->json($message, 201);
    }

    public function show(ConversationMessage $conversationMessage): JsonResponse
    {
        return response()->json($conversationMessage);
    }

    public function destroy(ConversationMessage $conversationMessage): JsonResponse
    {
        $conversationMessage->delete();
        return response()->json(['message' => 'Mensagem removida.']);
    }

    public function clearSession(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'session_id' => 'required|string|max:64',
        ]);

        $count = ConversationMessage::where('audio_url', 'session:' . $validated['session_id'])->delete();

        return response()->json(['deleted' => $count]);
    }
}
