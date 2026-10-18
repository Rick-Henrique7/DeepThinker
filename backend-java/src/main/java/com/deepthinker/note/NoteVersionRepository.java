package com.deepthinker.note;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** O id cresce sempre, então "id maior" = "versão mais nova" (mais simples que comparar datas). */
public interface NoteVersionRepository extends JpaRepository<NoteVersion, Long> {

    /**
     * Para a lista do histórico, sem o texto inteiro de cada versão (podem ser 100 versões de um
     * documento grande). O Spring Data preenche esta interface com as colunas da consulta.
     */
    interface Summary {
        Long getId();
        String getTitle();
        String getReason();
        Instant getCreatedAt();
        Integer getSize();
    }

    @Query("select v.id as id, v.title as title, v.reason as reason, v.createdAt as createdAt,"
            + " length(v.content) as size from NoteVersion v"
            + " where v.noteId = :noteId and v.userId = :userId order by v.id desc")
    List<Summary> summaries(Long noteId, Long userId);

    Optional<NoteVersion> findFirstByNoteIdOrderByIdDesc(Long noteId);

    Optional<NoteVersion> findByIdAndNoteIdAndUserId(Long id, Long noteId, Long userId);

    long countByNoteId(Long noteId);

    @Query("select v.id from NoteVersion v where v.noteId = :noteId order by v.id desc")
    List<Long> idsNewestFirst(Long noteId);
}
