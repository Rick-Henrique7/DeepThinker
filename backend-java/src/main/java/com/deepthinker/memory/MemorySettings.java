package com.deepthinker.memory;

import com.deepthinker.llm.LlmSetting;
import com.deepthinker.llm.LlmSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Qual modelo de embeddings cada usuário escolheu.
 *
 * Reaproveita a tabela llm_settings (a mesma das chaves de IA), com provider = "memory":
 *   (memory, embedding) -> "openai"
 *   (memory, model)     -> "text-embedding-3-small"
 *   (memory, base_url)  -> só para opções sem plugin, como o Ollama
 * Não guarda chave nenhuma: a chave vem do plugin de IA correspondente.
 */
@Service
public class MemorySettings {

    static final String PROVIDER = "memory";

    /** O que o usuário escolheu, já com os padrões preenchidos. */
    public record Choice(EmbeddingOption option, String model, String baseUrl) {
    }

    private final LlmSettingRepository repo;
    private final EmbeddingCatalog catalog;

    public MemorySettings(LlmSettingRepository repo, EmbeddingCatalog catalog) {
        this.repo = repo;
        this.catalog = catalog;
    }

    @Transactional(readOnly = true)
    public Choice choice(Long userId) {
        if (userId == null) {
            return new Choice(catalog.words(), catalog.words().defaultModel(), null);
        }
        EmbeddingOption option = catalog.find(value(userId, "embedding")).orElse(catalog.words());
        String model = value(userId, "model");
        String baseUrl = value(userId, "base_url");
        return new Choice(option,
                option.isBuiltIn() || model == null ? option.defaultModel() : model,
                baseUrl == null ? option.defaultBaseUrl() : baseUrl);
    }

    /** Grava a escolha. Trocar de opção apaga o modelo/endereço da opção anterior. */
    @Transactional
    public void save(Long userId, String optionId, String model, String baseUrl) {
        EmbeddingOption option = catalog.find(optionId)
                .orElseThrow(() -> new IllegalArgumentException("Opção de memória desconhecida: " + optionId));
        boolean changed = !option.id().equals(value(userId, "embedding"));
        put(userId, "embedding", option.id());
        if (changed) {
            remove(userId, "model");
            remove(userId, "base_url");
        }
        if (model != null && !model.isBlank() && !option.isBuiltIn()) {
            put(userId, "model", model.trim());
        }
        if (baseUrl != null && !baseUrl.isBlank() && option.baseUrlEditable()) {
            put(userId, "base_url", baseUrl.trim());
        }
    }

    private String value(Long userId, String key) {
        return repo.findByUserIdAndProviderAndKey(userId, PROVIDER, key)
                .map(LlmSetting::getValue)
                .filter(v -> !v.isBlank())
                .orElse(null);
    }

    private void put(Long userId, String key, String value) {
        LlmSetting s = repo.findByUserIdAndProviderAndKey(userId, PROVIDER, key)
                .orElseGet(() -> new LlmSetting(userId, PROVIDER, key, value));
        s.setValue(value);
        repo.save(s);
    }

    private void remove(Long userId, String key) {
        repo.findByUserIdAndProviderAndKey(userId, PROVIDER, key).ifPresent(repo::delete);
    }
}
