package com.deepthinker.llm;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LlmSettingRepository extends JpaRepository<LlmSetting, Long> {

    Optional<LlmSetting> findByUserIdAndProviderAndKey(Long userId, String provider, String key);

    void deleteByUserIdAndProviderAndKey(Long userId, String provider, String key);
}
