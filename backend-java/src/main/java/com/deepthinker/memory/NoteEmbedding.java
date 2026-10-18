package com.deepthinker.memory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.time.Instant;

/**
 * O vetor de uma nota (tabela note_embeddings, criada em V6).
 *
 * O vetor vai para o banco como bytes (4 bytes por número). Funciona igual no H2
 * e no Postgres; quando precisar de busca indexada, dá para trocar por pgvector.
 */
@Entity
@Table(name = "note_embeddings")
public class NoteEmbedding {

    @Id
    @Column(name = "note_id")
    private Long noteId;

    @Column(nullable = false, length = 64)
    private String model;

    /** SHA-256 de (modelo + texto indexado): se não mudou, não recalcula. */
    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(nullable = false)
    private byte[] vector;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected NoteEmbedding() {
    }

    public NoteEmbedding(Long noteId) {
        this.noteId = noteId;
    }

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getNoteId() { return noteId; }
    public String getModel() { return model; }
    public String getContentHash() { return contentHash; }

    public void set(String model, String contentHash, float[] vector) {
        this.model = model;
        this.contentHash = contentHash;
        this.vector = toBytes(vector);
    }

    public float[] vector() {
        ByteBuffer buf = ByteBuffer.wrap(vector).order(ByteOrder.LITTLE_ENDIAN);
        float[] out = new float[vector.length / 4];
        for (int i = 0; i < out.length; i++) {
            out[i] = buf.getFloat();
        }
        return out;
    }

    static byte[] toBytes(float[] v) {
        ByteBuffer buf = ByteBuffer.allocate(v.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float x : v) {
            buf.putFloat(x);
        }
        return buf.array();
    }
}
