package com.deepthinker.memory;

import com.deepthinker.note.Connection;
import com.deepthinker.note.ConnectionRepository;
import com.deepthinker.note.Note;
import com.deepthinker.note.NoteRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * A busca da memória, em duas etapas (o que se chama de "GraphRAG"):
 *
 * 1. Similaridade: compara o vetor da pergunta com o vetor de cada nota do usuário
 *    e fica com as topK mais parecidas (acima do piso e perto da melhor).
 * 2. Grafo: soma as notas ligadas por [[links]] a essas, mesmo que usem outras palavras.
 *    A busca vetorial acha a porta de entrada; os links trazem o contexto ao redor.
 *
 * A comparação é feita em Java, nota por nota ("força bruta"). Para alguns milhares
 * de notas leva poucos milissegundos; com muito mais, o próximo passo é o pgvector.
 */
@Service
public class NoteSearch {

    /** Quantas notas sem vetor a busca indexa na hora, antes de responder (o resto fica para o fundo). */
    static final int CATCH_UP_LIMIT = 50;

    public enum Reason { SIMILAR, LINKED }

    /** Uma nota encontrada. via = título da nota parecida que trouxe esta pelo grafo. */
    public record Hit(Note note, double score, Reason reason, String via) {
    }

    private final NoteEmbeddingRepository embeddings;
    private final NoteRepository notes;
    private final ConnectionRepository connections;
    private final EmbedderResolver resolver;
    private final MemoryIndexer indexer;

    public NoteSearch(NoteEmbeddingRepository embeddings, NoteRepository notes, ConnectionRepository connections,
                      EmbedderResolver resolver, MemoryIndexer indexer) {
        this.embeddings = embeddings;
        this.notes = notes;
        this.connections = connections;
        this.resolver = resolver;
        this.indexer = indexer;
    }

    public List<Hit> search(Long userId, String query, int topK, int neighbors) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        indexer.indexPending(userId, CATCH_UP_LIMIT);

        Embedder embedder = resolver.forUser(userId);
        float[] q = embedder.embedQuery(query);
        Map<Long, Double> scores = new HashMap<>();
        for (NoteEmbedding e : embeddings.findForUser(userId, embedder.id())) {
            scores.put(e.getNoteId(), (double) Embedder.dot(q, e.vector()));
        }

        // Etapa 1: as mais parecidas. Duas regras: acima do piso (minScore) e perto da melhor (margin).
        // O corte relativo é o que funciona no e5, que dá entre 0.80 e 0.90 para quase tudo.
        double best = scores.values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
        double cut = Math.max(embedder.minScore(), best - embedder.margin());
        List<Long> seeds = scores.entrySet().stream()
                .filter(en -> en.getValue() >= cut)
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(topK)
                .map(Map.Entry::getKey)
                .toList();
        if (seeds.isEmpty()) {
            return List.of();
        }

        // Etapa 2: vizinhas no grafo, das mais parecidas para as menos
        Map<Long, Long> viaOf = new LinkedHashMap<>();
        if (neighbors > 0) {
            for (Connection c : connections.findTouching(seeds)) {
                boolean fromSeed = seeds.contains(c.getSourceNoteId());
                Long other = fromSeed ? c.getTargetNoteId() : c.getSourceNoteId();
                Long seed = fromSeed ? c.getSourceNoteId() : c.getTargetNoteId();
                if (!seeds.contains(other)) {
                    viaOf.putIfAbsent(other, seed);
                }
            }
        }
        // Vizinha que não tem nada a ver com a pergunta fica de fora (a régua é mais folgada que a das parecidas)
        double neighborFloor = Math.max(embedder.minScore() / 2, cut - 2 * embedder.margin());
        List<Long> linked = viaOf.keySet().stream()
                .filter(id -> scores.getOrDefault(id, 0d) >= neighborFloor)
                .sorted(Comparator.comparingDouble((Long id) -> scores.getOrDefault(id, 0d)).reversed())
                .limit(neighbors)
                .toList();

        List<Long> ids = new ArrayList<>(seeds);
        ids.addAll(linked);
        Map<Long, Note> byId = MemoryIndexer.byId(notes.findAllById(ids), Note::getId);

        List<Hit> hits = new ArrayList<>();
        for (Long id : seeds) {
            Note n = byId.get(id);
            if (n != null && userId.equals(n.getUserId())) {
                hits.add(new Hit(n, scores.get(id), Reason.SIMILAR, null));
            }
        }
        for (Long id : linked) {
            Note n = byId.get(id);
            Note via = byId.get(viaOf.get(id));
            if (n != null && userId.equals(n.getUserId())) {
                hits.add(new Hit(n, scores.getOrDefault(id, 0d), Reason.LINKED, via == null ? null : via.getTitle()));
            }
        }
        return hits;
    }
}
