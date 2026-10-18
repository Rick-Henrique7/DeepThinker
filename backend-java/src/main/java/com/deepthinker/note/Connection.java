package com.deepthinker.note;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Uma aresta do grafo: a nota de origem cita a nota de destino com [[Título]].
 * Guardamos só os ids (como no Laravel) para manter o modelo simples.
 */
@Entity
@Table(name = "connections")
public class Connection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "source_note_id", nullable = false)
    private Long sourceNoteId;

    @Column(name = "target_note_id", nullable = false)
    private Long targetNoteId;

    @Column(nullable = false)
    private double weight = 1.0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Connection() {
    }

    public Connection(Long sourceNoteId, Long targetNoteId) {
        this.sourceNoteId = sourceNoteId;
        this.targetNoteId = targetNoteId;
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
    public Long getSourceNoteId() { return sourceNoteId; }
    public Long getTargetNoteId() { return targetNoteId; }
    public double getWeight() { return weight; }
}
