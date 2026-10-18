package com.deepthinker.note;

import com.deepthinker.note.NoteDtos.Graph;
import com.deepthinker.note.NoteDtos.NoteDetail;
import com.deepthinker.note.NoteDtos.NoteListItem;
import com.deepthinker.note.NoteDtos.NoteRef;
import com.deepthinker.note.NoteDtos.NoteRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints de notas e do grafo. Cada método equivale a uma linha de
 * routes/api.php + o método correspondente do NoteController do Laravel.
 */
@RestController
@RequestMapping("/api")
public class NoteController {

    private final NoteService service;
    private final SummarizeService summarizer;
    private final NoteLinkService links;
    private final DailyNoteService daily;
    private final DiagramService diagrams;
    private final AudioSummaryService audio;

    public NoteController(NoteService service, SummarizeService summarizer, NoteLinkService links,
                          DailyNoteService daily, DiagramService diagrams, AudioSummaryService audio) {
        this.service = service;
        this.summarizer = summarizer;
        this.links = links;
        this.daily = daily;
        this.diagrams = diagrams;
        this.audio = audio;
    }

    @GetMapping("/notes")
    public List<NoteListItem> index() {
        return service.list();
    }

    @GetMapping("/notes/titles")
    public List<NoteRef> titles() {
        return service.titles();
    }

    /** Tags, propriedades e contagens de todas as notas (Tabela, Quadro e Painel). */
    @GetMapping("/notes/index")
    public List<NoteDtos.NoteIndexItem> noteIndex() {
        return service.index();
    }

    /** Todas as tags, com quantas notas usam cada uma. */
    @GetMapping("/tags")
    public List<NoteDtos.TagCount> tags() {
        return service.tags();
    }

    @GetMapping("/graph")
    public Graph graph() {
        return service.graph();
    }

    @PostMapping("/notes")
    @ResponseStatus(HttpStatus.CREATED)
    public NoteDetail store(@Valid @RequestBody NoteRequest req) {
        return service.create(req);
    }

    /** Resume a conversa do chat em notas ligadas (ver SummarizeService). */
    @PostMapping("/notes/summarize")
    @ResponseStatus(HttpStatus.CREATED)
    public SummarizeService.SummarizeResult summarize(@RequestBody SummarizeService.SummarizeRequest req) {
        return summarizer.summarize(req);
    }

    /** Nota do dia (cria na primeira vez). ?date=AAAA-MM-DD no fuso de quem usa. */
    @PostMapping("/notes/daily")
    public NoteDetail daily(@RequestParam(required = false) String date) {
        return daily.today(date);
    }

    /** "Transformar em diagrama": a IA devolve um diagrama Mermaid de uma nota ou de um texto. */
    @PostMapping("/notes/diagram")
    public DiagramService.DiagramResult diagram(@RequestBody DiagramService.DiagramRequest req) {
        return diagrams.diagram(req);
    }

    /**
     * "Resumo em áudio": a IA escreve um roteiro sobre as notas dos últimos dias.
     * Devolve só o texto; quem transforma em voz é o navegador (ver AudioSummaryService).
     */
    @PostMapping("/notes/audio-summary")
    public AudioSummaryService.AudioSummary audioSummary(@RequestBody(required = false) AudioSummaryService.AudioSummaryRequest req) {
        return audio.summarize(req);
    }

    /** Desenha o mapa mental da nota (feito para documentos importados) e grava em "## Mapa mental". */
    @PostMapping("/notes/{id}/mindmap")
    public NoteDetail mindmap(@PathVariable Long id) {
        return diagrams.mindmapIntoNote(id);
    }

    /** Quem aponta para esta nota (com link) e quem só cita o título (sem link). */
    @GetMapping("/notes/{id}/backlinks")
    public NoteLinkService.Backlinks backlinks(@PathVariable Long id) {
        return links.backlinks(id);
    }

    /** Transforma a menção solta do título desta nota, dentro da nota {sourceId}, em [[link]]. */
    @PostMapping("/notes/{id}/mentions/{sourceId}/link")
    public NoteDetail linkMention(@PathVariable Long id, @PathVariable Long sourceId) {
        return links.linkMention(id, sourceId);
    }

    @GetMapping("/notes/{id}")
    public NoteDetail show(@PathVariable Long id) {
        return service.show(id);
    }

    @PutMapping("/notes/{id}")
    public NoteDetail update(@PathVariable Long id, @Valid @RequestBody NoteRequest req) {
        return service.update(id, req);
    }

    /**
     * PATCH (e não PUT) porque muda só uma parte da nota: as propriedades enviadas.
     * {"properties": {"status": "feito"}} troca o status; {"properties": {"prazo": null}} apaga o prazo.
     */
    @PatchMapping("/notes/{id}/properties")
    public NoteDetail setProperties(@PathVariable Long id, @RequestBody NoteDtos.PropertiesRequest req) {
        return service.setProperties(id, req.properties());
    }

    @DeleteMapping("/notes/{id}")
    public Map<String, String> destroy(@PathVariable Long id) {
        service.delete(id);
        return Map.of("message", "Nota excluída com sucesso.");
    }
}
