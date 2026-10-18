package com.deepthinker.note;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Uma versão antiga de uma nota: o título e o texto como estavam antes de uma mudança
 * (tabela criada em V7__create_note_versions.sql). Versões nunca mudam depois de gravadas.
 */
@Entity
@Table(name = "note_versions")
public class NoteVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "note_id", nullable = false)
    private Long noteId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String content;

    @Column(nullable = false, length = 32)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected NoteVersion() {
        // exigido pelo JPA
    }

    public NoteVersion(Long noteId, Long userId, String title, String content, String reason) {
        this.noteId = noteId;
        this.userId = userId;
        this.title = title;
        this.content = content;
        this.reason = reason;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getNoteId() { return noteId; }
    public Long getUserId() { return userId; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
}
