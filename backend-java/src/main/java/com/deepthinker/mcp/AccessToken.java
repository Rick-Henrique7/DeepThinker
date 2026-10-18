package com.deepthinker.mcp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

/** Um token de acesso pessoal (ver V10__create_access_tokens.sql). */
@Entity
@Table(name = "access_tokens")
public class AccessToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    /** Começo do token ("dt_ab12"), para a pessoa reconhecer qual é qual na lista. */
    @Column(nullable = false, length = 16)
    private String prefix;

    @Column(name = "can_write", nullable = false)
    private boolean canWrite;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at")
    private Instant lastUsedAt;

    protected AccessToken() {
    }

    public AccessToken(Long userId, String name, String tokenHash, String prefix, boolean canWrite) {
        this.userId = userId;
        this.name = name;
        this.tokenHash = tokenHash;
        this.prefix = prefix;
        this.canWrite = canWrite;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public String getPrefix() {
        return prefix;
    }

    public boolean isCanWrite() {
        return canWrite;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }

    public void setLastUsedAt(Instant lastUsedAt) {
        this.lastUsedAt = lastUsedAt;
    }
}
