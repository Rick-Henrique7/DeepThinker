package com.deepthinker.document;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.document.DocumentFileRepository.DocumentFileInfo;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.deepthinker.note.HighlightService;
import com.deepthinker.note.KnowledgeExtractor;
import com.deepthinker.note.Note;
import com.deepthinker.note.NoteDtos;
import com.deepthinker.note.NoteRepository;
import com.deepthinker.note.NoteService;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Upload de documento: extrai o texto (PDF, TXT ou MD), pede para a IA
 * resumir em pontos-chave e cria notas ligadas no grafo.
 *
 * O arquivo original também fica guardado, no banco (tabela document_files, ver a V9),
 * para o Leitor mostrar as páginas do PDF e deixar grifar trechos. No banco, e não em
 * disco: assim a hospedagem continua sem precisar de disco persistente nem de S3.
 */
@Service
public class DocumentService {

    /** Resposta do upload. created/reused ficam de fora quando a IA falhou (fallback). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record UploadResult(NoteDtos.NoteDetail note, int extractedChars, Integer created, Integer reused,
                               Boolean fallback) {
    }

    /**
     * Um documento na lista do Leitor. kind: "pdf", "text" (TXT/MD) ou null quando o arquivo
     * original não está guardado (documentos importados antes da V9).
     */
    public record DocumentItem(Long id, String title, String filename, String kind, Long size, int highlights,
                               Instant createdAt) {
    }

    private static final List<String> ALLOWED = List.of("pdf", "txt", "md");

    private final KnowledgeExtractor extractor;
    private final NoteService notes;
    private final NoteRepository noteRepository;
    private final DocumentFileRepository files;
    private final HighlightService highlights;

    public DocumentService(KnowledgeExtractor extractor, NoteService notes, NoteRepository noteRepository,
                           DocumentFileRepository files, HighlightService highlights) {
        this.extractor = extractor;
        this.notes = notes;
        this.noteRepository = noteRepository;
        this.files = files;
        this.highlights = highlights;
    }

    /** Os documentos importados, do mais novo para o mais antigo. */
    public List<DocumentItem> list() {
        Long userId = CurrentUser.id();
        Map<Long, DocumentFileInfo> byNote = files.findInfoByUserId(userId).stream()
                .collect(Collectors.toMap(DocumentFileInfo::getNoteId, Function.identity(), (a, b) -> a));
        Map<Long, Integer> counts = highlights.countsByDocument();
        return noteRepository.findByUserIdAndSourceType(userId, "document").stream()
                .sorted(Comparator.comparing(Note::getCreatedAt).reversed())
                .map(n -> item(n, byNote.get(n.getId()), counts.getOrDefault(n.getId(), 0)))
                .toList();
    }

    /**
     * Um documento só. O Leitor pede isto antes do arquivo: se kind vier null, ele já sabe que o
     * original não está guardado e nem pede o arquivo (que daria 404).
     */
    public DocumentItem get(Long noteId) {
        Long userId = CurrentUser.id();
        Note doc = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new NotFoundException("Nota não encontrada."));
        if (!"document".equals(doc.getSourceType())) {
            throw ValidationException.of("id", "Esta nota não é um documento importado.");
        }
        DocumentFileInfo info = files.findInfoByNoteIdAndUserId(noteId, userId).orElse(null);
        return item(doc, info, highlights.countsByDocument().getOrDefault(noteId, 0));
    }

    /** O arquivo original, para o Leitor. 404 se o documento é de antes de guardarmos arquivos. */
    public DocumentFile file(Long noteId) {
        return files.findByNoteIdAndUserId(noteId, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("O arquivo original deste documento não está guardado."));
    }

    /**
     * Guardar (ou trocar) o arquivo original de um documento que já existe. Serve para os
     * documentos importados antes desta versão: manda o PDF de novo e o Leitor passa a mostrá-lo.
     * Não chama a IA nem cria notas: só guarda o arquivo.
     */
    public DocumentItem attach(Long noteId, MultipartFile file) {
        Long userId = CurrentUser.id();
        Note doc = noteRepository.findByIdAndUserId(noteId, userId)
                .orElseThrow(() -> new NotFoundException("Nota não encontrada."));
        if (!"document".equals(doc.getSourceType())) {
            throw ValidationException.of("file", "Esta nota não é um documento importado.");
        }
        if (file == null || file.isEmpty()) {
            throw ValidationException.of("file", "Envie um arquivo.");
        }
        String filename = file.getOriginalFilename() == null ? "documento" : file.getOriginalFilename();
        String extension = extensionOf(filename);
        if (!ALLOWED.contains(extension)) {
            throw ValidationException.of("file", "Tipo não suportado. Use: " + String.join(", ", ALLOWED));
        }
        byte[] bytes = bytesOf(file);
        if (extractText(bytes, extension).isBlank()) {
            throw ValidationException.of("file", "Não foi possível ler o documento.");
        }
        store(userId, noteId, filename, extension, bytes);
        DocumentFileInfo info = files.findInfoByNoteIdAndUserId(noteId, userId).orElse(null);
        return item(doc, info, highlights.countsByDocument().getOrDefault(noteId, 0));
    }

    public UploadResult upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ValidationException.of("file", "Envie um arquivo.");
        }
        String filename = file.getOriginalFilename() == null ? "documento" : file.getOriginalFilename();
        String extension = extensionOf(filename);
        if (!ALLOWED.contains(extension)) {
            throw ValidationException.of("file", "Tipo não suportado. Use: " + String.join(", ", ALLOWED));
        }

        byte[] bytes = bytesOf(file);
        String text = extractText(bytes, extension).trim();
        if (text.isEmpty()) {
            throw ValidationException.of("file", "Não foi possível extrair texto do documento.");
        }
        text = KnowledgeExtractor.truncateForLlm(text, "documento truncado para caber no contexto");

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("filename", filename);
        meta.put("mime", file.getContentType());
        meta.put("extracted_chars", text.length());

        Map<String, Object> parsed = extractor.extract("o documento", "Documento", text, null);
        if (parsed == null) {
            // A IA não devolveu JSON: guardamos o texto bruto numa nota, como o Laravel fazia.
            meta.put("fallback", true);
            String base = filename.contains(".") ? filename.substring(0, filename.lastIndexOf('.')) : filename;
            String title = truncate("Doc: " + base, 255);
            Note note = notes.createWithSource(title, text, truncate(text, 280), "document", meta);
            store(CurrentUser.id(), note.getId(), filename, extension, bytes);
            return new UploadResult(NoteDtos.NoteDetail.of(note, null), text.length(), null, null, true);
        }

        KnowledgeExtractor.Linked linked = extractor.saveLinked(parsed, "Doc: " + filename, text,
                truncate(text, 280), "document", meta);
        store(CurrentUser.id(), linked.note().getId(), filename, extension, bytes);
        return new UploadResult(NoteDtos.NoteDetail.of(linked.note(), null), text.length(),
                linked.created(), linked.reused(), null);
    }

    private static String extractText(byte[] bytes, String extension) {
        try {
            if (!"pdf".equals(extension)) {
                return new String(bytes, StandardCharsets.UTF_8);
            }
            // PDFBox: carrega o PDF e "descasca" o texto de todas as páginas.
            try (PDDocument pdf = Loader.loadPDF(bytes)) {
                return new PDFTextStripper().getText(pdf);
            }
        } catch (IOException e) {
            return ""; // PDF corrompido ou protegido: cai no erro "não foi possível extrair texto"
        }
    }

    private static byte[] bytesOf(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw ValidationException.of("file", "Não foi possível ler o arquivo enviado.");
        }
    }

    /**
     * Guarda o original. O tipo (Content-Type) sai da extensão que nós já conferimos, e não do
     * que o navegador mandou: assim ninguém consegue guardar um HTML dizendo que é PDF.
     */
    private void store(Long userId, Long noteId, String filename, String extension, byte[] bytes) {
        String type = switch (extension) {
            case "pdf" -> "application/pdf";
            case "md" -> "text/markdown; charset=UTF-8";
            default -> "text/plain; charset=UTF-8";
        };
        String name = truncate(filename, 255);
        DocumentFile existing = files.findByNoteIdAndUserId(noteId, userId).orElse(null);
        if (existing != null) {
            existing.replace(name, type, bytes);
            files.save(existing);
        } else {
            files.save(new DocumentFile(userId, noteId, name, type, bytes));
        }
    }

    private static DocumentItem item(Note n, DocumentFileInfo f, int highlightCount) {
        String filename = n.getSourceMeta() != null && n.getSourceMeta().get("filename") instanceof String s ? s : null;
        String kind = f == null ? null : f.getContentType().startsWith("application/pdf") ? "pdf" : "text";
        return new DocumentItem(n.getId(), n.getTitle(), f != null ? f.getFilename() : filename, kind,
                f == null ? null : f.getSizeBytes(), highlightCount, n.getCreatedAt());
    }

    private static String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
