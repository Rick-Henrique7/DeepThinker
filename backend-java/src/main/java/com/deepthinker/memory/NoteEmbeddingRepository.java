package com.deepthinker.memory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface NoteEmbeddingRepository extends JpaRepository<NoteEmbedding, Long> {

    /** Vetores das notas de um usuário, só do modelo em uso (vetores de modelos diferentes não se comparam). */
    @Query("SELECT e FROM NoteEmbedding e WHERE e.model = :model AND e.noteId IN "
            + "(SELECT n.id FROM Note n WHERE n.userId = :userId)")
    List<NoteEmbedding> findForUser(Long userId, String model);

    @Query("SELECT COUNT(e) FROM NoteEmbedding e WHERE e.model = :model AND e.noteId IN "
            + "(SELECT n.id FROM Note n WHERE n.userId = :userId)")
    long countForUser(Long userId, String model);
}
