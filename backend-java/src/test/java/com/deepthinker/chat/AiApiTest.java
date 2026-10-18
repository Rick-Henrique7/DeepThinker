package com.deepthinker.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.llm.LlmSettingRepository;
import com.deepthinker.note.ConnectionRepository;
import com.deepthinker.note.NoteRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import org.springframework.web.context.WebApplicationContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Testes do módulo de IA contra o FakeLlmServer.
 * O chat usa um servidor real numa porta aleatória (RANDOM_PORT), porque
 * o streaming precisa de uma conexão HTTP de verdade para ser lido aos poucos.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.provider", () -> "lmstudio");
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
        registry.add("deepthinker.llm.plugins.anthropic.base-url", FakeLlmServer::start);
        registry.add("deepthinker.llm.plugins.openai.api-key", () -> "");
    }

    @LocalServerPort
    int port;

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    /** MockMvc já logado com uma conta nova a cada teste (ver TestLogin). */
    MockMvc mvc;

    String token;

    @Autowired
    NoteRepository notes;

    @Autowired
    ConnectionRepository connections;

    @Autowired
    LlmSettingRepository settings;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        token = TestLogin.newUserToken(auth);
        mvc = TestLogin.mvcAs(ctx, token);
        connections.deleteAll();
        notes.deleteAll();
        settings.deleteAll();
    }

    private HttpResponse<String> streamChat(String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/chat/stream"))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void streamsTextChunksAndDone() throws Exception {
        HttpResponse<String> res = streamChat("{\"messages\":[{\"role\":\"user\",\"content\":\"oi\"}],\"mode\":\"critic\"}");

        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body())
                .contains("\"chunk\":\"Olá\"").contains("\"provider\":\"lmstudio\"")
                .contains("\"chunk\":\", mundo\"")
                .contains("\"done\":true");
    }

    @Test
    void toolCallCreatesANote() throws Exception {
        HttpResponse<String> res = streamChat(
                "{\"messages\":[{\"role\":\"user\",\"content\":\"salva isso\"}],\"tools_enabled\":true}");

        assertThat(res.body()).contains("\"tool_call\"").contains("\"tool_result\"").contains("\"ok\":true");
        assertThat(notes.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getTitle()).isEqualTo("Nota da IA");
            assertThat(n.getUserId()).as("a nota criada pela IA pertence a quem conversou").isNotNull();
            assertThat(n.getContent()).isEqualTo("Criada pela ferramenta");
            assertThat(n.getSourceMeta()).containsEntry("created_via", "tool_call");
        });
    }

    @Test
    void streamWithoutMessagesIs400() throws Exception {
        assertThat(streamChat("{\"messages\":[]}").statusCode()).isEqualTo(400);
    }

    @Test
    void openAiWithoutKeyIs503() throws Exception {
        HttpResponse<String> res = streamChat(
                "{\"messages\":[{\"role\":\"user\",\"content\":\"oi\"}],\"provider\":\"openai\"}");
        assertThat(res.statusCode()).isEqualTo(503);
        assertThat(res.body()).contains("OpenAI indisponível");
    }

    @Test
    void summarizeCreatesLinkedNotesAndReusesExistingOnes() throws Exception {
        mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Ideia Existente\"}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/notes/summarize").contentType(MediaType.APPLICATION_JSON).content("""
                        {"messages":[{"role":"user","content":"pergunta"},{"role":"assistant","content":"resposta"}],
                         "mode":"socratic","session_id":"abc"}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.note.title").value("Resumo do teste"))
                .andExpect(jsonPath("$.note.source_meta.session_id").value("abc"))
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.reused").value(1));

        mvc.perform(get("/api/graph"))
                .andExpect(jsonPath("$.nodes", hasSize(3)))
                .andExpect(jsonPath("$.links", hasSize(2)));
    }

    @Test
    void summarizeNeedsTwoMessages() throws Exception {
        mvc.perform(post("/api/notes/summarize").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messages\":[{\"role\":\"user\",\"content\":\"só uma\"}]}"))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void apiKeyIsSavedEncryptedAndReturnedMasked() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"openai\",\"api_key\":\"sk-teste-1234567890abcd\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.active_provider").value("openai"))
                .andExpect(jsonPath("$.settings.providers.openai.has_api_key").value(true))
                .andExpect(jsonPath("$.settings.providers.openai.api_key_masked").value("sk-****************abcd"));

        String stored = jdbc.queryForObject(
                "SELECT setting_value FROM llm_settings WHERE provider = 'openai' AND setting_key = 'api_key'",
                String.class);
        assertThat(stored).startsWith("enc:").doesNotContain("sk-teste");

        mvc.perform(get("/api/chat/providers"))
                .andExpect(jsonPath("$.default").value("openai"))
                .andExpect(jsonPath("$.providers.openai.available").value(true))
                .andExpect(jsonPath("$.providers.lmstudio.available").value(true));
    }

    @Test
    void rejectsUnknownProvider() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"xyz\"}"))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void connectionTestUsesTheActiveProvider() throws Exception {
        mvc.perform(post("/api/settings/llm/test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.provider").value("lmstudio"));
    }

    @Test
    void claudePluginStreamsAndCallsTools() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"anthropic\",\"api_key\":\"sk-ant-teste-123456\"}"))
                .andExpect(status().isOk());

        HttpResponse<String> res = streamChat(
                "{\"messages\":[{\"role\":\"user\",\"content\":\"salva\"}],\"tools_enabled\":true}");

        assertThat(res.statusCode()).isEqualTo(200);
        assertThat(res.body()).contains("\"chunk\":\"Oi do Claude\"").contains("\"provider\":\"anthropic\"");
        assertThat(notes.findAll()).singleElement()
                .satisfies(n -> assertThat(n.getTitle()).isEqualTo("Nota do Claude"));
    }

    @Test
    void summarizeWorksWithClaudeToo() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                .content("{\"provider\":\"anthropic\",\"api_key\":\"sk-ant-teste-123456\"}"));

        mvc.perform(post("/api/notes/summarize").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messages\":[{\"role\":\"user\",\"content\":\"a\"},{\"role\":\"assistant\",\"content\":\"b\"}]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.note.title").value("Resumo do teste"));
    }

    @Test
    void customPluginUsesTheAddressTheUserTyped() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"custom\",\"base_url\":\"" + FakeLlmServer.start()
                                + "\",\"model\":\"meu-modelo\"}"))
                .andExpect(jsonPath("$.settings.providers.custom.configured").value(true));

        HttpResponse<String> res = streamChat("{\"messages\":[{\"role\":\"user\",\"content\":\"oi\"}]}");
        assertThat(res.body()).contains("\"provider\":\"custom\"").contains("\"chunk\":\"Olá\"");
    }

    @Test
    void fixedAddressPluginsIgnoreBaseUrlChanges() throws Exception {
        mvc.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"openai\",\"base_url\":\"https://servidor-estranho.com/v1\"}"))
                .andExpect(jsonPath("$.settings.providers.openai.base_url").value("https://api.openai.com/v1"));
    }

    @Test
    void settingsListAllPluginsInOrder() throws Exception {
        mvc.perform(get("/api/settings/llm"))
                .andExpect(jsonPath("$.plugins[0]").value("openai"))
                .andExpect(jsonPath("$.plugins[1]").value("anthropic"))
                .andExpect(jsonPath("$.providers.groq.requires_api_key").value(true))
                .andExpect(jsonPath("$.providers.groq.key_url").value("https://console.groq.com/keys"))
                .andExpect(jsonPath("$.providers.custom.base_url_editable").value(true));
    }

    @Test
    void listsTools() throws Exception {
        mvc.perform(get("/api/chat/tools"))
                .andExpect(jsonPath("$.tools[0].function.name").value("create_note"));
    }
}
