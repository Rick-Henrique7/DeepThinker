package com.deepthinker.llm;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

/** Uma linha de llm_settings: (usuário, provedor, chave) -> valor. */
@Entity
@Table(name = "llm_settings")
public class LlmSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 32)
    private String provider;

    @Column(name = "setting_key", nullable = false, length = 64)
    private String key;

    @Column(name = "setting_value", columnDefinition = "text")
    private String value;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LlmSetting() {
    }

    public LlmSetting(Long userId, String provider, String key, String value) {
        this.userId = userId;
        this.provider = provider;
        this.key = key;
        this.value = value;
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

    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
