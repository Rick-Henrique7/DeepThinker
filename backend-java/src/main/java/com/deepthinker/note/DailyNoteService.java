package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.ValidationException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nota diária, como o "Daily notes" do Obsidian e o diário do Logseq: uma nota por dia,
 * criada na primeira vez que você abre o dia.
 *
 * O toque do Deep thinker: ela já nasce com uma pergunta socrática. Em dias pares a pergunta
 * puxa uma nota antiga sua com [[link]], então o diário também liga o grafo.
 * A escolha depende só da data (não é aleatória): abrir o mesmo dia duas vezes mostra a mesma pergunta,
 * e não precisa de IA nem de internet.
 */
@Service
public class DailyNoteService {

    static final List<String> QUESTIONS = List.of(
            "Qual crença sua você mais defenderia hoje, e que prova faria você mudar de ideia?",
            "O que você está evitando pensar? Por quê?",
            "Que decisão recente você tomaria diferente com o que sabe agora?",
            "Qual problema você está tentando resolver de verdade, por baixo do problema que aparece?",
            "Se um amigo te contasse o seu plano atual, que pergunta incômoda você faria a ele?",
            "O que você aprendeu ontem que contradiz algo que você já acreditava?",
            "Qual é a pior coisa que pode acontecer se você estiver errado sobre a sua ideia principal?",
            "Que hábito seu existe só porque sempre foi assim?",
            "Quem discordaria de você hoje, e qual seria o melhor argumento dessa pessoa?",
            "O que você faria hoje se soubesse que não pode falhar? E se soubesse que vai falhar?",
            "Que pergunta você não sabe responder, mas deveria?",
            "O que é urgente na sua lista e não é importante?");

    static final String SOURCE_TYPE = "daily";
    private static final DateTimeFormatter BR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final NoteRepository notes;
    private final NoteService noteService;

    public DailyNoteService(NoteRepository notes, NoteService noteService) {
        this.notes = notes;
        this.noteService = noteService;
    }

    /** Título fixo por data: assim "achar a nota do dia" é só procurar pelo título. */
    static String titleFor(LocalDate date) {
        return "Diário " + date.format(BR);
    }

    /**
     * Devolve a nota do dia, criando se ainda não existir.
     * A data vem do navegador ("2026-10-16"): o dia certo é o do fuso de quem está usando.
     */
    @Transactional
    public NoteDtos.NoteDetail today(String isoDate) {
        LocalDate date;
        try {
            date = isoDate == null || isoDate.isBlank() ? LocalDate.now() : LocalDate.parse(isoDate);
        } catch (DateTimeParseException e) {
            throw ValidationException.of("date", "Use a data no formato AAAA-MM-DD.");
        }
        Long userId = CurrentUser.id();
        String title = titleFor(date);
        var existing = notes.findByUserIdAndTitleIn(userId, List.of(title));
        if (!existing.isEmpty()) {
            return noteService.show(existing.get(0).getId());
        }
        Note note = noteService.createWithSource(title, content(date, userId), null, SOURCE_TYPE,
                Map.of("date", date.toString()));
        return noteService.show(note.getId());
    }

    private String content(LocalDate date, Long userId) {
        long day = date.toEpochDay();
        String question = QUESTIONS.get((int) Math.floorMod(day, QUESTIONS.size()));
        // Notas "de verdade" para puxar: nada de outros diários.
        List<Note> older = notes.findByUserId(userId).stream()
                .filter(n -> !SOURCE_TYPE.equals(n.getSourceType()))
                .sorted(Comparator.comparing(Note::getCreatedAt))
                .toList();
        if (day % 2 == 0 && !older.isEmpty()) {
            Note pick = older.get((int) Math.floorMod(day / 2, older.size()));
            question = "Você escreveu sobre [[" + pick.getTitle() + "]]. O que você pensa diferente sobre isso hoje?";
        }
        return "## Pergunta do dia\n\n> " + question + "\n\n"
                + "## O que estou pensando\n\n\n\n"
                + "## O que aprendi hoje\n\n";
    }
}
