package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import org.springframework.web.context.WebApplicationContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Testes de ponta a ponta da API de notas: sobem o Spring inteiro com banco
 * em memória e fazem requisições HTTP simuladas (MockMvc).
 * Cobrem os mesmos cenários de tests/Feature/NoteGraphTest.php e ApiNoteTest.php.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NoteApiTest {

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

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void cleanDatabase() {
        token = TestLogin.newUserToken(auth);
        mvc = TestLogin.mvcAs(ctx, token);
        connections.deleteAll();
        notes.deleteAll();
    }

    private long createNote(String title, String content) throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("title", title, "content", content));
        String response = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(response);
        return node.get("id").asLong();
    }

    @Test
    void createsConnectionWhenNoteContainsWikiLink() throws Exception {
        long target = createNote("Arquitetura de Software", "Conceitos avançados...");
        long source = createNote("Design Patterns", "Os padrões ajudam na [[Arquitetura de Software]].");

        mvc.perform(get("/api/notes/" + source))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected_notes", hasSize(1)))
                .andExpect(jsonPath("$.connected_notes[0].id").value(target))
                .andExpect(jsonPath("$.created_at").exists());
    }

    @Test
    void removesConnectionWhenLinkIsDeletedFromContent() throws Exception {
        createNote("Laravel", "");
        createNote("PostgreSQL", "");
        long main = createNote("Stack do Projeto", "Usamos [[Laravel]] e [[PostgreSQL]].");
        assertThat(connections.findBySourceNoteId(main)).hasSize(2);

        mvc.perform(put("/api/notes/" + main).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Stack do Projeto\",\"content\":\"Agora só [[Laravel]].\"}"))
                .andExpect(status().isOk());

        assertThat(connections.findBySourceNoteId(main)).hasSize(1);
    }

    @Test
    void graphReturnsNodesAndLinks() throws Exception {
        long a = createNote("A", "");
        long b = createNote("B", "liga em [[A]] e em [[B]]");

        mvc.perform(get("/api/graph"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nodes", hasSize(2)))
                .andExpect(jsonPath("$.links", hasSize(1)))
                .andExpect(jsonPath("$.links[0].source").value(b))
                .andExpect(jsonPath("$.links[0].target").value(a));
    }

    @Test
    void rejectsDuplicateTitleWith422() throws Exception {
        createNote("Ideia", "");

        mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Ideia\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors.title").exists());
    }

    @Test
    void rejectsMissingTitleWith422() throws Exception {
        mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"x\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors.title").exists());
    }

    @Test
    void deleteRemovesNoteAndItsConnections() throws Exception {
        long a = createNote("A", "");
        createNote("B", "[[A]]");

        mvc.perform(delete("/api/notes/" + a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").exists());

        assertThat(connections.count()).isZero();
        mvc.perform(get("/api/notes/" + a)).andExpect(status().isNotFound());
    }

    @Test
    void listIsNewestFirstAndTitlesWork() throws Exception {
        createNote("Primeira", "");
        Thread.sleep(5);
        createNote("Segunda", "");

        mvc.perform(get("/api/notes"))
                .andExpect(jsonPath("$[0].title").value("Segunda"));
        mvc.perform(get("/api/notes/titles"))
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void allowsCorsFromTheViteDevServer() throws Exception {
        mvc.perform(options("/api/notes")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }
}
