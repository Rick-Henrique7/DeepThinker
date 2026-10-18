package com.deepthinker.note;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava no banco as notas de teste geradas por {@link SeedNotes}, para um usuário.
 *
 * Por si só não roda nunca: quem chama é o {@link NoteSeedRunner}, que só existe
 * com o perfil "seed" ligado (e nunca junto com "prod").
 *
 * As notas criadas ficam marcadas com source_type = "seed". É assim que o seed
 * sabe se já rodou (e não duplica nada) e que o "reset" apaga só elas,
 * sem encostar nas notas que você escreveu de verdade.
 */
@Service
public class NoteSeeder {

    static final String SOURCE_TYPE = "seed";

    /** Semente fixa: toda execução gera as mesmas notas. */
    private static final long RANDOM_SEED = 42L;

    private final NoteRepository notes;
    private final NoteService noteService;
    private final JdbcTemplate jdbc;
    private final EntityManager em;

    public NoteSeeder(NoteRepository notes, NoteService noteService, JdbcTemplate jdbc, EntityManager em) {
        this.notes = notes;
        this.noteService = noteService;
        this.jdbc = jdbc;
        this.em = em;
    }

    /** O que aconteceu, para o log. */
    public record Result(int created, int skippedTitles, long connections, boolean alreadySeeded) {
    }

    /**
     * Cria até {@code count} notas para o usuário.
     *
     * @param reset true apaga antes as notas de seed desse usuário (as suas continuam lá)
     */
    @Transactional
    public Result seed(Long userId, int count, boolean reset) {
        if (reset) {
            // As conexões somem junto, pelo ON DELETE CASCADE da tabela connections.
            jdbc.update("DELETE FROM notes WHERE user_id = ? AND source_type = ?", userId, SOURCE_TYPE);
        } else if (countSeedNotes(userId) > 0) {
            return new Result(0, 0, countConnections(userId), true);
        }

        // Títulos que você já usa ficam de fora (o título é único por usuário).
        // As notas de teste que citam esse título se ligam à sua nota real.
        Set<String> taken = notes.findByUserId(userId).stream().map(Note::getTitle).collect(Collectors.toSet());

        List<SeedNotes.Item> items = SeedNotes.generate(count, RANDOM_SEED, LocalDate.now(ZoneOffset.UTC));
        List<Note> created = new ArrayList<>();
        List<Integer> ages = new ArrayList<>();
        for (SeedNotes.Item item : items) {
            if (taken.contains(item.title())) {
                continue;
            }
            Note note = new Note(userId, item.title(), item.content(), item.summary());
            note.setSourceType(SOURCE_TYPE);
            note.setSourceMeta(Map.of("generator", "NoteSeeder"));
            created.add(notes.save(note));
            ages.add(item.daysAgo());
        }

        // Só agora, com todas as notas no banco, transformamos [[Título]] em conexões.
        // É o mesmo método que roda quando você salva uma nota pela tela.
        em.flush();
        for (int i = 0; i < created.size(); i++) {
            noteService.syncWikiLinks(created.get(i));
            if (i % 100 == 99) {
                // Esvazia o cache do JPA de vez em quando para não ficar lento.
                em.flush();
                em.clear();
            }
        }
        em.flush();

        backdate(created, ages);
        return new Result(created.size(), items.size() - created.size(), countConnections(userId), false);
    }

    /**
     * O @PrePersist da Note grava "agora" em created_at. Para a lista e o grafo
     * parecerem um uso real de meses, espalhamos as datas para trás via SQL.
     */
    private void backdate(List<Note> created, List<Integer> ages) {
        Instant now = Instant.now();
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < created.size(); i++) {
            Instant when = now.minus(ages.get(i), ChronoUnit.DAYS)
                    .minus(ThreadLocalRandom.current().nextInt(12 * 60), ChronoUnit.MINUTES);
            Timestamp ts = Timestamp.from(when);
            rows.add(new Object[] {ts, ts, created.get(i).getId()});
        }
        jdbc.batchUpdate("UPDATE notes SET created_at = ?, updated_at = ? WHERE id = ?", rows);
    }

    private long countSeedNotes(Long userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM notes WHERE user_id = ? AND source_type = ?",
                Long.class, userId, SOURCE_TYPE);
        return n == null ? 0 : n;
    }

    private long countConnections(Long userId) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM connections c JOIN notes n ON n.id = c.source_note_id WHERE n.user_id = ?",
                Long.class, userId);
        return n == null ? 0 : n;
    }
}
