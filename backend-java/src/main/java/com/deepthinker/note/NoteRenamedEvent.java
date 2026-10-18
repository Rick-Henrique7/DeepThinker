package com.deepthinker.note;

/**
 * Uma nota mudou de título. Quem guarda referências pelo título (os cartões de nota do Canvas,
 * que o formato JSON Canvas guarda como "Título.md") escuta e atualiza, para não quebrar.
 */
public record NoteRenamedEvent(Long userId, String oldTitle, String newTitle) {
}
