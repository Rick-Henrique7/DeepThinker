package com.deepthinker.memory;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.ValidationException;
import com.deepthinker.memory.EmbedderResolver.Resolved;
import com.deepthinker.note.NoteRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints da memória:
 *   GET  /api/memory/status          qual modelo está em uso e quantas notas já têm vetor
 *   GET  /api/memory/settings        opções de modelo (com passo a passo) + a escolha atual
 *   PUT  /api/memory/settings        troca o modelo {embedding, model, base_url} e recalcula os vetores
 *   POST /api/memory/test            gera um vetor de teste com o modelo escolhido
 *   GET  /api/memory/search?q=...    a mesma busca que o chat usa (bom para testar e para "notas parecidas")
 *   POST /api/memory/reindex         calcula os vetores que faltam das suas notas
 */
@RestController
@RequestMapping("/api/memory")
public class MemoryController {

    private final MemoryProperties props;
    private final EmbeddingEngine engine;
    private final EmbeddingCatalog catalog;
    private final MemorySettings settings;
    private final EmbedderResolver resolver;
    private final NoteSearch search;
    private final MemoryService memory;
    private final MemoryIndexer indexer;
    private final NoteEmbeddingRepository embeddings;
    private final NoteRepository notes;

    public MemoryController(MemoryProperties props, EmbeddingEngine engine, EmbeddingCatalog catalog,
                            MemorySettings settings, EmbedderResolver resolver, NoteSearch search,
                            MemoryService memory, MemoryIndexer indexer, NoteEmbeddingRepository embeddings,
                            NoteRepository notes) {
        this.props = props;
        this.engine = engine;
        this.catalog = catalog;
        this.settings = settings;
        this.resolver = resolver;
        this.search = search;
        this.memory = memory;
        this.indexer = indexer;
        this.embeddings = embeddings;
        this.notes = notes;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return status(CurrentUser.id());
    }

    @GetMapping("/settings")
    public Map<String, Object> settings() {
        Long userId = CurrentUser.id();
        List<Map<String, Object>> options = new ArrayList<>();
        for (EmbeddingOption o : catalog.all()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.id());
            m.put("label", o.label());
            m.put("description", o.description());
            m.put("plugin", o.pluginId());
            m.put("default_model", o.defaultModel());
            m.put("models", o.models());
            m.put("base_url_editable", o.baseUrlEditable());
            m.put("default_base_url", o.defaultBaseUrl());
            m.put("local", o.local());
            m.put("guide", o.guide());
            options.add(m);
        }
        MemorySettings.Choice choice = settings.choice(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("embedding", choice.option().id());
        out.put("model", choice.model());
        out.put("base_url", choice.baseUrl());
        out.put("options", options);
        out.put("status", status(userId));
        return out;
    }

    public record SettingsRequest(String embedding, String model, String baseUrl) {
    }

    @PutMapping("/settings")
    public Map<String, Object> save(@RequestBody SettingsRequest req) {
        if (req == null || catalog.find(req.embedding()).isEmpty()) {
            throw ValidationException.of("embedding", "Escolha uma opção de memória válida.");
        }
        if (req.model() != null && req.model().length() > 120) {
            throw ValidationException.of("model", "O nome do modelo pode ter no máximo 120 caracteres.");
        }
        if (req.baseUrl() != null && !req.baseUrl().isBlank() && !req.baseUrl().matches("^https?://.{1,240}$")) {
            throw ValidationException.of("base_url", "O endereço deve começar com http:// ou https://.");
        }
        Long userId = CurrentUser.id();
        settings.save(userId, req.embedding(), req.model(), req.baseUrl());
        // Modelo novo = vetores novos. Recalcula em segundo plano; enquanto isso, a busca faz o que der.
        Thread.ofVirtual().name("memoria-reindex-" + userId).start(() -> indexer.indexPending(userId, Integer.MAX_VALUE));
        return settings();
    }

    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> test() {
        Resolved r = resolver.resolve(CurrentUser.id());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("model", r.embedder().id());
        if (r.problem() != null) {
            out.put("ok", false);
            out.put("error", r.problem());
            return ResponseEntity.status(400).body(out);
        }
        try {
            long t0 = System.currentTimeMillis();
            float[] v = r.embedder().embedQuery("teste de conexão da memória");
            out.put("ok", true);
            out.put("dimensions", v.length);
            out.put("ms", System.currentTimeMillis() - t0);
            out.put("semantic", r.embedder().semantic());
            return ResponseEntity.ok(out);
        } catch (RuntimeException e) {
            out.put("ok", false);
            out.put("error", e.getMessage());
            return ResponseEntity.status(502).body(out);
        }
    }

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam String q,
                                            @RequestParam(defaultValue = "5") int k,
                                            @RequestParam(defaultValue = "0") int neighbors) {
        int topK = Math.max(1, Math.min(k, 20));
        int n = Math.max(0, Math.min(neighbors, 10));
        List<NoteSearch.Hit> hits = search.search(CurrentUser.id(), q, topK, n);
        return new MemoryService.Recall(hits, "").forClient();
    }

    @PostMapping("/reindex")
    public Map<String, Object> reindex() {
        int done = indexer.indexPending(CurrentUser.id(), Integer.MAX_VALUE);
        return Map.of("indexed_now", done, "enabled", memory.enabled());
    }

    private Map<String, Object> status(Long userId) {
        Resolved r = resolver.resolve(userId);
        Embedder current = r.embedder();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", props.enabled());
        out.put("embedding", r.choice().option().id());
        out.put("model", current.id());
        out.put("semantic", current.semantic());
        EmbeddingOption option = r.choice().option();
        // Estado do modelo local (baixando, carregando...) só interessa a quem escolheu o local
        out.put("state", option.isLocal() ? engine.state()
                : option.isWords() || r.problem() != null ? "palavras" : "pronto");
        out.put("detail", r.problem() != null ? r.problem()
                : option.isLocal() ? engine.detail()
                : option.isWords() ? "Busca por palavras. Nada para baixar."
                : "Usando " + option.label() + ".");
        out.put("problem", r.problem());
        out.put("indexed", embeddings.countForUser(userId, current.id()));
        out.put("total", notes.countByUserId(userId));
        return out;
    }
}
