package com.deepthinker.note;

/**
 * Avisa o resto do sistema que uma nota foi criada ou editada.
 * Quem escuta (a memória da IA) recalcula o vetor da nota depois que o banco confirma a gravação.
 * Assim o NoteService não precisa conhecer a memória: só "publica" o evento.
 */
public record NoteSavedEvent(Long noteId) {
}
