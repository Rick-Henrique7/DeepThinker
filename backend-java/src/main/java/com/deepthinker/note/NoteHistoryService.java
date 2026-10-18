package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Histórico de versões de uma nota: listar, ver uma versão e restaurar.
 * Quem GRAVA as versões é o NoteService.saveEdit (toda mudança passa por lá);
 * aqui só lemos e restauramos.
 */
@Service
public class NoteHistoryService {

    public record VersionItem(Long id, String title, String reason, Instant createdAt, int size) {
    }

    public record VersionDetail(Long id, String title, String content, String reason, Instant createdAt) {
    }

    /** titleRestored = false quando o título antigo já é de outra nota (aí só o texto volta). */
    public record RestoreResult(NoteDtos.NoteDetail note, boolean titleRestored) {
    }

    private final NoteService noteService;
    private final NoteRepository notes;
    private final NoteVersionRepository versions;

    public NoteHistoryService(NoteService noteService, NoteRepository notes, NoteVersionRepository versions) {
        this.noteService = noteService;
        this.notes = notes;
        this.versions = versions;
    }

    @Transactional(readOnly = true)
    public List<VersionItem> list(Long noteId) {
        noteService.owned(noteId); // 404 se a nota não for sua
        return versions.summaries(noteId, CurrentUser.id()).stream()
                .map(v -> new VersionItem(v.getId(), v.getTitle(), v.getReason(), v.getCreatedAt(),
                        v.getSize() == null ? 0 : v.getSize()))
                .toList();
    }

    @Transactional(readOnly = true)
    public VersionDetail get(Long noteId, Long versionId) {
        NoteVersion v = find(noteId, versionId);
        return new VersionDetail(v.getId(), v.getTitle(), v.getContent(), v.getReason(), v.getCreatedAt());
    }

    /**
     * Volta a nota para uma versão antiga. Restaurar também é uma mudança, então o estado de
     * agora vira uma versão nova antes ("restauracao"): dá para desfazer a restauração.
     */
    @Transactional
    public RestoreResult restore(Long noteId, Long versionId) {
        Note note = noteService.owned(noteId);
        NoteVersion v = find(noteId, versionId);
        boolean titleFree = !notes.existsByUserIdAndTitleAndIdNot(note.getUserId(), v.getTitle(), noteId);
        noteService.saveEdit(note, titleFree ? v.getTitle() : note.getTitle(), v.getContent(), "restauracao");
        return new RestoreResult(NoteDtos.NoteDetail.of(note, null), titleFree);
    }

    private NoteVersion find(Long noteId, Long versionId) {
        return versions.findByIdAndNoteIdAndUserId(versionId, noteId, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Versão não encontrada."));
    }
}
