<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\AiStreamController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\ConversationMessageController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\LlmSettingsController;

// =====================================================================
// Notas (CRUD + Grafo + Resumo)
// =====================================================================
Route::get('/notes', [NoteController::class, 'index']);
Route::post('/notes', [NoteController::class, 'store']);
Route::post('/notes/summarize', [NoteController::class, 'summarize']);
Route::get('/notes/titles', [NoteController::class, 'titles']);
Route::get('/notes/{note}', [NoteController::class, 'show']);
Route::put('/notes/{note}', [NoteController::class, 'update']);
Route::delete('/notes/{note}', [NoteController::class, 'destroy']);

// Endpoint exclusivo para o Grafo (React)
Route::get('/graph', [NoteController::class, 'graph']);

// =====================================================================
// Advogado do Diabo (IA) — multi-provider
// =====================================================================
Route::get('/chat/providers', [ChatController::class, 'providers']);
Route::match(['get', 'post'], '/chat/stream', [ChatController::class, 'stream']);
// Compat: rota legada aponta para AiStreamController (modo antigo)
Route::get('/chat/stream-legacy', [AiStreamController::class, 'stream']);

// =====================================================================
// Configuracoes de LLM (editaveis em runtime, sem restart)
// =====================================================================
Route::get('/settings/llm', [LlmSettingsController::class, 'show']);
Route::put('/settings/llm', [LlmSettingsController::class, 'update']);
Route::post('/settings/llm/test', [LlmSettingsController::class, 'test']);

// =====================================================================
// Historico de conversas
// =====================================================================
Route::get('/conversations', [ConversationMessageController::class, 'index']);
Route::post('/conversations', [ConversationMessageController::class, 'store']);
Route::get('/conversations/{conversationMessage}', [ConversationMessageController::class, 'show']);
Route::delete('/conversations/{conversationMessage}', [ConversationMessageController::class, 'destroy']);
Route::post('/conversations/clear', [ConversationMessageController::class, 'clearSession']);

// =====================================================================
// Upload de documentos
// =====================================================================
Route::post('/documents/upload', [DocumentController::class, 'upload']);
