package com.deepthinker.board;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.note.Note;
import com.deepthinker.note.NoteDtos.NoteDetail;
import com.deepthinker.note.NoteRepository;
import com.deepthinker.note.NoteService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O Quadro (Kanban): colunas com nome e ordem, e cartões.
 *
 * Um cartão é uma nota com a propriedade "status" igual ao nome de uma coluna. Por isso:
 * - nota sem status não aparece no Quadro (só entra quem a pessoa mandou);
 * - mover um cartão, renomear ou excluir uma coluna é mudar o status das notas, pelo mesmo
 *   caminho do painel de propriedades (com histórico de versões);
 * - excluir uma coluna tira o status dos cartões dela, mas nunca apaga notas.
 *
 * Cartão criado direto no Quadro é uma nota com source_type "board": ela vive só no Quadro
 * (fora do grafo, das listas e da memória, ver NoteService.inGraph).
 */
@Service
public class BoardService {

    public static final String PROPERTY = "status";
    /** Colunas para começar, quando a pessoa ainda não tem nenhum cartão. */
    static final List<String> STARTER = List.of("a fazer", "fazendo", "feito");
    private static final int MAX_NAME = 60;
    private static final int MAX_COLUMNS = 30;

    private final BoardColumnRepository columns;
    private final NoteRepository notes;
    private final NoteService noteService;

    public BoardService(BoardColumnRepository columns, NoteRepository notes, NoteService noteService) {
        this.columns = columns;
        this.notes = notes;
        this.noteService = noteService;
    }

    public record Card(Long id, String title, List<String> tags, boolean boardOnly) {
    }

    public record Column(Long id, String name, int position, List<Card> cards) {
    }

    public record Board(String property, List<Column> columns) {
    }

    /**
     * O Quadro inteiro. Na primeira vez cria as colunas a partir dos status que as notas já têm
     * (ou "a fazer / fazendo / feito"). Status escrito à mão que ainda não tem coluna ganha uma no fim.
     */
    @Transactional
    public Board board() {
        Long userId = CurrentUser.id();
        Map<String, List<Card>> byStatus = new LinkedHashMap<>();
        for (Note n : notes.findByUserIdOrderByCreatedAtDesc(userId)) {
            NoteDetail d = NoteDetail.of(n, null);
            String status = valueKey(d.properties().get(PROPERTY));
            if (!status.isEmpty()) {
                byStatus.computeIfAbsent(status, k -> new ArrayList<>())
                        .add(new Card(n.getId(), n.getTitle(), d.tags(), !NoteService.inGraph(n)));
            }
        }
        List<BoardColumn> cols = ensureColumns(userId, byStatus.keySet());
        List<Column> out = new ArrayList<>();
        for (BoardColumn c : cols) {
            out.add(new Column(c.getId(), c.getName(), c.getPosition(), byStatus.getOrDefault(c.getName(), List.of())));
        }
        return new Board(PROPERTY, out);
    }

    @Transactional
    public Column createColumn(String name) {
        Long userId = CurrentUser.id();
        String clean = cleanName(name);
        List<BoardColumn> cols = ensureColumns(userId, Set.of());
        requireFree(cols, clean, null);
        if (cols.size() >= MAX_COLUMNS) {
            throw ValidationException.of("name", "Limite de " + MAX_COLUMNS + " colunas.");
        }
        BoardColumn c = columns.save(new BoardColumn(userId, clean, cols.size()));
        return new Column(c.getId(), c.getName(), c.getPosition(), List.of());
    }

    /** Renomeia a coluna e troca o status das notas que estavam nela. */
    @Transactional
    public Column renameColumn(Long id, String name) {
        Long userId = CurrentUser.id();
        BoardColumn c = find(id, userId);
        String clean = cleanName(name);
        requireFree(columns.findByUserIdOrderByPositionAscIdAsc(userId), clean, c.getId());
        String old = c.getName();
        if (!old.equals(clean)) {
            for (Long noteId : notesIn(userId, old)) {
                noteService.setProperties(noteId, patch(clean));
            }
            c.setName(clean);
            columns.save(c);
        }
        return new Column(c.getId(), c.getName(), c.getPosition(), List.of());
    }

    /** Muda a coluna de lugar (0 = primeira). */
    @Transactional
    public void moveColumn(Long id, int position) {
        Long userId = CurrentUser.id();
        List<BoardColumn> cols = new ArrayList<>(columns.findByUserIdOrderByPositionAscIdAsc(userId));
        BoardColumn c = find(id, userId);
        cols.removeIf(x -> x.getId().equals(c.getId()));
        cols.add(Math.max(0, Math.min(position, cols.size())), c);
        renumber(cols);
    }

    /** Exclui a coluna: os cartões dela saem do Quadro (perdem o status). Nenhuma nota é apagada. */
    @Transactional
    public int deleteColumn(Long id) {
        Long userId = CurrentUser.id();
        BoardColumn c = find(id, userId);
        List<Long> inside = notesIn(userId, c.getName());
        for (Long noteId : inside) {
            noteService.setProperties(noteId, patch(null));
        }
        columns.delete(c);
        renumber(new ArrayList<>(columns.findByUserIdOrderByPositionAscIdAsc(userId)));
        return inside.size();
    }

    /** Põe a nota no Quadro (ou muda de coluna). Sem coluna: a primeira. Coluna nova é criada. */
    @Transactional
    public String addToBoard(Long noteId, String column) {
        noteService.show(noteId); // 404 antes de criar coluna, se a nota não for da pessoa
        Long userId = CurrentUser.id();
        String target = targetColumn(userId, column);
        noteService.setProperties(noteId, patch(target));
        return target;
    }

    /** Tira a nota do Quadro (apaga o status). A nota continua existindo. */
    @Transactional
    public void removeFromBoard(Long noteId) {
        noteService.show(noteId); // 404 se não for da pessoa
        noteService.setProperties(noteId, patch(null));
    }

    /** Cartão novo direto no Quadro: uma nota que vive só no Quadro (source_type "board"). */
    @Transactional
    public Card createCard(String title, String content, String column) {
        Long userId = CurrentUser.id();
        String clean = title == null ? "" : title.trim();
        if (clean.isEmpty()) {
            throw ValidationException.of("title", "Dê um título ao cartão.");
        }
        if (clean.length() > 255) {
            throw ValidationException.of("title", "O título pode ter no máximo 255 caracteres.");
        }
        String target = targetColumn(userId, column);
        Note n = noteService.createWithSource(clean, content == null ? "" : content, null, Note.SOURCE_BOARD,
                Map.of("created_via", "board", "created_at", Instant.now().toString()));
        NoteDetail d = noteService.setProperties(n.getId(), patch(target));
        return new Card(n.getId(), n.getTitle(), d.tags(), true);
    }

    // ------------------------------------------------------------ ajudantes

    private String targetColumn(Long userId, String column) {
        List<BoardColumn> cols = ensureColumns(userId, Set.of());
        String name = column == null ? "" : column.trim();
        if (name.isEmpty()) {
            return cols.getFirst().getName();
        }
        for (BoardColumn c : cols) {
            if (c.getName().equalsIgnoreCase(name)) {
                return c.getName();
            }
        }
        return createColumn(name).name();
    }

    /** Colunas da pessoa, criando as que faltam (primeira vez, ou status sem coluna). */
    private List<BoardColumn> ensureColumns(Long userId, Set<String> used) {
        List<BoardColumn> cols = new ArrayList<>(columns.findByUserIdOrderByPositionAscIdAsc(userId));
        Set<String> have = new HashSet<>();
        cols.forEach(c -> have.add(c.getName()));
        Set<String> missing = new LinkedHashSet<>();
        if (cols.isEmpty()) {
            // Primeira vez: os conhecidos na ordem de trabalho, depois os outros em ordem alfabética
            STARTER.stream().filter(s -> used.isEmpty() || used.contains(s)).forEach(missing::add);
            used.stream().filter(s -> !STARTER.contains(s)).sorted(String.CASE_INSENSITIVE_ORDER).forEach(missing::add);
        } else {
            used.stream().filter(s -> !have.contains(s)).forEach(missing::add);
        }
        int pos = cols.size();
        for (String name : missing) {
            String n = name.length() > MAX_NAME ? name.substring(0, MAX_NAME) : name;
            if (have.add(n)) {
                cols.add(columns.save(new BoardColumn(userId, n, pos++)));
            }
        }
        return cols;
    }

    private List<Long> notesIn(Long userId, String status) {
        List<Long> ids = new ArrayList<>();
        for (Note n : notes.findByUserId(userId)) {
            if (status.equals(valueKey(NoteDetail.of(n, null).properties().get(PROPERTY)))) {
                ids.add(n.getId());
            }
        }
        return ids;
    }

    private void renumber(List<BoardColumn> cols) {
        for (int i = 0; i < cols.size(); i++) {
            if (cols.get(i).getPosition() != i) {
                cols.get(i).setPosition(i);
                columns.save(cols.get(i));
            }
        }
    }

    private BoardColumn find(Long id, Long userId) {
        return columns.findByIdAndUserId(id, userId).orElseThrow(() -> new NotFoundException("Coluna não encontrada."));
    }

    private static void requireFree(List<BoardColumn> cols, String name, Long except) {
        for (BoardColumn c : cols) {
            if (!c.getId().equals(except) && c.getName().toLowerCase(Locale.ROOT).equals(name.toLowerCase(Locale.ROOT))) {
                throw ValidationException.of("name", "Já existe uma coluna \"" + c.getName() + "\".");
            }
        }
    }

    private static String cleanName(String name) {
        String clean = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (clean.isEmpty()) {
            throw ValidationException.of("name", "Dê um nome à coluna.");
        }
        if (clean.length() > MAX_NAME) {
            throw ValidationException.of("name", "O nome da coluna pode ter no máximo " + MAX_NAME + " caracteres.");
        }
        return clean;
    }

    private static Map<String, Object> patch(String status) {
        Map<String, Object> m = new HashMap<>();
        m.put(PROPERTY, status);
        return m;
    }

    /** Mesmo texto de coluna que o app usa para o valor da propriedade (listas viram "a, b"). */
    public static String valueKey(Object v) {
        if (v == null || "".equals(v)) {
            return "";
        }
        if (v instanceof List<?> list) {
            return String.join(", ", list.stream().map(BoardService::valueKey).toList());
        }
        return String.valueOf(v).trim();
    }
}
