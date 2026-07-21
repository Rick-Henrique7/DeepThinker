<?php

namespace App\Observers;

use App\Models\Note;
use App\Models\Connection;

class NoteObserver
{
    /**
     * Executado automaticamente após criar ou atualizar uma nota.
     */
    public function saved(Note $note): void
    {
        if (empty($note->content)) {
            return;
        }

        // Regex para capturar tudo que está entre [[ e ]]
        preg_match_all('/\[\[(.*?)\]\]/', $note->content, $matches);

        if (empty($matches[1])) {
            // Se o usuário apagou os links, limpa as conexões de saída
            $note->outgoingConnections()->delete();
            return;
        }

        $linkedTitles = array_unique($matches[1]);

        // Busca os IDs das notas que correspondem aos títulos citados
        $targetNoteIds = Note::whereIn('title', $linkedTitles)
            ->where('id', '!=', $note->id) // Evita autoconexão
            ->pluck('id');

        // Sincroniza as conexões (remove antigas não citadas e insere as novas)
        $connectionsToSync = [];
        foreach ($targetNoteIds as $targetId) {
            $connectionsToSync[] = [
                'source_note_id' => $note->id,
                'target_note_id' => $targetId,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        // Recria as conexões de saída da nota
        $note->outgoingConnections()->delete();
        if (!empty($connectionsToSync)) {
            Connection::insert($connectionsToSync);
        }
    }
}