package com.deepthinker.note;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;

/**
 * Uma nota do grafo. Equivale ao model Note do Laravel: cada campo aqui
 * é uma coluna da tabela "notes" (criada em V1__create_notes_and_connections.sql).
 */
@Entity
@Table(name = "notes")
public class Note {

    /** source_type dos cartões criados direto no Quadro: vivem só no Quadro (ver NoteService.inGraph). */
    public static final String SOURCE_BOARD = "board";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Dono da nota. O título é único por usuário (ver V5__note_titles_unique_per_user). */
    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String content;

    @Column(columnDefinition = "text")
    private String summary;

    @Column(name = "source_type", length = 32)
    private String sourceType;

    /** JSON livre com a origem da nota (conversa, documento...). */
    @Column(name = "source_meta", columnDefinition = "text")
    @Convert(converter = JsonMapConverter.class)
    private Map<String, Object> sourceMeta;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Note() {
        // exigido pelo JPA
    }

    public Note(Long userId, String title, String content, String summary) {
        this.userId = userId;
        this.title = title;
        this.content = content;
        this.summary = summary;
    }

    // Equivalente aos timestamps automáticos do Eloquent
    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public Map<String, Object> getSourceMeta() { return sourceMeta; }
    public void setSourceMeta(Map<String, Object> sourceMeta) { this.sourceMeta = sourceMeta; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
