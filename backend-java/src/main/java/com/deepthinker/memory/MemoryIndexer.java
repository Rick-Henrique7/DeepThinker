package com.deepthinker.memory;

import com.deepthinker.note.Note;
import com.deepthinker.note.NoteRepository;
import com.deepthinker.note.NoteSavedEvent;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Mantém o vetor de cada nota em dia.
 *
 * - Nota criada/editada: recalcula logo depois que o banco confirma (evento NoteSavedEvent).
 * - Notas antigas, ou troca de modelo: indexPending() calcula o que falta.
 * O hash do conteúdo evita trabalho repetido: nota que não mudou não é recalculada.
 */
@Component
public class MemoryIndexer {

    private static final Logger log = LoggerFactory.getLogger(MemoryIndexer.class);

    /** Texto demais estoura o limite do modelo (512 tokens); o começo da nota é o que mais importa. */
    static final int MAX_CHARS = 1500;

    /** Quantas notas mandar de uma vez para o modelo (uma chamada de API por lote). */
    static final int BATCH = 32;

    /** Chave para as notas sem dono (antigas, de antes do login) no agrupamento por usuário. */
    private static final Long NO_OWNER = -1L;

    private final NoteRepository notes;
    private final NoteEmbeddingRepository embeddings;
    private final EmbedderResolver resolver;
    private final TransactionTemplate newTx;

    public MemoryIndexer(NoteRepository notes, NoteEmbeddingRepository embeddings, EmbedderResolver resolver,
                         PlatformTransactionManager txManager) {
        this.notes = notes;
        this.embeddings = embeddings;
        this.resolver = resolver;
        // Cada vetor é gravado na sua própria transação: uma falha não desfaz as outras
        this.newTx = new TransactionTemplate(txManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Roda depois do COMMIT da nota. Se der erro aqui, a nota continua salva:
     * só fica sem vetor até a próxima indexPending().
     */
    @TransactionalEventListener
    public void onNoteSaved(NoteSavedEvent event) {
        try {
            newTx.executeWithoutResult(s -> notes.findById(event.noteId()).ifPresent(this::index));
        } catch (RuntimeException e) {
            log.warn("Memoria: nao indexou a nota {}: {}", event.noteId(), e.getMessage());
        }
    }

    /**
     * Calcula os vetores que faltam (ou estão velhos) para um usuário, ou para todos se userId for null.
     * Cada usuário usa o modelo que escolheu. Para depois de "limit" notas, para não travar
     * quem chamou. Devolve quantas indexou.
     */
    public int indexPending(Long userId, int limit) {
        // Cartões só do Quadro não entram na memória (NoteService.inGraph)
        List<Note> list = (userId == null ? notes.findAll() : notes.findByUserId(userId)).stream()
                .filter(com.deepthinker.note.NoteService::inGraph).toList();
        Map<Long, String> hashes = embeddings.findAllById(list.stream().map(Note::getId).toList()).stream()
                .collect(Collectors.toMap(NoteEmbedding::getNoteId, NoteEmbedding::getContentHash));

        // Agrupa por dono: cada um pode ter escolhido um modelo diferente
        Map<Long, List<Note>> byOwner = new LinkedHashMap<>();
        for (Note n : list) {
            byOwner.computeIfAbsent(n.getUserId() == null ? NO_OWNER : n.getUserId(), k -> new ArrayList<>()).add(n);
        }

        int done = 0;
        for (Map.Entry<Long, List<Note>> group : byOwner.entrySet()) {
            Long owner = group.getKey() == NO_OWNER ? null : group.getKey();
            Embedder embedder = resolver.forUser(owner);
            List<Note> pending = group.getValue().stream()
                    .filter(n -> !hash(embedder, passageText(n)).equals(hashes.get(n.getId())))
                    .limit(Math.max(0, limit - done))
                    .toList();
            for (int i = 0; i < pending.size(); i += BATCH) {
                List<Note> batch = pending.subList(i, Math.min(pending.size(), i + BATCH));
                List<float[]> vectors;
                try {
                    vectors = embedder.embedPassages(batch.stream().map(MemoryIndexer::passageText).toList());
                } catch (RuntimeException e) {
                    // API fora do ar, chave errada...: tenta de novo na próxima vez, sem travar os outros usuários
                    log.warn("Memoria: nao indexou notas do usuario {} com {}: {}", owner, embedder.id(), e.getMessage());
                    break;
                }
                for (int j = 0; j < batch.size(); j++) {
                    Note note = batch.get(j);
                    float[] vector = vectors.get(j);
                    try {
                        newTx.executeWithoutResult(s -> save(note, embedder, vector));
                        done++;
                    } catch (RuntimeException e) {
                        // Duas threads indexando a mesma nota ao mesmo tempo: a outra já gravou, tudo certo
                        log.debug("Memoria: nota {} pulada: {}", note.getId(), e.getMessage());
                    }
                }
            }
        }
        return done;
    }

    void index(Note note) {
        if (!com.deepthinker.note.NoteService.inGraph(note)) {
            return; // cartão só do Quadro: fora da memória
        }
        Embedder embedder = resolver.forUser(note.getUserId());
        String text = passageText(note);
        NoteEmbedding row = embeddings.findById(note.getId()).orElse(null);
        if (row != null && hash(embedder, text).equals(row.getContentHash())) {
            return;
        }
        save(note, embedder, embedder.embedPassage(text));
    }

    private void save(Note note, Embedder embedder, float[] vector) {
        NoteEmbedding row = embeddings.findById(note.getId()).orElseGet(() -> new NoteEmbedding(note.getId()));
        row.set(embedder.id(), hash(embedder, passageText(note)), vector);
        embeddings.save(row);
    }

    /** O que vira vetor: título + resumo + conteúdo, sem os colchetes dos [[links]]. */
    static String passageText(Note note) {
        StringBuilder sb = new StringBuilder(note.getTitle());
        if (note.getSummary() != null && !note.getSummary().isBlank()) {
            sb.append(". ").append(note.getSummary());
        }
        if (note.getContent() != null && !note.getContent().isBlank()) {
            sb.append("\n").append(note.getContent().replace("[[", "").replace("]]", ""));
        }
        return sb.length() > MAX_CHARS ? sb.substring(0, MAX_CHARS) : sb.toString();
    }

    static String hash(Embedder embedder, String text) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] digest = sha.digest((embedder.id() + "\n" + text).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static <T> Map<Long, T> byId(List<T> items, Function<T, Long> id) {
        return items.stream().collect(Collectors.toMap(id, Function.identity()));
    }
}
