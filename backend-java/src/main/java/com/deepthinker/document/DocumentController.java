package com.deepthinker.document;

import com.deepthinker.note.HighlightService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * POST /api/documents/upload  (multipart/form-data, campo "file")
 * O frontend já manda assim (FormData), então nada muda lá.
 *
 * Leitor e destaques:
 *   GET    /api/documents                         os documentos importados
 *   GET    /api/documents/{id}/file               o arquivo original (PDF, TXT ou MD)
 *   POST   /api/documents/{id}/file               guardar o original de um documento antigo
 *   GET    /api/documents/{id}/highlights         os destaques do documento
 *   POST   /api/documents/{id}/highlights         destacar um trecho (vira uma nota ligada)
 *   DELETE /api/documents/{id}/highlights/{hid}   apagar o destaque (e a nota dele)
 */
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documents;
    private final HighlightService highlights;

    public DocumentController(DocumentService documents, HighlightService highlights) {
        this.documents = documents;
        this.highlights = highlights;
    }

    @PostMapping("/upload")
    @ResponseStatus(HttpStatus.CREATED)
    public DocumentService.UploadResult upload(@RequestParam(value = "file", required = false) MultipartFile file) {
        return documents.upload(file);
    }

    @GetMapping
    public List<DocumentService.DocumentItem> list() {
        return documents.list();
    }

    @GetMapping("/{id}")
    public DocumentService.DocumentItem get(@PathVariable Long id) {
        return documents.get(id);
    }

    /**
     * Devolve os bytes do arquivo. Os cabeçalhos são de segurança: nosniff impede o navegador de
     * "adivinhar" outro tipo, sandbox impede que o arquivo rode qualquer coisa se for aberto
     * direto, e no-store não deixa cópia do documento (que é privado) em cache.
     */
    @GetMapping("/{id}/file")
    public ResponseEntity<byte[]> file(@PathVariable Long id) {
        DocumentFile f = documents.file(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.getContentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(f.getFilename(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "sandbox")
                .cacheControl(CacheControl.noStore())
                .body(f.getData());
    }

    @PostMapping("/{id}/file")
    public DocumentService.DocumentItem attach(@PathVariable Long id,
                                               @RequestParam(value = "file", required = false) MultipartFile file) {
        return documents.attach(id, file);
    }

    @GetMapping("/{id}/highlights")
    public List<HighlightService.Highlight> highlights(@PathVariable Long id) {
        return highlights.list(id);
    }

    @PostMapping("/{id}/highlights")
    @ResponseStatus(HttpStatus.CREATED)
    public HighlightService.Highlight highlight(@PathVariable Long id,
                                                @RequestBody HighlightService.HighlightRequest req) {
        return highlights.create(id, req);
    }

    @DeleteMapping("/{id}/highlights/{highlightId}")
    public Map<String, Boolean> deleteHighlight(@PathVariable Long id, @PathVariable Long highlightId) {
        highlights.delete(id, highlightId);
        return Map.of("ok", true);
    }
}
