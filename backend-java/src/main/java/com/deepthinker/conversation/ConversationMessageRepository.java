package com.deepthinker.conversation;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/**
 * JpaSpecificationExecutor permite montar filtros opcionais em tempo de execução
 * (só por nota, só por sessão, ou os dois), como o query builder do Laravel.
 */
public interface ConversationMessageRepository
        extends JpaRepository<ConversationMessage, Long>, JpaSpecificationExecutor<ConversationMessage> {

    @Modifying
    @Query("DELETE FROM ConversationMessage m WHERE m.userId = :userId AND m.sessionId = :sessionId")
    int deleteBySession(Long userId, String sessionId);

    Optional<ConversationMessage> findByIdAndUserId(Long id, Long userId);

    static Specification<ConversationMessage> ownedBy(Long userId) {
        return (root, query, cb) -> cb.equal(root.get("userId"), userId);
    }

    static Specification<ConversationMessage> hasNote(Long noteId) {
        return (root, query, cb) -> noteId == null ? null : cb.equal(root.get("noteId"), noteId);
    }

    static Specification<ConversationMessage> hasSession(String sessionId) {
        return (root, query, cb) -> sessionId == null || sessionId.isEmpty()
                ? null : cb.equal(root.get("sessionId"), sessionId);
    }

    default List<ConversationMessage> search(Long userId, Long noteId, String sessionId) {
        return findAll(ownedBy(userId).and(hasNote(noteId)).and(hasSession(sessionId)),
                org.springframework.data.domain.Sort.by("createdAt", "id"));
    }
}
