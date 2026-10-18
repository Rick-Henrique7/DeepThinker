package com.deepthinker.canvas;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

/**
 * Um canvas (tabela criada em V8__create_canvases.sql). O desenho fica em content, como texto
 * JSON no formato JSON Canvas; o Java não precisa de uma classe para cada cartão.
 *
 * @Version faz o JPA conferir a revision ao gravar: se outra gravação passou na frente
 * entre a leitura e a escrita, ele recusa em vez de sobrescrever (o "optimistic locking").
 */
@Entity
@Table(name = "canvases")
public class Canvas {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(nullable = false)
    private int cards;

    @Version
    @Column(nullable = false)
    private long revision;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Canvas() {
        // exigido pelo JPA
    }

    public Canvas(Long userId, String title, String content, int cards) {
        this.userId = userId;
        this.title = title;
        this.content = content;
        this.cards = cards;
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
    public Long getUserId() { return userId; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public int getCards() { return cards; }
    public long getRevision() { return revision; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setTitle(String title) { this.title = title; }
    public void setContent(String content) { this.content = content; }
    public void setCards(int cards) { this.cards = cards; }
}
