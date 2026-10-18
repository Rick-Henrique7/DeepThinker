package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.support.TestLogin;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * Backlinks, menções sem link, links com apelido, nota diária e "Transformar em diagrama".
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NoteLinksApiTest {

    @DynamicPropertySource
    static void llmProps(DynamicPropertyRegistry registry) {
        registry.add("deepthinker.llm.provider", () -> "lmstudio");
        registry.add("deepthinker.llm.plugins.lmstudio.base-url", FakeLlmServer::start);
    }

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    NoteRepository notes;

    @Autowired
    ConnectionRepository connections;

    MockMvc mvc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void login() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
    }

    private long createNote(String title, String content) throws Exception {
        String body = json.writeValueAsString(Map.of("title", title, "content", content));
        String response = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("id").asLong();
    }

    @Test
    void backlinksListLinkedAndUnlinkedMentions() throws Exception {
        long target = createNote("Medo de falir", "Tenho receio.");
        createNote("Plano da loja", "Isso tem a ver com [[Medo de falir]].");
        createNote("Conversa com o pai", "Ele falou do medo de falir dele também.");
        createNote("Sem relação", "Nada a ver. Palavra parecida: medo de faliram não conta? conta sim");
        createNote("Outra", "nadamedo de falir colado não conta");

        mvc.perform(get("/api/notes/" + target + "/backlinks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linked", hasSize(1)))
                .andExpect(jsonPath("$.linked[0].title").value("Plano da loja"))
                .andExpect(jsonPath("$.unlinked", hasSize(1)))
                .andExpect(jsonPath("$.unlinked[0].title").value("Conversa com o pai"))
                .andExpect(jsonPath("$.unlinked[0].snippet").value(org.hamcrest.Matchers.containsString("medo de falir")));
    }

    @Test
    void linkingAMentionKeepsTheWrittenTextAndCreatesTheConnection() throws Exception {
        long target = createNote("Medo de falir", "");
        long source = createNote("Conversa com o pai", "Ele falou do medo de falir dele.");

        mvc.perform(post("/api/notes/" + target + "/mentions/" + source + "/link"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("Ele falou do [[Medo de falir|medo de falir]] dele."));

        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(source, target)).isTrue();
        mvc.perform(get("/api/notes/" + target + "/backlinks"))
                .andExpect(jsonPath("$.linked", hasSize(1)))
                .andExpect(jsonPath("$.unlinked", hasSize(0)));
    }

    @Test
    void aliasLinkConnectsToTheTitleBeforeTheBar() throws Exception {
        long target = createNote("Estoicismo", "");
        long source = createNote("Leituras", "Comecei a ler sobre [[Estoicismo|os estoicos]].");
        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(source, target)).isTrue();
    }

    @Test
    void creatingTheTargetLaterConnectsNotesThatAlreadyLinkedToIt() throws Exception {
        long source = createNote("Plano", "Depende do [[Capital inicial]].");
        long target = createNote("Capital inicial", "40 mil.");
        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(source, target)).isTrue();
    }

    @Test
    void dailyNoteIsCreatedOnceWithAQuestion() throws Exception {
        String first = mvc.perform(post("/api/notes/daily").param("date", "2026-10-15"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Diário 15/10/2026"))
                .andExpect(jsonPath("$.source_type").value("daily"))
                .andExpect(jsonPath("$.content", startsWith("## Pergunta do dia")))
                .andReturn().getResponse().getContentAsString();
        long id = json.readTree(first).get("id").asLong();

        mvc.perform(post("/api/notes/daily").param("date", "2026-10-15"))
                .andExpect(jsonPath("$.id").value(id));
        mvc.perform(post("/api/notes/daily").param("date", "15/10/2026"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void dailyNoteOnEvenDaysLinksAnOlderNote() throws Exception {
        long old = createNote("Capital inicial", "Quanto preciso para começar.");
        // 2026-10-16 é um dia "par" (epochDay par): a pergunta puxa uma nota antiga.
        String body = mvc.perform(post("/api/notes/daily").param("date", "2026-10-16"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("[[Capital inicial]]");
        long daily = json.readTree(body).get("id").asLong();
        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(daily, old)).isTrue();
    }

    @Test
    void diagramReturnsCleanMermaid() throws Exception {
        long id = createNote("Abrir uma loja", "Prós: renda. Contras: risco.");
        mvc.perform(post("/api/notes/diagram").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note_id\":" + id + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mermaid", startsWith("mindmap")));

        mvc.perform(post("/api/notes/diagram").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"SEM_DIAGRAMA\"}"))
                .andExpect(status().isUnprocessableEntity());
    }
}
