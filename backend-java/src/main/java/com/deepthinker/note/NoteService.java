package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.note.NoteDtos.Graph;
import com.deepthinker.note.NoteDtos.GraphLink;
import com.deepthinker.note.NoteDtos.GraphNode;
import com.deepthinker.note.NoteDtos.NoteDetail;
import com.deepthinker.note.NoteDtos.NoteIndexItem;
import com.deepthinker.note.NoteDtos.NoteListItem;
import com.deepthinker.note.NoteDtos.NoteRef;
import com.deepthinker.note.NoteDtos.NoteRequest;
import com.deepthinker.note.NoteDtos.TagCount;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Regras de negócio das notas. O controller só recebe HTTP e chama este service;
 * assim a lógica pode ser testada e reaproveitada (por exemplo pelo resumo da IA).
 *
 * Cada método trabalha só com as notas de quem está logado (CurrentUser.id()).
 */
@Service
public class NoteService {

    /** Máximo de versões guardadas por nota (as mais antigas saem). */
    static final int MAX_VERSIONS = 100;
    /**
     * Mudanças automáticas e pequenas (propriedade, Quadro, "Ligar") seguidas viram uma versão só:
     * arrastar 5 cartões no Quadro não deve encher o histórico com 5 versões quase iguais.
     */
    static final java.time.Duration QUIET = java.time.Duration.ofMinutes(10);
    /** Mudanças feitas de propósito: sempre guardam a versão anterior. */
    private static final Set<String> DELIBERATE = Set.of("edicao", "restauracao", "mapa-mental");

    private final NoteRepository notes;
    private final ConnectionRepository connections;
    private final NoteVersionRepository versions;
    private final ApplicationEventPublisher events;

    // Injeção de dependência pelo construtor: o Spring entrega os repositórios prontos.
    public NoteService(NoteRepository notes, ConnectionRepository connections, NoteVersionRepository versions,
                       ApplicationEventPublisher events) {
        this.notes = notes;
        this.connections = connections;
        this.versions = versions;
        this.events = events;
    }

    /**
     * Cartão criado direto no Quadro (source_type "board"): vive só no Quadro. Não entra no grafo,
     * nas listas, nas tags nem na memória da IA. Abrir pelo id continua funcionando.
     */
    public static boolean inGraph(Note n) {
        return !Note.SOURCE_BOARD.equals(n.getSourceType());
    }

    @Transactional(readOnly = true)
    public List<NoteListItem> list() {
        return notes.findByUserIdOrderByCreatedAtDesc(CurrentUser.id()).stream().filter(NoteService::inGraph)
                .map(NoteListItem::of).toList();
    }

    @Transactional(readOnly = true)
    public List<NoteRef> titles() {
        return notes.findByUserId(CurrentUser.id()).stream().filter(NoteService::inGraph).map(NoteRef::of).toList();
    }

    @Transactional(readOnly = true)
    public Graph graph() {
        Long userId = CurrentUser.id();
        List<GraphNode> nodes = notes.findByUserId(userId).stream().filter(NoteService::inGraph)
                .map(n -> new GraphNode(n.getId(), n.getTitle(), NoteMetadata.parse(n.getContent()).tags()))
                .toList();
        Set<Long> visible = nodes.stream().map(GraphNode::id).collect(java.util.stream.Collectors.toSet());
        List<GraphLink> links = connections.findByOwner(userId).stream()
                .filter(c -> visible.contains(c.getSourceNoteId()) && visible.contains(c.getTargetNoteId()))
                .map(c -> new GraphLink(c.getSourceNoteId(), c.getTargetNoteId(), c.getWeight()))
                .toList();
        return new Graph(nodes, links);
    }

    /**
     * Uma linha por nota com tags, propriedades e contagens: alimenta a Tabela, o Quadro e o Painel.
     * Lê o texto de todas as notas e conta as ligações em Java; para centenas ou poucos milhares
     * de notas isso leva milissegundos e evita manter tabelas extras sincronizadas.
     */
    @Transactional(readOnly = true)
    public List<NoteIndexItem> index() {
        Long userId = CurrentUser.id();
        Map<Long, Integer> out = new HashMap<>();
        Map<Long, Integer> in = new HashMap<>();
        for (Connection c : connections.findByOwner(userId)) {
            out.merge(c.getSourceNoteId(), 1, Integer::sum);
            in.merge(c.getTargetNoteId(), 1, Integer::sum);
        }
        return notes.findByUserIdOrderByCreatedAtDesc(userId).stream().filter(NoteService::inGraph).map(n -> {
            NoteMetadata.Parsed meta = NoteMetadata.parse(n.getContent());
            return new NoteIndexItem(n.getId(), n.getTitle(), meta.tags(), meta.properties(), n.getSourceType(),
                    n.getCreatedAt(), n.getUpdatedAt(), out.getOrDefault(n.getId(), 0), in.getOrDefault(n.getId(), 0),
                    countWords(meta.body()));
        }).toList();
    }

    /** Todas as tags com quantas notas usam cada uma, das mais usadas para as menos. */
    @Transactional(readOnly = true)
    public List<TagCount> tags() {
        Map<String, Long> counts = new HashMap<>();
        for (Note n : notes.findByUserId(CurrentUser.id())) {
            if (!inGraph(n)) {
                continue;
            }
            NoteMetadata.parse(n.getContent()).tags().forEach(t -> counts.merge(t, 1L, Long::sum));
        }
        return counts.entrySet().stream()
                .map(e -> new TagCount(e.getKey(), e.getValue()))
                .sorted(java.util.Comparator.comparingLong(TagCount::count).reversed().thenComparing(TagCount::tag))
                .toList();
    }

    static int countWords(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        int words = 0;
        for (String w : text.split("\\s+")) {
            if (w.chars().anyMatch(Character::isLetterOrDigit)) {
                words++;
            }
        }
        return words;
    }

    @Transactional(readOnly = true)
    public NoteDetail show(Long id) {
        Note note = find(id);
        List<Long> targetIds = connections.findBySourceNoteId(id).stream()
                .map(Connection::getTargetNoteId)
                .toList();
        List<NoteRef> connected = notes.findAllById(targetIds).stream().map(NoteRef::of).toList();
        return NoteDetail.of(note, connected);
    }

    @Transactional
    public NoteDetail create(NoteRequest req) {
        Long userId = CurrentUser.id();
        if (notes.existsByUserIdAndTitle(userId, req.title())) {
            throw ValidationException.of("title", "Já existe uma nota com este título.");
        }
        Note note = notes.save(new Note(userId, req.title(), req.content(), req.summary()));
        syncWikiLinks(note);
        connectIncoming(note);
        events.publishEvent(new NoteSavedEvent(note.getId()));
        return NoteDetail.of(note, null);
    }

    /**
     * Cria uma nota vinda de um fluxo automático (resumo, ferramenta da IA, upload),
     * guardando de onde ela veio em source_type/source_meta.
     */
    @Transactional
    public Note createWithSource(String title, String content, String summary,
                                 String sourceType, java.util.Map<String, Object> sourceMeta) {
        Long userId = CurrentUser.id();
        if (notes.existsByUserIdAndTitle(userId, title)) {
            throw ValidationException.of("title", "Já existe uma nota com o título '" + title + "'.");
        }
        Note note = new Note(userId, title, content, summary);
        note.setSourceType(sourceType);
        note.setSourceMeta(sourceMeta);
        note = notes.save(note);
        syncWikiLinks(note);
        connectIncoming(note);
        events.publishEvent(new NoteSavedEvent(note.getId()));
        return note;
    }

    @Transactional
    public NoteDetail update(Long id, NoteRequest req) {
        Note note = find(id);
        // O app manda só título e texto; sem este if, salvar apagava o resumo que a IA escreveu.
        if (req.summary() != null) {
            note.setSummary(req.summary());
        }
        saveEdit(note, req.title(), req.content(), "edicao");
        return NoteDetail.of(note, null);
    }

    /** Muda propriedades do cabeçalho da nota (ver NoteMetadata.withProperties). */
    @Transactional
    public NoteDetail setProperties(Long id, Map<String, Object> patch) {
        if (patch == null || patch.isEmpty()) {
            throw ValidationException.of("properties", "Envie ao menos uma propriedade.");
        }
        Note note = find(id);
        saveEdit(note, note.getTitle(), NoteMetadata.withProperties(note.getContent(), patch), "propriedades");
        return NoteDetail.of(note, null);
    }

    /**
     * O único caminho para mudar título ou texto de uma nota que já existe.
     * Editar na tela, "Ligar" uma menção, mudar propriedades (inclusive arrastando no Quadro)
     * e restaurar uma versão passam por aqui, então as regras valem para todos:
     * título único, links do grafo atualizados e memória da IA avisada.
     *
     * reason diz o que causou a mudança (aparece no histórico de versões).
     */
    @Transactional
    Note saveEdit(Note note, String title, String content, String reason) {
        if (notes.existsByUserIdAndTitleAndIdNot(note.getUserId(), title, note.getId())) {
            throw ValidationException.of("title", "Já existe uma nota com este título.");
        }
        boolean renamed = !note.getTitle().equals(title);
        if (!renamed && java.util.Objects.equals(note.getContent(), content)) {
            return note; // nada mudou: nem grava, nem cria versão
        }
        snapshot(note, reason);
        String oldTitle = note.getTitle();
        note.setTitle(title);
        note.setContent(content);
        notes.saveAndFlush(note);
        syncWikiLinks(note);
        if (renamed) {
            connectIncoming(note);
            events.publishEvent(new NoteRenamedEvent(note.getUserId(), oldTitle, title));
        }
        events.publishEvent(new NoteSavedEvent(note.getId()));
        return note;
    }

    /**
     * Guarda como a nota está AGORA, antes da mudança (o "Ctrl+Z" de longo prazo).
     * Não guarda se for igual à última versão, nem se for uma mudança automática logo depois
     * de outra (ver QUIET). Passou de 100 versões, apaga as mais antigas.
     */
    private void snapshot(Note note, String reason) {
        var last = versions.findFirstByNoteIdOrderByIdDesc(note.getId());
        if (last.isPresent()) {
            NoteVersion v = last.get();
            boolean same = v.getTitle().equals(note.getTitle()) && java.util.Objects.equals(v.getContent(), note.getContent());
            boolean recent = v.getCreatedAt().isAfter(java.time.Instant.now().minus(QUIET));
            if (same || (!DELIBERATE.contains(reason) && recent)) {
                return;
            }
        }
        versions.save(new NoteVersion(note.getId(), note.getUserId(), note.getTitle(), note.getContent(), reason));
        if (versions.countByNoteId(note.getId()) > MAX_VERSIONS) {
            List<Long> ids = versions.idsNewestFirst(note.getId());
            versions.deleteAllByIdInBatch(ids.subList(MAX_VERSIONS, ids.size()));
        }
    }

    /**
     * Troca (ou cria) a seção "## heading" da nota. O mapa mental do documento usa isto:
     * gerar de novo substitui o mapa antigo, e a versão anterior fica no histórico.
     */
    @Transactional
    public NoteDetail putSection(Long id, String heading, String body, boolean newAtTop, String reason) {
        Note note = find(id);
        saveEdit(note, note.getTitle(), NoteSections.withSection(note.getContent(), heading, body, newAtTop), reason);
        return NoteDetail.of(note, null);
    }

    /**
     * Texto vindo da edição em conjunto (pacote collab). Quem chama já conferiu que a pessoa
     * é a dona ou foi convidada. Passa pelo mesmo saveEdit: links, memória e histórico
     * ("colaboracao", agrupado como as outras mudanças automáticas).
     */
    @Transactional
    public Note saveCollaborative(Note note, String content) {
        return saveEdit(note, note.getTitle(), content, "colaboracao");
    }

    /** A nota de quem está logado (404 se for de outra pessoa). Usado pelo histórico de versões. */
    Note owned(Long id) {
        return find(id);
    }

    @Transactional
    public void delete(Long id) {
        Note note = find(id);
        connections.deleteAllTouching(id);
        notes.delete(note);
    }

    /**
     * Mesma lógica do NoteObserver do Laravel: apaga as conexões de saída da nota
     * e recria uma para cada [[Título]] que o mesmo usuário tem (sem autoconexão).
     */
    void syncWikiLinks(Note note) {
        connections.deleteOutgoing(note.getId());
        if (note.getContent() == null || note.getContent().isEmpty()) {
            return;
        }

        List<List<String>> links = new ArrayList<>();
        Set<String> candidates = new LinkedHashSet<>();
        Matcher m = WikiLinks.LINK.matcher(note.getContent());
        while (m.find()) {
            List<String> targets = WikiLinks.targets(m.group(1));
            links.add(targets);
            candidates.addAll(targets);
        }
        if (candidates.isEmpty()) {
            return;
        }

        Map<String, Long> existing = new HashMap<>();
        notes.findByUserIdAndTitleIn(note.getUserId(), candidates)
                .forEach(target -> existing.put(target.getTitle(), target.getId()));
        // Cada link liga à primeira opção que existe ("C# na prática" antes de "C"), sem repetir nem ligar a si mesma.
        Set<Long> targetIds = new LinkedHashSet<>();
        for (List<String> options : links) {
            options.stream().map(existing::get).filter(java.util.Objects::nonNull).findFirst()
                    .filter(id -> !id.equals(note.getId()))
                    .ifPresent(targetIds::add);
        }
        targetIds.forEach(id -> connections.save(new Connection(note.getId(), id)));
    }

    /**
     * O outro lado do link: notas antigas que já escreviam [[Este título]] antes desta nota existir.
     * Sem isso, clicar num link "quebrado" e criar a nota não ligaria as duas no grafo
     * (o Obsidian resolve isso na hora de mostrar; aqui gravamos a ligação ao criar ou renomear).
     */
    void connectIncoming(Note note) {
        String needle = "[[" + note.getTitle();
        for (Note other : notes.findByUserId(note.getUserId())) {
            if (other.getId().equals(note.getId()) || other.getContent() == null || !other.getContent().contains(needle)) {
                continue;
            }
            Matcher m = WikiLinks.LINK.matcher(other.getContent());
            while (m.find()) {
                if (WikiLinks.targets(m.group(1)).contains(note.getTitle())) {
                    if (!connections.existsBySourceNoteIdAndTargetNoteId(other.getId(), note.getId())) {
                        connections.save(new Connection(other.getId(), note.getId()));
                    }
                    break;
                }
            }
        }
    }

    private Note find(Long id) {
        // Nota de outra pessoa responde 404, como se não existisse: não revela nada.
        return notes.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Nota não encontrada."));
    }
}
