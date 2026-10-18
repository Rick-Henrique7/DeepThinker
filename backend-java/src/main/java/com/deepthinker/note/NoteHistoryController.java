package com.deepthinker.note;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Histórico de versões: GET lista, GET uma versão, POST restaura. */
@RestController
@RequestMapping("/api/notes/{noteId}/versions")
public class NoteHistoryController {

    private final NoteHistoryService history;

    public NoteHistoryController(NoteHistoryService history) {
        this.history = history;
    }

    @GetMapping
    public List<NoteHistoryService.VersionItem> list(@PathVariable Long noteId) {
        return history.list(noteId);
    }

    @GetMapping("/{versionId}")
    public NoteHistoryService.VersionDetail get(@PathVariable Long noteId, @PathVariable Long versionId) {
        return history.get(noteId, versionId);
    }

    @PostMapping("/{versionId}/restore")
    public NoteHistoryService.RestoreResult restore(@PathVariable Long noteId, @PathVariable Long versionId) {
        return history.restore(noteId, versionId);
    }
}
