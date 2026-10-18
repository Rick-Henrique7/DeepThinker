package com.deepthinker.canvas;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.ConflictException;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.note.NoteRenamedEvent;
import java.text.Normalizer;
import java.util.Locale;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Canvas: criar, listar, abrir, salvar e apagar. Cada um é de quem criou (CurrentUser).
 *
 * Salvar exige a revision que você abriu. Se ela não bate com a do banco, alguém salvou
 * antes (outra aba, o celular): em vez de apagar o trabalho dessa pessoa, devolvemos 409
 * com a versão mais nova, e a tela pergunta o que fazer.
 */
@Service
public class CanvasService {

    public record CanvasItem(Long id, String title, int cards, Instant updatedAt) {
    }

    public record CanvasDetail(Long id, String title, JsonNode data, long revision, Instant createdAt,
                               Instant updatedAt) {
    }

    /** O que a tela manda. Em PUT, title e data são opcionais; revision é obrigatória. */
    public record CanvasWrite(String title, JsonNode data, Long revision) {
    }

    static final String DEFAULT_TITLE = "Canvas sem título";

    private final CanvasRepository canvases;
    private final JsonMapper json;

    public CanvasService(CanvasRepository canvases, JsonMapper json) {
        this.canvases = canvases;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<CanvasItem> list() {
        return canvases.findByUserIdOrderByUpdatedAtDesc(CurrentUser.id()).stream()
                .map(c -> new CanvasItem(c.getId(), c.getTitle(), c.getCards(), c.getUpdatedAt()))
                .toList();
    }

    @Transactional
    public CanvasDetail create(CanvasWrite body) {
        ObjectNode data = CanvasFormat.clean(body == null ? null : body.data());
        Canvas canvas = new Canvas(CurrentUser.id(), title(body == null ? null : body.title()), write(data),
                CanvasFormat.cardCount(data));
        return detail(canvases.saveAndFlush(canvas));
    }

    @Transactional(readOnly = true)
    public CanvasDetail get(Long id) {
        return detail(find(id));
    }

    @Transactional
    public CanvasDetail update(Long id, CanvasWrite body) {
        Canvas canvas = find(id);
        if (body == null || body.revision() == null) {
            throw ValidationException.of("revision", "Envie a revision do canvas que você abriu.");
        }
        if (body.revision() != canvas.getRevision()) {
            throw new ConflictException("Este canvas foi alterado em outro lugar depois que você abriu.", detail(canvas));
        }
        if (body.title() != null) {
            canvas.setTitle(title(body.title()));
        }
        if (body.data() != null) {
            ObjectNode data = CanvasFormat.clean(body.data());
            canvas.setContent(write(data));
            canvas.setCards(CanvasFormat.cardCount(data));
        }
        return detail(canvases.saveAndFlush(canvas));
    }

    @Transactional
    public void delete(Long id) {
        canvases.delete(find(id));
    }

    /**
     * Renomeou uma nota: os cartões que apontavam para "Antigo.md" passam a apontar para
     * "Novo.md", em todos os canvas da pessoa (como o Obsidian faz). Roda na mesma transação
     * da edição da nota: ou as duas coisas gravam, ou nenhuma.
     */
    @EventListener
    @Transactional
    public void onNoteRenamed(NoteRenamedEvent event) {
        String old = normalize(event.oldTitle());
        for (Canvas canvas : canvases.findByUserIdOrderByUpdatedAtDesc(event.userId())) {
            if (!canvas.getContent().contains("\"file\"")) {
                continue; // sem cartão de nota: nem precisa abrir o desenho
            }
            JsonNode data = json.readTree(canvas.getContent());
            boolean changed = false;
            for (JsonNode node : data.path("nodes")) {
                if (!"file".equals(node.path("type").asString()) || !(node instanceof ObjectNode obj)) {
                    continue;
                }
                String file = node.path("file").asString();
                int slash = file.lastIndexOf('/');
                String base = file.substring(slash + 1).replaceFirst("(?i)\\.md$", "");
                if (normalize(base).equals(old)) {
                    obj.put("file", file.substring(0, slash + 1) + event.newTitle() + ".md");
                    changed = true;
                }
            }
            if (changed) {
                canvas.setContent(write((ObjectNode) data));
            }
        }
    }

    private static String normalize(String s) {
        String lower = s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    private Canvas find(Long id) {
        return canvases.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Canvas não encontrado."));
    }

    private CanvasDetail detail(Canvas c) {
        return new CanvasDetail(c.getId(), c.getTitle(), json.readTree(c.getContent()), c.getRevision(),
                c.getCreatedAt(), c.getUpdatedAt());
    }

    private String write(ObjectNode data) {
        String text = json.writeValueAsString(data);
        if (text.getBytes(StandardCharsets.UTF_8).length > CanvasFormat.MAX_BYTES) {
            throw ValidationException.of("data", "Canvas grande demais (máximo 2 MB). Divida em dois.");
        }
        return text;
    }

    private static String title(String raw) {
        String t = raw == null ? "" : raw.strip();
        if (t.isEmpty()) {
            return DEFAULT_TITLE;
        }
        return t.length() > 255 ? t.substring(0, 255) : t;
    }
}
