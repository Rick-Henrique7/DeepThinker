package com.deepthinker.note;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * O Spring Data gera a implementação sozinho a partir do nome dos métodos.
 * Ex.: findByUserIdAndTitleIn vira "SELECT ... WHERE user_id = ? AND title IN (...)".
 *
 * Todo método recebe o userId: assim é impossível, por esquecimento,
 * listar ou abrir a nota de outra pessoa.
 */
public interface NoteRepository extends JpaRepository<Note, Long> {

    List<Note> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Note> findByUserId(Long userId);

    long countByUserId(Long userId);

    Optional<Note> findByIdAndUserId(Long id, Long userId);

    boolean existsByIdAndUserId(Long id, Long userId);

    List<Note> findByUserIdAndTitleIn(Long userId, Collection<String> titles);

    boolean existsByUserIdAndTitle(Long userId, String title);

    boolean existsByUserIdAndTitleAndIdNot(Long userId, String title, Long id);

    /** As notas de um tipo de origem: "document" (documentos importados), "highlight" (destaques)... */
    List<Note> findByUserIdAndSourceType(Long userId, String sourceType);
}
