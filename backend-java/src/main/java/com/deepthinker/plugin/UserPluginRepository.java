package com.deepthinker.plugin;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserPluginRepository extends JpaRepository<UserPlugin, Long> {

    List<UserPlugin> findByUserIdOrderByNameAsc(Long userId);

    Optional<UserPlugin> findByUserIdAndKey(Long userId, String key);

    Optional<UserPlugin> findByIdAndUserId(Long id, Long userId);

    long countByUserId(Long userId);
}
