package com.deepthinker.memory;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Guarda qual Embedder está em uso agora.
 *
 * Começa com o HashingEmbedder (funciona na hora) e troca para o modelo ONNX
 * assim que ele carrega. O modelo só é baixado (~120 MB, uma vez) quando alguém
 * escolhe "Modelo local" nas configurações: ver ensureLoading(). Ao abrir o app,
 * ele só é carregado se já estiver na pasta. Se algo falhar, a memória
 * continua funcionando no modo por palavras e o status explica o motivo.
 */
@Component
public class EmbeddingEngine {
    // Este é o motor do modelo LOCAL. Qual modelo cada usuário usa é decidido em EmbedderResolver.


    private static final Logger log = LoggerFactory.getLogger(EmbeddingEngine.class);

    static final String MODEL_FILE = "model.onnx";
    static final String TOKENIZER_FILE = "tokenizer.json";

    /** Depois de uma falha (ex.: sem internet), espera isto antes de tentar baixar de novo. */
    private static final long RETRY_AFTER_MS = 5 * 60 * 1000;

    /** Avisado quando o modelo carrega, para indexar as notas com ele (ver MemoryStartup). */
    public record ModelLoaded(String modelId) {
    }

    private final MemoryProperties props;
    private final ApplicationEventPublisher events;
    private final Embedder words = new HashingEmbedder();
    private final AtomicBoolean loading = new AtomicBoolean(false);
    private volatile long lastFailureAt = 0;

    // volatile: a troca acontece numa thread e é lida por todas as outras
    private volatile Embedder current = new HashingEmbedder();
    private volatile String state = "palavras";
    private volatile String detail = "Modelo de embeddings ainda nao carregado.";

    public EmbeddingEngine(MemoryProperties props, ApplicationEventPublisher events) {
        this.props = props;
        this.events = events;
    }

    /** A busca por palavras, sempre disponível. */
    public Embedder words() {
        return words;
    }

    /** O modelo já está na pasta? (então dá para carregar sem baixar nada) */
    public boolean modelPresent() {
        Path dir = props.modelDir();
        return dir != null && Files.exists(dir.resolve(MODEL_FILE)) && Files.exists(dir.resolve(TOKENIZER_FILE));
    }

    /**
     * Garante que o modelo local esteja carregado ou a caminho. Não bloqueia: baixa e carrega
     * numa thread separada. Chamar várias vezes não baixa duas vezes.
     */
    public void ensureLoading() {
        if (current.semantic() || !props.enabled()) {
            return;
        }
        if (System.currentTimeMillis() - lastFailureAt < RETRY_AFTER_MS) {
            return;
        }
        if (loading.compareAndSet(false, true)) {
            Thread.ofVirtual().name("memoria-modelo").start(() -> {
                try {
                    loadModel();
                } finally {
                    loading.set(false);
                }
            });
        }
    }

    public Embedder current() {
        return current;
    }

    public String state() {
        return state;
    }

    public String detail() {
        return detail;
    }

    /** Carrega (e baixa, se preciso e permitido) o modelo. Devolve true se trocou para o modelo ONNX. */
    public boolean loadModel() {
        Path dir = props.modelDir();
        if (dir == null) {
            detail = "Nenhuma pasta de modelo configurada (MEMORY_MODEL_DIR).";
            return false;
        }
        Path model = dir.resolve(MODEL_FILE);
        Path tokenizer = dir.resolve(TOKENIZER_FILE);
        try {
            if (!Files.exists(model) || !Files.exists(tokenizer)) {
                if (!props.autoDownload()) {
                    detail = "Modelo nao encontrado em " + dir.toAbsolutePath() + " e o download automatico esta desligado.";
                    return false;
                }
                state = "baixando";
                detail = "Baixando o modelo " + props.modelName() + " (so na primeira vez).";
                log.info("Memoria: baixando o modelo {} para {}", props.modelName(), dir.toAbsolutePath());
                Files.createDirectories(dir);
                download(props.tokenizerUrl(), tokenizer);
                download(props.modelUrl(), model);
            }
            state = "carregando";
            Embedder onnx = new OnnxEmbedder(props.modelName(), model, tokenizer,
                    props.queryPrefix(), props.passagePrefix(), props.minScore(), props.margin());
            onnx.embedQuery("teste"); // falha aqui, e não no meio de uma conversa, se o arquivo estiver corrompido
            use(onnx);
            log.info("Memoria: modelo {} carregado", props.modelName());
            events.publishEvent(new ModelLoaded(onnx.id()));
            return true;
        } catch (Exception | LinkageError e) {
            lastFailureAt = System.currentTimeMillis();
            state = "palavras";
            detail = "Nao foi possivel carregar o modelo (" + e.getMessage() + "). Usando busca por palavras.";
            log.warn("Memoria: {}", detail);
            return false;
        }
    }

    /** Troca o embedder em uso (também usado pelos testes). */
    public void use(Embedder embedder) {
        current = embedder;
        state = embedder.semantic() ? "pronto" : "palavras";
        detail = embedder.semantic()
                ? "Busca por significado com o modelo " + embedder.id() + "."
                : "Busca por palavras (sem modelo de embeddings).";
    }

    private static void download(String url, Path target) throws IOException, InterruptedException {
        HttpClient http = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL) // o Hugging Face redireciona para a CDN
                .connectTimeout(Duration.ofSeconds(20))
                .build();
        HttpResponse<InputStream> res = http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
        if (res.statusCode() != 200) {
            res.body().close();
            throw new IOException("HTTP " + res.statusCode() + " ao baixar " + url);
        }
        // Baixa num arquivo temporário e só renomeia no fim: um download pela metade nunca vira "o modelo".
        Path tmp = target.resolveSibling(target.getFileName() + ".part");
        try (InputStream in = res.body()) {
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
    }
}
