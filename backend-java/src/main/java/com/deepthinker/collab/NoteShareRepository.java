package com.deepthinker.collab;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteShareRepository extends JpaRepository<NoteShare, Long> {

    List<NoteShare> findByNoteIdOrderByIdAsc(Long noteId);

    List<NoteShare> findByUserIdOrderByIdDesc(Long userId);

    boolean existsByNoteIdAndUserId(Long noteId, Long userId);

    Optional<NoteShare> findByIdAndNoteId(Long id, Long noteId);
}
