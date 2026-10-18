package com.deepthinker.note;

import com.deepthinker.auth.User;
import com.deepthinker.auth.UserRepository;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

/**
 * Popula o banco com notas de teste quando a API sobe com o perfil "seed".
 *
 * Como ligar (PowerShell, dentro de backend-java):
 * <pre>
 *   .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=seed"
 * </pre>
 *
 * {@code @Profile("seed & !prod")}: esta classe só vira um bean se o perfil "seed"
 * estiver ativo E o "prod" não. Sem o perfil, o Spring nem cria o objeto,
 * então em produção é impossível o seed rodar por acidente.
 *
 * Ajustes opcionais (variáveis de ambiente ou --propriedade=valor):
 * - DEEPTHINKER_SEED_EMAIL: conta que recebe as notas (padrão: a primeira conta criada);
 * - DEEPTHINKER_SEED_COUNT: quantas notas (padrão 1000);
 * - DEEPTHINKER_SEED_RESET=true: apaga as notas de seed e cria de novo.
 */
@Component
@Profile("seed & !prod")
class NoteSeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NoteSeedRunner.class);

    private final UserRepository users;
    private final NoteSeeder seeder;
    private final String email;
    private final int count;
    private final boolean reset;

    NoteSeedRunner(UserRepository users, NoteSeeder seeder,
                   @Value("${deepthinker.seed.email:}") String email,
                   @Value("${deepthinker.seed.count:1000}") int count,
                   @Value("${deepthinker.seed.reset:false}") boolean reset) {
        this.users = users;
        this.seeder = seeder;
        this.email = email;
        this.count = count;
        this.reset = reset;
    }

    @Override
    public void run(ApplicationArguments args) {
        Optional<User> user = email.isBlank()
                ? users.findAll(Sort.by("id")).stream().findFirst()
                : users.findByEmail(email.trim().toLowerCase(Locale.ROOT));
        if (user.isEmpty()) {
            log.warn("Seed: nenhuma conta encontrada{}. Crie sua conta pela tela de login e suba de novo.",
                    email.isBlank() ? "" : " com o e-mail " + email);
            return;
        }

        long start = System.currentTimeMillis();
        NoteSeeder.Result r = seeder.seed(user.get().getId(), count, reset);
        if (r.alreadySeeded()) {
            log.info("Seed: {} já tem notas de teste ({} conexões). Nada feito. "
                    + "Use DEEPTHINKER_SEED_RESET=true para recriar.", user.get().getEmail(), r.connections());
            return;
        }
        log.info("Seed: {} notas e {} conexões para {} em {} ms ({} títulos já existiam e foram pulados).",
                r.created(), r.connections(), user.get().getEmail(), System.currentTimeMillis() - start,
                r.skippedTitles());
    }
}
