package com.deepthinker.conversation;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

/** Uma mensagem do chat, agrupada por sessão (session_id) e opcionalmente ligada a uma nota. */
@Entity
@Table(name = "conversation_messages")
public class ConversationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore // o dono não precisa ir no JSON: só ele mesmo vê as próprias mensagens
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "note_id")
    private Long noteId;

    @Column(name = "session_id", length = 64)
    private String sessionId;

    @Column(nullable = false, length = 16)
    private String role;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ConversationMessage() {
    }

    public ConversationMessage(Long userId, Long noteId, String sessionId, String role, String content) {
        this.userId = userId;
        this.noteId = noteId;
        this.sessionId = sessionId;
        this.role = role;
        this.content = content;
    }

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
    public Long getNoteId() { return noteId; }
    public String getSessionId() { return sessionId; }
    public String getRole() { return role; }
    public String getContent() { return content; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
