package com.deepthinker.memory;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Prova que o caminho ONNX funciona (carregar model.onnx + tokenizer.json de uma pasta
 * e gerar vetores com significado), sem internet: usa um modelo pequeno, em inglês,
 * que vem dentro de um jar de teste. Em produção o modelo é o multilingual-e5-small.
 */
class OnnxEmbedderTest {

    @TempDir
    Path dir;

    private void copy(String resource, String target) throws Exception {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertThat(in).as(resource).isNotNull();
            Files.copy(in, dir.resolve(target));
        }
    }

    @Test
    void entendeSignificadoENaoSoPalavras() throws Exception {
        copy("all-minilm-l6-v2-q.onnx", EmbeddingEngine.MODEL_FILE);
        copy("all-minilm-l6-v2-q-tokenizer.json", EmbeddingEngine.TOKENIZER_FILE);

        MemoryProperties props = new MemoryProperties(true, "minilm-teste", dir, false, null, null,
                "", "", 0.3, 0.1, 5, 0, false);
        EmbeddingEngine engine = new EmbeddingEngine(props, event -> { });
        assertThat(engine.loadModel()).isTrue();
        Embedder e = engine.current();
        assertThat(e.semantic()).isTrue();
        assertThat(e.id()).isEqualTo("minilm-teste");

        float[] gato = e.embedPassage("The cat is sleeping on the sofa.");
        float[] bolsa = e.embedPassage("The stock market fell sharply today.");
        float[] pergunta = e.embedQuery("a kitten napping on the couch");

        // Nenhuma palavra em comum com a frase do gato, mas o sentido é o mesmo
        assertThat(Embedder.dot(pergunta, gato)).isGreaterThan(Embedder.dot(pergunta, bolsa) + 0.2f);
    }

    @Test
    void ensureLoadingCarregaEmSegundoPlanoEAvisaQuandoTermina() throws Exception {
        copy("all-minilm-l6-v2-q.onnx", EmbeddingEngine.MODEL_FILE);
        copy("all-minilm-l6-v2-q-tokenizer.json", EmbeddingEngine.TOKENIZER_FILE);
        MemoryProperties props = new MemoryProperties(true, "minilm-teste", dir, false, null, null,
                "", "", 0.3, 0.1, 5, 0, false);
        java.util.List<Object> events = new java.util.concurrent.CopyOnWriteArrayList<>();
        EmbeddingEngine engine = new EmbeddingEngine(props, events::add);

        assertThat(engine.modelPresent()).isTrue();
        assertThat(engine.current().semantic()).isFalse();
        engine.ensureLoading();
        engine.ensureLoading(); // chamar de novo não começa outro carregamento

        long deadline = System.currentTimeMillis() + 30_000;
        while (events.isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(50);
        }
        assertThat(engine.current().semantic()).isTrue();
        assertThat(events).containsExactly(new EmbeddingEngine.ModelLoaded("minilm-teste"));
    }

    @Test
    void semModeloEComDownloadDesligadoFicaNaBuscaPorPalavras() {
        MemoryProperties props = new MemoryProperties(true, "x", dir.resolve("vazia"), false, null, null,
                "", "", 0.8, 0.03, 5, 0, false);
        EmbeddingEngine engine = new EmbeddingEngine(props, event -> { });
        assertThat(engine.loadModel()).isFalse();
        assertThat(engine.current()).isInstanceOf(HashingEmbedder.class);
        assertThat(engine.detail()).contains("download automatico esta desligado");
        assertThat(engine.modelPresent()).isFalse();
    }
}
