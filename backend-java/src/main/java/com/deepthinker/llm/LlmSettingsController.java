package com.deepthinker.llm;

import com.deepthinker.common.ValidationException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET  /api/settings/llm       configurações atuais (chave mascarada)
 * PUT  /api/settings/llm       troca o plugin ativo e altera chave, modelo, URL, organização
 * POST /api/settings/llm/test  manda um "ok?" curto para a IA ativa
 *
 * Atenção: ainda sem login. Antes de publicar, esta rota precisa ficar restrita.
 */
@RestController
@RequestMapping("/api/settings/llm")
public class LlmSettingsController {

    private static final Map<String, Integer> MAX_LENGTH = Map.of(
            "api_key", 512, "model", 128, "base_url", 255, "organization", 128);

    private final LlmSettingsService settings;
    private final LlmClientFactory clients;
    private final PluginCatalog catalog;

    public LlmSettingsController(LlmSettingsService settings, LlmClientFactory clients, PluginCatalog catalog) {
        this.settings = settings;
        this.clients = clients;
        this.catalog = catalog;
    }

    @GetMapping
    public Map<String, Object> show() {
        return settings.snapshot();
    }

    @PutMapping
    public Map<String, Object> update(@RequestBody Map<String, String> body) {
        validate(body);
        settings.apply(body);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("settings", settings.snapshot());
        return out;
    }

    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> test() {
        LlmClient client = clients.active();
        LlmPlugin plugin = client.plugin();
        String provider = plugin.id();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", provider);
        if (!client.isAvailable()) {
            out.put("ok", false);
            out.put("error", plugin.requiresApiKey()
                    ? "API key de " + plugin.label() + " não configurada. Adicione em Configurações."
                    : plugin.label() + " não responde em " + settings.get(plugin, "base_url") + "/models.");
            return ResponseEntity.status(503).body(out);
        }
        try {
            String reply = client.chat(
                    List.of(new LlmClient.Message("user", "Responda apenas com a palavra \"ok\" para confirmar conexão.")),
                    null, LlmClient.Options.DEFAULT);
            out.put("ok", true);
            out.put("reply", reply.trim());
            return ResponseEntity.ok(out);
        } catch (LlmException e) {
            out.put("ok", false);
            out.put("error", e.getMessage());
            return ResponseEntity.status(502).body(out);
        }
    }

    private void validate(Map<String, String> body) {
        if (body.containsKey("provider") && catalog.find(body.get("provider")).isEmpty()) {
            throw ValidationException.of("provider", "Plugin de IA desconhecido: " + body.get("provider"));
        }
        String baseUrl = body.get("base_url");
        if (baseUrl != null && !baseUrl.isEmpty() && !baseUrl.matches("^https?://.+")) {
            throw ValidationException.of("base_url", "O endereço deve começar com http:// ou https://.");
        }
        MAX_LENGTH.forEach((field, max) -> {
            String v = body.get(field);
            if (v != null && v.length() > max) {
                throw ValidationException.of(field, "O campo " + field + " pode ter no máximo " + max + " caracteres.");
            }
        });
    }
}
