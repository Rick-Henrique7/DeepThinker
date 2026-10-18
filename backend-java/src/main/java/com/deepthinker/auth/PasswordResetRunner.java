package com.deepthinker.auth;

import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Define uma senha nova para uma conta quando a API sobe com o perfil "reset-password".
 * Serve para quando você esquece a senha no ambiente de desenvolvimento: a senha
 * antiga não pode ser lida (só guardamos o hash BCrypt), mas dá para gravar outra.
 *
 * Como usar (PowerShell, dentro de backend-java, com a API parada):
 * <pre>
 *   $env:DEEPTHINKER_RESET_EMAIL="voce@exemplo.com"
 *   $env:DEEPTHINKER_RESET_PASSWORD="sua-senha-nova"
 *   .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=reset-password"
 * </pre>
 * Depois de ver "Senha redefinida" no log, pare a API, apague as duas variáveis
 * ({@code Remove-Item Env:DEEPTHINKER_RESET_*}) e suba de novo do jeito normal.
 *
 * {@code @Profile("reset-password & !prod")}: igual ao seed, nunca existe em produção.
 */
@Component
@Profile("reset-password & !prod")
class PasswordResetRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetRunner.class);

    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final String email;
    private final String newPassword;

    PasswordResetRunner(UserRepository users, PasswordEncoder passwords,
                        @Value("${deepthinker.reset.email:}") String email,
                        @Value("${deepthinker.reset.password:}") String newPassword) {
        this.users = users;
        this.passwords = passwords;
        this.email = email;
        this.newPassword = newPassword;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || newPassword.length() < 8 || newPassword.length() > 72) {
            log.warn("Reset de senha: defina DEEPTHINKER_RESET_EMAIL e DEEPTHINKER_RESET_PASSWORD "
                    + "(entre 8 e 72 caracteres). Nada foi alterado.");
            return;
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        users.findByEmail(normalized).ifPresentOrElse(user -> {
            user.changePasswordHash(passwords.encode(newPassword));
            users.save(user);
            log.info("Senha redefinida para {}. Já pode entrar com a senha nova.", normalized);
        }, () -> log.warn("Reset de senha: nenhuma conta com o e-mail {}.", normalized));
    }
}
