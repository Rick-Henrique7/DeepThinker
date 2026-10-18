package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Destaques (grifos) nos documentos importados, como no Kindle ou no Zotero.
 *
 * Cada destaque é uma NOTA de verdade (source_type "highlight"): aparece no grafo, na busca e
 * no Painel, pode ganhar tags e ser ligada a outras notas. O texto dela tem o trecho como
 * citação (>) e um [[link]] para a nota do documento, então a ligação no grafo sai sozinha
 * (é o mesmo syncWikiLinks de qualquer nota).
 *
 * Onde o trecho está no documento fica em source_meta, porque é o que o Leitor precisa para
 * pintar o grifo de novo:
 *   - PDF: a página e os retângulos do grifo, em FRAÇÕES da página (de 0 a 1). Frações não
 *     dependem do zoom nem do tamanho da tela: o grifo cai no mesmo lugar no celular e no PC.
 *   - TXT/MD: start/end, a posição do trecho no texto (em caracteres).
 */
@Service
public class HighlightService {

    public static final String SOURCE_TYPE = "highlight";
    /** As cores do marca-texto. O nome vai para o banco; a cor de verdade quem decide é o tema. */
    public static final List<String> COLORS = List.of("amarelo", "verde", "azul", "rosa");
    static final int MAX_QUOTE = 3000;
    static final int MAX_COMMENT = 5000;
    static final int MAX_RECTS = 300;
    private static final int TITLE_CHARS = 60;

    /** Um retângulo do grifo, em frações da página: x=0.5 é o meio da largura. */
    public record Rect(double x, double y, double w, double h) {
    }

    public record HighlightRequest(String quote, Integer page, List<Rect> rects, Integer start, Integer end,
                                   String color, String comment) {
    }

    /**
     * Como o Leitor recebe um destaque. "note" é o que a pessoa escreveu na nota além do trecho
     * (o comentário), lido do texto atual da nota: se ela editar a nota depois, aparece o novo.
     */
    public record Highlight(Long id, String title, String quote, String note, Integer page, List<Rect> rects,
                            Integer start, Integer end, String color, Instant createdAt) {
    }

    private final NoteRepository notes;
    private final NoteService noteService;

    public HighlightService(NoteRepository notes, NoteService noteService) {
        this.notes = notes;
        this.noteService = noteService;
    }

    @Transactional(readOnly = true)
    public List<Highlight> list(Long documentId) {
        document(documentId);
        return notes.findByUserIdAndSourceType(CurrentUser.id(), SOURCE_TYPE).stream()
                .filter(n -> documentOf(n) == documentId.longValue())
                .map(HighlightService::toDto)
                // Na ordem de leitura: página, depois a altura na página (ou a posição no texto).
                .sorted(Comparator.comparing((Highlight h) -> h.page() == null ? Integer.MAX_VALUE : h.page())
                        .thenComparingDouble(h -> h.rects().isEmpty() ? 0 : h.rects().get(0).y())
                        .thenComparingInt(h -> h.start() == null ? 0 : h.start())
                        .thenComparing(Highlight::id))
                .toList();
    }

    public Highlight create(Long documentId, HighlightRequest req) {
        Note doc = document(documentId);
        String quote = req.quote() == null ? "" : req.quote().strip();
        if (quote.isEmpty()) {
            throw ValidationException.of("quote", "Escolha um trecho para destacar.");
        }
        if (quote.length() > MAX_QUOTE) {
            throw ValidationException.of("quote", "O trecho é grande demais (máximo " + MAX_QUOTE + " caracteres).");
        }
        String comment = req.comment() == null ? "" : req.comment().strip();
        if (comment.length() > MAX_COMMENT) {
            throw ValidationException.of("comment", "O comentário é grande demais.");
        }
        String color = req.color() == null || req.color().isBlank() ? COLORS.get(0) : req.color();
        if (!COLORS.contains(color)) {
            throw ValidationException.of("color", "Cor inválida. Use: " + String.join(", ", COLORS));
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("document_id", doc.getId());
        if (req.page() != null) {
            // PDF: precisa da página e de onde pintar.
            if (req.page() < 1 || req.page() > 100_000) {
                throw ValidationException.of("page", "Página inválida.");
            }
            meta.put("page", req.page());
            meta.put("rects", cleanRects(req.rects()));
        } else {
            // Texto: precisa da posição do trecho.
            if (req.start() == null || req.end() == null || req.start() < 0 || req.end() <= req.start()) {
                throw ValidationException.of("start", "Informe onde o trecho começa e termina no texto.");
            }
            meta.put("start", req.start());
            meta.put("end", req.end());
        }
        meta.put("quote", quote);
        meta.put("color", color);

        // Sem resumo: o trecho já é o texto da nota (com resumo, a gaveta mostraria o trecho duas vezes).
        Note note = noteService.createWithSource(uniqueTitle(titleFor(quote, doc.getTitle())),
                content(doc.getTitle(), quote, req.page(), comment), null, SOURCE_TYPE, meta);
        return toDto(note);
    }

    @Transactional
    public void delete(Long documentId, Long highlightId) {
        document(documentId);
        Note note = noteService.owned(highlightId);
        if (!SOURCE_TYPE.equals(note.getSourceType()) || documentOf(note) != documentId.longValue()) {
            throw new NotFoundException("Destaque não encontrado.");
        }
        noteService.delete(highlightId);
    }

    /** Quantos destaques cada documento tem (para a lista de documentos). */
    @Transactional(readOnly = true)
    public Map<Long, Integer> countsByDocument() {
        Map<Long, Integer> counts = new HashMap<>();
        for (Note n : notes.findByUserIdAndSourceType(CurrentUser.id(), SOURCE_TYPE)) {
            long doc = documentOf(n);
            if (doc > 0) {
                counts.merge(doc, 1, Integer::sum);
            }
        }
        return counts;
    }

    // ------------------------------------------------------------------ texto da nota

    /**
     * O título da nota é o começo do trecho, entre aspas: “O custo fixo é o maior risco…”.
     * Tira [ ] | # ^ porque eles quebrariam um [[link]] para a nota.
     */
    static String titleFor(String quote, String documentTitle) {
        String t = quote.replaceAll("[\\[\\]|#^]", " ").replaceAll("\\s+", " ").strip();
        if (t.isEmpty()) {
            return "Destaque de " + documentTitle;
        }
        if (t.length() > TITLE_CHARS) {
            int cut = t.lastIndexOf(' ', TITLE_CHARS);
            t = t.substring(0, cut > TITLE_CHARS / 2 ? cut : TITLE_CHARS).strip() + "…";
        }
        return "“" + t + "”";
    }

    /**
     * Exemplo do que vira a nota:
     *
     *   ---
     *   tipo: destaque
     *   página: 3
     *   ---
     *
     *   > O custo fixo é o maior risco de uma cafeteria pequena.
     *
     *   Destaque de [[Plano da cafeteria]], página 3.
     *
     *   (o comentário, se tiver)
     */
    static String content(String documentTitle, String quote, Integer page, String comment) {
        StringBuilder sb = new StringBuilder("---\ntipo: destaque\n");
        if (page != null) {
            sb.append("página: ").append(page).append('\n');
        }
        sb.append("---\n\n");
        // Cada parágrafo do trecho vira um parágrafo da citação; as quebras de linha do meio
        // (o fim de cada linha do PDF) viram espaço.
        List<String> paragraphs = new ArrayList<>();
        for (String p : quote.split("\\n\\s*\\n")) {
            String joined = p.replaceAll("\\s+", " ").strip();
            if (!joined.isEmpty()) {
                paragraphs.add("> " + joined);
            }
        }
        sb.append(String.join("\n>\n", paragraphs)).append("\n\n");
        sb.append("Destaque de [[").append(documentTitle).append("]]");
        if (page != null) {
            sb.append(", página ").append(page);
        }
        sb.append(".\n");
        if (!comment.isEmpty()) {
            sb.append('\n').append(comment).append('\n');
        }
        return sb.toString();
    }

    /** O que sobra do texto da nota tirando o cabeçalho, a citação e a linha "Destaque de...". */
    static String userText(String content) {
        String body = NoteMetadata.split(content == null ? "" : content).body();
        List<String> lines = new ArrayList<>(List.of(body.split("\n", -1)));
        while (!lines.isEmpty() && (lines.get(0).isBlank() || lines.get(0).startsWith(">"))) {
            lines.remove(0);
        }
        if (!lines.isEmpty() && lines.get(0).startsWith("Destaque de [[")) {
            lines.remove(0);
        }
        return truncate(String.join("\n", lines).strip(), 500);
    }

    // ------------------------------------------------------------------ ajudantes

    private Note document(Long id) {
        Note doc = noteService.owned(id);
        if (!"document".equals(doc.getSourceType())) {
            throw ValidationException.of("document", "Esta nota não é um documento importado.");
        }
        return doc;
    }

    private String uniqueTitle(String title) {
        Long userId = CurrentUser.id();
        String candidate = title;
        int i = 2;
        while (notes.existsByUserIdAndTitle(userId, candidate)) {
            candidate = title + " (" + i++ + ")";
        }
        return candidate;
    }

    /** Confere e arredonda os retângulos. Fora de 0..1 é cortado; vazio ou estranho, recusado. */
    static List<Map<String, Object>> cleanRects(List<Rect> rects) {
        if (rects == null || rects.isEmpty()) {
            throw ValidationException.of("rects", "Faltou dizer onde está o trecho na página.");
        }
        if (rects.size() > MAX_RECTS) {
            throw ValidationException.of("rects", "Trecho grande demais para um destaque só.");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Rect r : rects) {
            if (r == null || !Double.isFinite(r.x()) || !Double.isFinite(r.y()) || !Double.isFinite(r.w())
                    || !Double.isFinite(r.h())) {
                throw ValidationException.of("rects", "Retângulo inválido.");
            }
            double x = clamp01(r.x());
            double y = clamp01(r.y());
            double w = Math.min(r.w(), 1 - x);
            double h = Math.min(r.h(), 1 - y);
            if (w <= 0 || h <= 0) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("x", round(x));
            m.put("y", round(y));
            m.put("w", round(w));
            m.put("h", round(h));
            out.add(m);
        }
        if (out.isEmpty()) {
            throw ValidationException.of("rects", "Retângulo inválido.");
        }
        return out;
    }

    private static Highlight toDto(Note n) {
        Map<String, Object> meta = n.getSourceMeta() == null ? Map.of() : n.getSourceMeta();
        List<Rect> rects = new ArrayList<>();
        if (meta.get("rects") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    rects.add(new Rect(num(m.get("x")), num(m.get("y")), num(m.get("w")), num(m.get("h"))));
                }
            }
        }
        return new Highlight(n.getId(), n.getTitle(), Objects.toString(meta.get("quote"), ""),
                userText(n.getContent()), intOrNull(meta.get("page")), rects, intOrNull(meta.get("start")),
                intOrNull(meta.get("end")), Objects.toString(meta.get("color"), COLORS.get(0)), n.getCreatedAt());
    }

    private static long documentOf(Note n) {
        Object id = n.getSourceMeta() == null ? null : n.getSourceMeta().get("document_id");
        return id instanceof Number num ? num.longValue() : -1;
    }

    private static Integer intOrNull(Object o) {
        return o instanceof Number n ? n.intValue() : null;
    }

    private static double num(Object o) {
        return o instanceof Number n ? n.doubleValue() : 0;
    }

    private static double clamp01(double v) {
        return Math.max(0, Math.min(1, v));
    }

    private static double round(double v) {
        return Math.round(v * 100_000) / 100_000.0;
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
