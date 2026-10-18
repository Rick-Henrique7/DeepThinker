package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;

import com.deepthinker.auth.AuthService;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * O seed é chamado direto aqui (sem o perfil "seed"), para um usuário novo,
 * e não interfere nos outros testes.
 */
@SpringBootTest
@ActiveProfiles("test")
class NoteSeederTest {

    @Autowired
    NoteSeeder seeder;

    @Autowired
    NoteRepository notes;

    @Autowired
    AuthService auth;

    @Test
    void geraMilTitulosUnicosEQuaseTodosOsLinksApontamParaNotasQueExistem() {
        List<SeedNotes.Item> items = SeedNotes.generate(1000, 42L, LocalDate.of(2026, 10, 14));
        assertThat(items).hasSize(1000);

        Set<String> titles = new HashSet<>();
        items.forEach(i -> titles.add(i.title()));
        assertThat(titles).hasSize(1000);

        Pattern link = Pattern.compile("\\[\\[(.*?)]]");
        int total = 0;
        int dangling = 0;
        for (SeedNotes.Item item : items) {
            Matcher m = link.matcher(item.content());
            while (m.find()) {
                total++;
                if (!titles.contains(m.group(1))) {
                    dangling++;
                }
            }
        }
        assertThat(total).isGreaterThan(3000);
        assertThat(dangling).isZero();
    }

    @Test
    void criaNotasEConexoesENaoDuplicaAoRodarDeNovo() {
        String email = "seed-" + UUID.randomUUID() + "@deepthinker.dev";
        Long userId = auth.register("Pessoa do Seed", email, "senha-de-teste-123").user().id();

        NoteSeeder.Result first = seeder.seed(userId, 1000, false);
        assertThat(first.created()).isEqualTo(1000);
        assertThat(first.connections()).isGreaterThan(3000);
        assertThat(notes.findByUserId(userId)).hasSize(1000);

        NoteSeeder.Result again = seeder.seed(userId, 1000, false);
        assertThat(again.alreadySeeded()).isTrue();
        assertThat(notes.findByUserId(userId)).hasSize(1000);

        NoteSeeder.Result reset = seeder.seed(userId, 300, true);
        assertThat(reset.created()).isEqualTo(300);
        assertThat(notes.findByUserId(userId)).hasSize(300);
    }
}
