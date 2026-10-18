package com.deepthinker.memory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.support.TestLogin;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Escolha do modelo da memória: cada usuário escolhe em Configurações.
 * O "LM Studio" aqui é o FakeLlmServer, que também responde /v1/embeddings.
 */
@SpringBootTest
@ActiveProfiles("test")
class MemorySettingsApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
        registry.add("deepthinker.llm.plugins.openai.api-key", () -> "");
    }

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    NoteEmbeddingRepository embeddings;

    @Autowired
    JsonMapper json;

    MockMvc mvc;

    @BeforeEach
    void login() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
    }

    private long createNote(String title, String content) throws Exception {
        String res = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", content))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("id").asLong();
    }

    private void choose(String body) throws Exception {
        mvc.perform(put("/api/memory/settings").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    @Test
    void padraoEPorPalavrasEAsOpcoesTrazemPassoAPasso() throws Exception {
        mvc.perform(get("/api/memory/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embedding").value("palavras"))
                .andExpect(jsonPath("$.status.model").value("hashing-v1"))
                .andExpect(jsonPath("$.status.state").value("palavras"))
                .andExpect(jsonPath("$.options[*].id", Matchers.hasItems("palavras", "local", "openai", "gemini",
                        "mistral", "ollama", "lmstudio")))
                .andExpect(jsonPath("$.options[?(@.id=='ollama')].guide[0]").exists())
                .andExpect(jsonPath("$.options[?(@.id=='openai')].plugin").value("openai"))
                .andExpect(jsonPath("$.status.problem").doesNotExist());
    }

    @Test
    void opcaoSemChaveExplicaOProblemaEContinuaComOLocal() throws Exception {
        createNote("Medo de falir", "Tenho medo de falir se abrir a empresa sem capital de giro.");
        choose("{\"embedding\":\"openai\"}");

        mvc.perform(get("/api/memory/status"))
                .andExpect(jsonPath("$.embedding").value("openai"))
                .andExpect(jsonPath("$.problem", Matchers.containsString("Falta a API key de OpenAI")))
                .andExpect(jsonPath("$.model").value("hashing-v1"));
        mvc.perform(post("/api/memory/test")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.ok").value(false));
        mvc.perform(get("/api/memory/search").param("q", "medo de falir"))
                .andExpect(jsonPath("$[0].title").value("Medo de falir"));
    }

    @Test
    void modeloPorApiIndexaETestaEBusca() throws Exception {
        long medo = createNote("Medo de falir", "Tenho medo de falir se abrir a empresa sem capital de giro.");
        createNote("Receita de bolo", "Farinha, ovos e acucar. Forno por quarenta minutos.");
        choose("{\"embedding\":\"lmstudio\",\"model\":\"embed-de-teste\"}");

        mvc.perform(post("/api/memory/test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.dimensions").value(16))
                .andExpect(jsonPath("$.model").value("lmstudio:embed-de-teste"));

        String res = mvc.perform(get("/api/memory/search").param("q", "medo de falir com a empresa"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode hits = json.readTree(res);
        assertThat(hits.get(0).get("title").asString()).isEqualTo("Medo de falir");
        assertThat(res).doesNotContain("Receita de bolo");
        assertThat(embeddings.findById(medo).orElseThrow().getModel()).isEqualTo("lmstudio:embed-de-teste");

        mvc.perform(get("/api/memory/status"))
                .andExpect(jsonPath("$.semantic").value(true))
                .andExpect(jsonPath("$.indexed").value(2))
                .andExpect(jsonPath("$.problem").doesNotExist());
    }

    @Test
    void voltarParaOLocalApagaModeloEEnderecoDaOpcaoAnterior() throws Exception {
        choose("{\"embedding\":\"ollama\",\"model\":\"bge-m3\",\"base_url\":\"http://127.0.0.1:9/v1\"}");
        mvc.perform(get("/api/memory/settings"))
                .andExpect(jsonPath("$.model").value("bge-m3"))
                .andExpect(jsonPath("$.base_url").value("http://127.0.0.1:9/v1"));

        choose("{\"embedding\":\"local\"}");
        mvc.perform(get("/api/memory/settings"))
                .andExpect(jsonPath("$.embedding").value("local"))
                .andExpect(jsonPath("$.base_url").doesNotExist());
    }

    @Test
    void validaOpcaoEEndereco() throws Exception {
        mvc.perform(put("/api/memory/settings").contentType(MediaType.APPLICATION_JSON).content("{\"embedding\":\"x\"}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(put("/api/memory/settings").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"embedding\":\"ollama\",\"base_url\":\"file:///etc\"}"))
                .andExpect(status().isUnprocessableContent());
    }
}
