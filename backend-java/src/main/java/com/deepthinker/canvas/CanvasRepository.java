package com.deepthinker.canvas;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CanvasRepository extends JpaRepository<Canvas, Long> {

    List<Canvas> findByUserIdOrderByUpdatedAtDesc(Long userId);

    Optional<Canvas> findByIdAndUserId(Long id, Long userId);
}
