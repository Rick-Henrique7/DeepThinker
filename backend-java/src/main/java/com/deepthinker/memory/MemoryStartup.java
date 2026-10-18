package com.deepthinker.memory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Quando o servidor termina de subir: carrega o modelo local, se ele já foi baixado antes,
 * e indexa as notas que faltam. Nunca baixa nada aqui: o download só acontece quando
 * alguém escolhe "Modelo local" (EmbeddingEngine.ensureLoading).
 * Roda numa thread separada para o servidor já atender enquanto isso.
 */
@Component
public class MemoryStartup {

    private static final Logger log = LoggerFactory.getLogger(MemoryStartup.class);

    private final MemoryProperties props;
    private final EmbeddingEngine engine;
    private final MemoryIndexer indexer;

    public MemoryStartup(MemoryProperties props, EmbeddingEngine engine, MemoryIndexer indexer) {
        this.props = props;
        this.engine = engine;
        this.indexer = indexer;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!props.enabled()) {
            return;
        }
        Thread.ofVirtual().name("memoria-startup").start(() -> {
            if (engine.modelPresent()) {
                engine.loadModel(); // avisa ModelLoaded, que indexa abaixo
                return;
            }
            if (props.indexOnStartup()) {
                long t0 = System.currentTimeMillis();
                int n = indexer.indexPending(null, Integer.MAX_VALUE);
                log.info("Memoria: {} notas indexadas em {} ms (modelo local: {})", n,
                        System.currentTimeMillis() - t0, engine.current().id());
            }
        });
    }

    /** O modelo local acabou de carregar (na abertura ou depois de baixar): indexa as notas com ele. */
    @EventListener
    public void onModelLoaded(EmbeddingEngine.ModelLoaded event) {
        if (!props.indexOnStartup()) {
            return;
        }
        Thread.ofVirtual().name("memoria-indexar").start(() -> {
            long t0 = System.currentTimeMillis();
            int n = indexer.indexPending(null, Integer.MAX_VALUE);
            log.info("Memoria: {} notas indexadas em {} ms com {}", n, System.currentTimeMillis() - t0, event.modelId());
        });
    }
}
