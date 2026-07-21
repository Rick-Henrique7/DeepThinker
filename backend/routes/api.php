<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\NoteController;
use App\Http\Controllers\AiStreamController;

// Endpoints da API REST

// Rota para o streaming SSE
Route::get('/chat/stream', [AiStreamController::class, 'stream']);
Route::get('/notes', [NoteController::class, 'index']);
Route::post('/notes', [NoteController::class, 'store']);
Route::get('/notes/titles', [NoteController::class, 'titles']); // Rota leve para o n8n
Route::get('/notes/{note}', [NoteController::class, 'show']);

// Endpoint exclusivo para o Grafo (React)
Route::get('/graph', [NoteController::class, 'graph']);