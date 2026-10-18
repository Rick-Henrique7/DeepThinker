package com.deepthinker.mcp;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccessTokenRepository extends JpaRepository<AccessToken, Long> {

    Optional<AccessToken> findByTokenHash(String tokenHash);

    List<AccessToken> findByUserIdOrderByIdDesc(Long userId);

    Optional<AccessToken> findByIdAndUserId(Long id, Long userId);
}
