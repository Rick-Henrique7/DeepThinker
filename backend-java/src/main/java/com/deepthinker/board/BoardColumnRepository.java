package com.deepthinker.board;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardColumnRepository extends JpaRepository<BoardColumn, Long> {

    List<BoardColumn> findByUserIdOrderByPositionAscIdAsc(Long userId);

    Optional<BoardColumn> findByIdAndUserId(Long id, Long userId);
}
