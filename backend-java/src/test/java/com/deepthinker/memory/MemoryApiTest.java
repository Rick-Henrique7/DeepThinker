package com.deepthinker.memory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.support.TestLogin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Memória da IA de ponta a ponta, com a busca por palavras (HashingEmbedder),
 * que é o que roda nos testes (sem baixar modelo).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class MemoryApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.provider", () -> "lmstudio");
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
    }

    @LocalServerPort
    int port;

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    NoteEmbeddingRepository embeddings;

    @Autowired
    JsonMapper json;

    MockMvc mvc;

    String token;

    @BeforeEach
    void login() {
        token = TestLogin.newUserToken(auth);
        mvc = TestLogin.mvcAs(ctx, token);
    }

    private long createNote(MockMvc as, String title, String content) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("title", title, "content", content));
        String res = as.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("id").asLong();
    }

    private JsonNode search(String q, int neighbors) throws Exception {
        String res = mvc.perform(get("/api/memory/search").param("q", q).param("neighbors", "" + neighbors))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res);
    }

    private HttpResponse<String> streamChat(String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/chat/stream"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void notaCriadaGanhaVetorEApareceNaBusca() throws Exception {
        long medo = createNote(mvc, "Medo de falir", "Tenho medo de falir se abrir a empresa sem capital de giro.");
        createNote(mvc, "Receita de bolo", "Farinha, ovos e acucar. Forno por 40 minutos.");

        assertThat(embeddings.findById(medo)).as("o vetor nasce junto com a nota").isPresent();

        JsonNode hits = search("e se a empresa falir?", 0);
        assertThat(hits).isNotEmpty();
        assertThat(hits.get(0).get("title").asString()).isEqualTo("Medo de falir");
        assertThat(hits.get(0).get("reason").asString()).isEqualTo("similar");
        assertThat(hits.toString()).doesNotContain("Receita de bolo");
    }

    @Test
    void naoMostraNotasDeOutraPessoa() throws Exception {
        MockMvc outra = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        createNote(outra, "Segredo da outra pessoa", "Plano secreto de investimento em empresa.");
        createNote(mvc, "Minha nota", "Investimento em empresa de tecnologia.");

        JsonNode hits = search("investimento em empresa", 0);
        assertThat(hits.toString()).contains("Minha nota").doesNotContain("Segredo");
    }

    @Test
    void trazNotasLigadasPeloGrafoMesmoComOutrasPalavras() throws Exception {
        createNote(mvc, "Disciplina", "Rotina diaria sem depender de motivacao.");
        createNote(mvc, "Habitos de estudo", "Estudar todo dia de manha, ligado a [[Disciplina]].");

        JsonNode hits = search("como criar habitos de estudo", 3);
        assertThat(hits.get(0).get("title").asString()).isEqualTo("Habitos de estudo");
        assertThat(hits.toString()).contains("\"title\":\"Disciplina\"").contains("\"reason\":\"linked\"")
                .contains("\"via\":\"Habitos de estudo\"");
    }

    @Test
    void editarRecalculaEApagarRemoveOVetor() throws Exception {
        long id = createNote(mvc, "Viagem", "Planejar viagem para a praia.");
        String antes = embeddings.findById(id).orElseThrow().getContentHash();

        mvc.perform(put("/api/notes/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Viagem\",\"content\":\"Planejar viagem para a montanha.\"}"))
                .andExpect(status().isOk());
        assertThat(embeddings.findById(id).orElseThrow().getContentHash()).isNotEqualTo(antes);

        mvc.perform(delete("/api/notes/" + id)).andExpect(status().is2xxSuccessful());
        assertThat(embeddings.findById(id)).isEmpty();
    }

    @Test
    void chatColocaAsNotasNoPromptEMostraQuaisUsou() throws Exception {
        createNote(mvc, "Medo de falir", "Tenho medo de falir se abrir a empresa sem capital de giro.");

        HttpResponse<String> res = streamChat(
                "{\"messages\":[{\"role\":\"user\",\"content\":\"Quero abrir uma empresa, mas tenho medo de falir\"}]}");

        assertThat(res.body()).contains("\"memory\"").contains("\"title\":\"Medo de falir\"").contains("\"done\":true");
        assertThat(FakeLlmServer.lastStreamBody).contains("Memoria do usuario").contains("[[Medo de falir]]")
                .contains("capital de giro");
    }

    @Test
    void chatComMemoriaDesligadaNaoBuscaNotas() throws Exception {
        createNote(mvc, "Medo de falir", "Tenho medo de falir se abrir a empresa sem capital de giro.");

        HttpResponse<String> res = streamChat("{\"memory_enabled\":false,"
                + "\"messages\":[{\"role\":\"user\",\"content\":\"tenho medo de falir\"}]}");

        assertThat(res.body()).doesNotContain("\"memory\"").contains("\"done\":true");
        assertThat(FakeLlmServer.lastStreamBody).doesNotContain("Memoria do usuario");
    }

    @Test
    void mensagensSoDeTelaNaoVaoParaAIa() throws Exception {
        streamChat("{\"memory_enabled\":false,\"messages\":[{\"role\":\"tool\",\"content\":\"__memory__[]\"},"
                + "{\"role\":\"user\",\"content\":\"oi\"}]}");
        assertThat(FakeLlmServer.lastStreamBody).doesNotContain("__memory__");
    }

    @Test
    void statusMostraOModoPorPalavrasEQuantasNotasTemVetor() throws Exception {
        createNote(mvc, "Uma nota", "Conteudo qualquer.");
        mvc.perform(get("/api/memory/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.model").value("hashing-v1"))
                .andExpect(jsonPath("$.semantic").value(false))
                .andExpect(jsonPath("$.indexed").value(1))
                .andExpect(jsonPath("$.total").value(1));
    }
}
