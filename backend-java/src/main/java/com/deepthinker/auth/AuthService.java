package com.deepthinker.auth;

import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cadastro e login.
 *
 * A senha passa pelo BCrypt, que é lento de propósito: testar milhões de senhas
 * contra um hash vazado fica caro demais. O mesmo texto gera hashes diferentes
 * (o "sal" é aleatório), então nem duas senhas iguais ficam parecidas no banco.
 */
@Service
public class AuthService {

    /** O que a API devolve no cadastro e no login. */
    public record Session(String token, String tokenType, long expiresIn, UserView user) {
    }

    public record UserView(Long id, String name, String email) {
        static UserView of(User u) {
            return new UserView(u.getId(), u.getName(), u.getEmail());
        }
    }

    private static final String WRONG_CREDENTIALS = "E-mail ou senha incorretos.";

    /** E-mail da conta única do app desktop (ver localSession). */
    static final String LOCAL_EMAIL = "voce@deepthinker.local";

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final JdbcTemplate jdbc;
    private final boolean registrationEnabled;

    public AuthService(UserRepository users, PasswordEncoder passwords, TokenService tokens, JdbcTemplate jdbc,
                       @Value("${deepthinker.auth.registration-enabled:true}") boolean registrationEnabled) {
        this.users = users;
        this.passwords = passwords;
        this.tokens = tokens;
        this.jdbc = jdbc;
        this.registrationEnabled = registrationEnabled;
    }

    @Transactional
    public Session register(String name, String email, String password) {
        if (!registrationEnabled) {
            throw new AuthException(HttpStatus.FORBIDDEN, "O cadastro de novas contas está fechado.");
        }
        String normalized = normalize(email);
        if (users.existsByEmail(normalized)) {
            throw com.deepthinker.common.ValidationException.of("email", "Este e-mail já tem uma conta.");
        }
        User user = users.save(new User(name.trim(), normalized, passwords.encode(password)));
        if (users.count() == 1) {
            adoptOrphanData(user.getId());
        }
        return sessionFor(user);
    }

    @Transactional(readOnly = true)
    public Session login(String email, String password) {
        User user = users.findByEmail(normalize(email))
                .filter(u -> passwords.matches(password, u.getPasswordHash()))
                // Mesma mensagem para e-mail inexistente e senha errada:
                // assim ninguém descobre quais e-mails têm conta.
                .orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, WRONG_CREDENTIALS));
        return sessionFor(user);
    }

    /**
     * Conta do app desktop: uma só, criada na primeira abertura.
     * Não tem senha de verdade (o hash é de um texto aleatório), porque ninguém digita senha no desktop.
     */
    @Transactional
    public Session localSession(String name) {
        User user = users.findByEmail(LOCAL_EMAIL).orElseGet(() -> {
            String randomPassword = java.util.UUID.randomUUID().toString();
            User created = users.save(new User(name.isBlank() ? "Você" : name.trim(), LOCAL_EMAIL,
                    passwords.encode(randomPassword)));
            if (users.count() == 1) {
                adoptOrphanData(created.getId());
            }
            return created;
        });
        return sessionFor(user);
    }

    @Transactional(readOnly = true)
    public UserView me() {
        return users.findById(CurrentUser.id())
                .map(UserView::of)
                .orElseThrow(() -> new AuthException(HttpStatus.UNAUTHORIZED, "Conta não encontrada."));
    }

    /**
     * Antes do login, as notas, conversas e configurações não tinham dono.
     * A primeira conta criada herda tudo isso, para você não perder nada.
     */
    private void adoptOrphanData(Long userId) {
        for (String table : new String[] {"notes", "conversation_messages", "llm_settings"}) {
            jdbc.update("UPDATE " + table + " SET user_id = ? WHERE user_id IS NULL", userId);
        }
    }

    private Session sessionFor(User user) {
        return new Session(tokens.issue(user), "Bearer", tokens.ttlSeconds(), UserView.of(user));
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
