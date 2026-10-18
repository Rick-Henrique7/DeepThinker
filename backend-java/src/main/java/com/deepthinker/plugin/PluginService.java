package com.deepthinker.plugin;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Plugins da comunidade: instalar, listar, ligar/desligar e remover.
 *
 * Regra de segurança principal: o servidor nunca executa o código do plugin. Ele só confere
 * o manifesto (id, nome, permissões conhecidas, tamanho) e guarda o texto. Quem roda é o
 * navegador da própria pessoa, num iframe isolado (ver frontend/src/lib/plugins.ts).
 */
@Service
public class PluginService {

    /** O que um plugin pode pedir. Qualquer outra permissão no manifesto é recusada. */
    public static final List<String> PERMISSIONS = List.of("note:read", "note:write", "commands");

    private static final Pattern KEY = Pattern.compile("^[a-z0-9][a-z0-9-]{1,49}$");
    private static final int MAX_CODE = 200_000;
    private static final int MAX_PLUGINS = 30;

    private final UserPluginRepository repo;

    public PluginService(UserPluginRepository repo) {
        this.repo = repo;
    }

    /** Corpo de POST /api/plugins: o arquivo .json do plugin, como veio. */
    public record InstallRequest(String id, String name, String version, String description, String author,
                                 List<String> permissions, String code) {
    }

    public record PluginDto(Long id, String key, String name, String version, String description, String author,
                            List<String> permissions, String code, boolean enabled, Instant updatedAt) {
        static PluginDto of(UserPlugin p) {
            List<String> perms = p.getPermissions().isEmpty() ? List.of() : Arrays.asList(p.getPermissions().split(","));
            return new PluginDto(p.getId(), p.getKey(), p.getName(), p.getVersion(), p.getDescription(), p.getAuthor(),
                    perms, p.getCode(), p.isEnabled(), p.getUpdatedAt());
        }
    }

    @Transactional(readOnly = true)
    public List<PluginDto> list() {
        return repo.findByUserIdOrderByNameAsc(CurrentUser.id()).stream().map(PluginDto::of).toList();
    }

    /** Instala, ou atualiza se o mesmo id já estiver instalado (mantém ligado/desligado como estava). */
    @Transactional
    public PluginDto install(InstallRequest req) {
        Long userId = CurrentUser.id();
        String key = trim(req.id());
        if (!KEY.matcher(key).matches()) {
            throw ValidationException.of("id", "O id do plugin deve ter de 2 a 50 letras minúsculas, números ou hífens (ex.: \"contador-de-palavras\").");
        }
        String name = required(req.name(), "name", "O plugin precisa de um nome.", 80);
        String version = trim(req.version()).isEmpty() ? "1.0.0" : limit(req.version(), "version", 20);
        String description = optional(req.description(), "description", 300);
        String author = optional(req.author(), "author", 80);
        Set<String> perms = new LinkedHashSet<>();
        for (String p : req.permissions() == null ? List.<String>of() : req.permissions()) {
            if (!PERMISSIONS.contains(p)) {
                throw ValidationException.of("permissions", "Permissão desconhecida: \"" + p + "\". Use " + String.join(", ", PERMISSIONS) + ".");
            }
            perms.add(p);
        }
        String code = req.code() == null ? "" : req.code();
        if (code.isBlank()) {
            throw ValidationException.of("code", "O plugin não tem código.");
        }
        if (code.length() > MAX_CODE) {
            throw ValidationException.of("code", "O código do plugin passa do limite de 200 mil caracteres.");
        }
        UserPlugin plugin = repo.findByUserIdAndKey(userId, key).orElseGet(() -> {
            if (repo.countByUserId(userId) >= MAX_PLUGINS) {
                throw ValidationException.of("id", "Limite de " + MAX_PLUGINS + " plugins. Remova algum que não usa.");
            }
            return new UserPlugin(userId, key);
        });
        plugin.setName(name);
        plugin.setVersion(version);
        plugin.setDescription(description);
        plugin.setAuthor(author);
        plugin.setPermissions(String.join(",", perms));
        plugin.setCode(code);
        return PluginDto.of(repo.save(plugin));
    }

    @Transactional
    public PluginDto setEnabled(Long id, boolean enabled) {
        UserPlugin p = find(id);
        p.setEnabled(enabled);
        return PluginDto.of(repo.save(p));
    }

    @Transactional
    public void uninstall(Long id) {
        repo.delete(find(id));
    }

    private UserPlugin find(Long id) {
        // Plugin de outra pessoa responde 404, como se não existisse
        return repo.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Plugin não encontrado."));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String required(String value, String field, String message, int max) {
        String v = trim(value);
        if (v.isEmpty()) {
            throw ValidationException.of(field, message);
        }
        return limit(v, field, max);
    }

    private static String optional(String value, String field, int max) {
        String v = trim(value);
        return v.isEmpty() ? null : limit(v, field, max);
    }

    private static String limit(String value, String field, int max) {
        String v = trim(value);
        if (v.length() > max) {
            throw ValidationException.of(field, "O campo " + field + " pode ter no máximo " + max + " caracteres.");
        }
        return v;
    }
}
