package com.deepthinker.plugin;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET    /api/plugins        plugins instalados pela pessoa (com o código, que o navegador vai rodar)
 * POST   /api/plugins        instala (ou atualiza) a partir do arquivo .json do plugin
 * PATCH  /api/plugins/{id}   {"enabled": false} desliga sem desinstalar
 * DELETE /api/plugins/{id}   desinstala
 */
@RestController
@RequestMapping("/api/plugins")
public class PluginController {

    private final PluginService plugins;

    public PluginController(PluginService plugins) {
        this.plugins = plugins;
    }

    public record ToggleRequest(Boolean enabled) {
    }

    @GetMapping
    public List<PluginService.PluginDto> index() {
        return plugins.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PluginService.PluginDto install(@RequestBody PluginService.InstallRequest req) {
        return plugins.install(req);
    }

    @PatchMapping("/{id}")
    public PluginService.PluginDto toggle(@PathVariable Long id, @RequestBody ToggleRequest req) {
        return plugins.setEnabled(id, !Boolean.FALSE.equals(req.enabled()));
    }

    @DeleteMapping("/{id}")
    public Map<String, String> uninstall(@PathVariable Long id) {
        plugins.uninstall(id);
        return Map.of("message", "Plugin removido.");
    }
}
