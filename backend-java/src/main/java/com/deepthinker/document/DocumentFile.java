package com.deepthinker.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * O arquivo original de um documento importado (tabela criada em V9__create_document_files.sql).
 *
 * byte[] vira BYTEA no PostgreSQL e BINARY VARYING no H2. Para a lista de documentos não
 * carregar os bytes de todos os PDFs, ela usa DocumentFileInfo (só as colunas pequenas).
 */
@Entity
@Table(name = "document_files")
public class DocumentFile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "note_id", nullable = false)
    private Long noteId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String filename;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(nullable = false)
    private byte[] data;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected DocumentFile() {
        // exigido pelo JPA
    }

    public DocumentFile(Long userId, Long noteId, String filename, String contentType, byte[] data) {
        this.userId = userId;
        this.noteId = noteId;
        replace(filename, contentType, data);
    }

    /** Trocar o arquivo (enviar o original de novo) mantém a mesma linha. */
    public void replace(String filename, String contentType, byte[] data) {
        this.filename = filename;
        this.contentType = contentType;
        this.data = data;
        this.sizeBytes = data.length;
    }

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getNoteId() { return noteId; }
    public Long getUserId() { return userId; }
    public String getFilename() { return filename; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public byte[] getData() { return data; }
    public Instant getCreatedAt() { return createdAt; }
}
