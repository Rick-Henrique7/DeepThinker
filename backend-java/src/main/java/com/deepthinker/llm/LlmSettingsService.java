package com.deepthinker.llm;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.llm.LlmProperties.PluginOverride;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configurações de IA editáveis em tempo de execução, por plugin.
 *
 * Cada usuário tem as próprias configurações (e paga a própria IA).
 *
 * Ordem de prioridade de cada valor:
 *   1. o que o usuário salvou pela tela (tabela llm_settings)
 *   2. variável de ambiente (application.yml, bloco deepthinker.llm.plugins)
 *   3. o padrão do plugin (PluginCatalog)
 *
 * A API key é sempre gravada criptografada e nunca sai inteira pela API.
 */
@Service
public class LlmSettingsService {

    public static final List<String> WRITABLE = List.of("api_key", "model", "base_url", "organization");
    private static final String META = "meta";
    private static final String ACTIVE_PROVIDER = "__active_provider__";

    private final LlmSettingRepository repo;
    private final LlmProperties props;
    private final PluginCatalog catalog;
    private final SecretCipher cipher;

    public LlmSettingsService(LlmSettingRepository repo, LlmProperties props, PluginCatalog catalog,
                              SecretCipher cipher) {
        this.repo = repo;
        this.props = props;
        this.catalog = catalog;
        this.cipher = cipher;
    }

    @Transactional(readOnly = true)
    public LlmPlugin activePlugin() {
        return repo.findByUserIdAndProviderAndKey(CurrentUser.id(), META, ACTIVE_PROVIDER)
                .flatMap(s -> catalog.find(s.getValue()))
                .or(() -> catalog.find(props.provider()))
                .orElseGet(() -> catalog.all().getFirst());
    }

    /** Valor efetivo de uma chave do plugin (ver ordem de prioridade acima). */
    @Transactional(readOnly = true)
    public String get(LlmPlugin plugin, String key) {
        return get(CurrentUser.id(), plugin, key);
    }

    /**
     * Mesma coisa, para um usuário informado. Usado fora de uma requisição
     * (ex.: a memória da IA indexando notas em segundo plano, sem ninguém logado na thread).
     */
    @Transactional(readOnly = true)
    public String get(Long userId, LlmPlugin plugin, String key) {
        String stored = repo.findByUserIdAndProviderAndKey(userId, plugin.id(), key)
                .map(LlmSetting::getValue).orElse(null);
        if ("api_key".equals(key)) {
            stored = cipher.decrypt(stored);
        }
        if (notBlank(stored)) {
            return stored;
        }
        String fromEnv = fromEnv(props.of(plugin.id()), key);
        if (notBlank(fromEnv)) {
            return fromEnv;
        }
        String fromPlugin = switch (key) {
            case "base_url" -> plugin.baseUrl();
            case "model" -> plugin.defaultModel();
            default -> null;
        };
        return notBlank(fromPlugin) ? fromPlugin : null;
    }

    /** Aplica o PUT da tela. String vazia em api_key remove a chave salva. */
    @Transactional
    public void apply(Map<String, String> data) {
        if (data.containsKey("provider")) {
            LlmPlugin p = catalog.find(data.get("provider"))
                    .orElseThrow(() -> new IllegalArgumentException("Plugin inválido"));
            put(META, ACTIVE_PROVIDER, p.id());
        }
        LlmPlugin active = activePlugin();
        for (String key : WRITABLE) {
            if (!data.containsKey(key)) {
                continue;
            }
            if ("base_url".equals(key) && !active.baseUrlEditable()) {
                continue; // endereço fixo: impede apontar a chave da OpenAI para outro servidor
            }
            String value = data.get(key);
            if ("api_key".equals(key) && "".equals(value)) {
                repo.deleteByUserIdAndProviderAndKey(CurrentUser.id(), active.id(), key);
            } else if (notBlank(value)) {
                put(active.id(), key, "api_key".equals(key) ? cipher.encrypt(value) : value);
            }
        }
    }

    /** O que o GET /api/settings/llm devolve: a ficha de cada plugin + o que está configurado. */
    @Transactional(readOnly = true)
    public Map<String, Object> snapshot() {
        Map<String, Object> providers = new LinkedHashMap<>();
        Map<String, Object> models = new LinkedHashMap<>();
        for (LlmPlugin p : catalog.all()) {
            String apiKey = get(p, "api_key");
            String org = get(p, "organization");
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("label", p.label());
            info.put("description", p.description());
            info.put("model", get(p, "model"));
            info.put("has_api_key", apiKey != null);
            info.put("api_key_masked", mask(apiKey));
            info.put("requires_api_key", p.requiresApiKey());
            info.put("key_url", p.keyUrl());
            info.put("base_url", get(p, "base_url"));
            info.put("base_url_editable", p.baseUrlEditable());
            info.put("organization", org == null ? null : "***" + org.substring(Math.max(0, org.length() - 4)));
            info.put("local", p.local());
            info.put("configured", isConfigured(p));
            providers.put(p.id(), info);
            models.put(p.id(), p.models());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("active_provider", activePlugin().id());
        out.put("plugins", catalog.all().stream().map(LlmPlugin::id).toList());
        out.put("providers", providers);
        out.put("catalog", models);
        return out;
    }

    /** Tem o mínimo para tentar uma chamada: chave (se exigida), endereço e modelo. */
    @Transactional(readOnly = true)
    public boolean isConfigured(LlmPlugin p) {
        return (!p.requiresApiKey() || get(p, "api_key") != null)
                && get(p, "base_url") != null
                && get(p, "model") != null;
    }

    static String mask(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        int len = value.length();
        if (len <= 8) {
            return "*".repeat(len);
        }
        return value.substring(0, 3) + "*".repeat(Math.max(4, len - 7)) + value.substring(len - 4);
    }

    private void put(String provider, String key, String value) {
        Long userId = CurrentUser.id();
        LlmSetting setting = repo.findByUserIdAndProviderAndKey(userId, provider, key)
                .orElseGet(() -> new LlmSetting(userId, provider, key, value));
        setting.setValue(value);
        repo.save(setting);
    }

    private static String fromEnv(PluginOverride o, String key) {
        return switch (key) {
            case "api_key" -> o.apiKey();
            case "model" -> o.model();
            case "base_url" -> o.baseUrl();
            case "organization" -> o.organization();
            default -> null;
        };
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
