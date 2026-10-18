package com.deepthinker.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/auth/local  (cabeçalho X-Desktop-Key)  -> { token, user }
 *
 * Só existe no app desktop (perfil "desktop"). Lá não há tela de login: o app
 * entra sozinho com a conta local do computador.
 *
 * Por que a chave? Qualquer programa do computador consegue falar com 127.0.0.1.
 * A cada abertura, a janela Tauri sorteia uma chave, passa para este backend
 * (variável DEEPTHINKER_DESKTOP_KEY) e para a página. Só quem tem a chave entra.
 */
@RestController
@Profile("desktop")
public class DesktopAuthController {

    private final AuthService auth;
    private final byte[] desktopKey;

    public DesktopAuthController(AuthService auth, @Value("${deepthinker.desktop-key}") String desktopKey) {
        if (desktopKey == null || desktopKey.isBlank()) {
            throw new IllegalStateException("DEEPTHINKER_DESKTOP_KEY é obrigatória no perfil desktop.");
        }
        this.auth = auth;
        this.desktopKey = desktopKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/api/auth/local")
    public AuthService.Session local(@RequestHeader(value = "X-Desktop-Key", required = false) String key) {
        // MessageDigest.isEqual compara em tempo constante: não dá para adivinhar a chave pelo tempo de resposta.
        if (key == null || !MessageDigest.isEqual(desktopKey, key.getBytes(StandardCharsets.UTF_8))) {
            throw new AuthException(HttpStatus.UNAUTHORIZED, "Chave do app desktop inválida.");
        }
        return auth.localSession(System.getProperty("user.name", "Você"));
    }
}
