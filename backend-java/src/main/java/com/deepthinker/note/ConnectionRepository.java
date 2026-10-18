package com.deepthinker.note;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ConnectionRepository extends JpaRepository<Connection, Long> {

    List<Connection> findBySourceNoteId(Long sourceNoteId);

    boolean existsBySourceNoteIdAndTargetNoteId(Long sourceNoteId, Long targetNoteId);

    /** Conexões do grafo de um usuário: as que saem de uma nota dele. */
    @Query("SELECT c FROM Connection c WHERE c.sourceNoteId IN (SELECT n.id FROM Note n WHERE n.userId = :userId)")
    List<Connection> findByOwner(Long userId);

    /** Arestas que encostam em qualquer uma destas notas (saindo ou chegando). Usado pela memória da IA. */
    @Query("SELECT c FROM Connection c WHERE c.sourceNoteId IN :ids OR c.targetNoteId IN :ids")
    List<Connection> findTouching(Collection<Long> ids);

    @Modifying
    @Query("DELETE FROM Connection c WHERE c.sourceNoteId = :noteId")
    void deleteOutgoing(Long noteId);

    @Modifying
    @Query("DELETE FROM Connection c WHERE c.sourceNoteId = :noteId OR c.targetNoteId = :noteId")
    void deleteAllTouching(Long noteId);
}
