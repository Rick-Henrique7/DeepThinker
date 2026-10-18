package com.deepthinker.document;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentFileRepository extends JpaRepository<DocumentFile, Long> {

    /**
     * "Projeção": como DocumentFileInfo só tem getters de colunas pequenas, o Spring Data
     * monta um SELECT só com elas. Os bytes do arquivo nem saem do banco.
     */
    interface DocumentFileInfo {
        Long getNoteId();

        String getFilename();

        String getContentType();

        long getSizeBytes();
    }

    List<DocumentFileInfo> findInfoByUserId(Long userId);

    Optional<DocumentFileInfo> findInfoByNoteIdAndUserId(Long noteId, Long userId);

    Optional<DocumentFile> findByNoteIdAndUserId(Long noteId, Long userId);
}
