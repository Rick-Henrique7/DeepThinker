package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/** Tags, propriedades, o índice das notas (Tabela/Quadro/Painel) e links para seções. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotePropertiesApiTest {

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
    void noteComesWithTagsAndProperties() throws Exception {
        long id = createNote("Loja", "---\nstatus: a fazer\nprioridade: 2\ntags: [negocio]\n---\nPensar no #capital.");
        mvc.perform(get("/api/notes/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags", contains("negocio", "capital")))
                .andExpect(jsonPath("$.properties.status").value("a fazer"))
                .andExpect(jsonPath("$.properties.prioridade").value(2))
                .andExpect(jsonPath("$.frontmatter_error").value(false));
    }

    @Test
    void patchChangesOnlyTheGivenProperties() throws Exception {
        long id = createNote("Loja", "Texto sem cabeçalho.");
        mvc.perform(patch("/api/notes/" + id + "/properties").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"properties\":{\"status\":\"fazendo\",\"nota\":8}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("---\nstatus: fazendo\nnota: 8\n---\nTexto sem cabeçalho."))
                .andExpect(jsonPath("$.properties.nota").value(8));

        mvc.perform(patch("/api/notes/" + id + "/properties").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"properties\":{\"nota\":null}}"))
                .andExpect(jsonPath("$.content").value("---\nstatus: fazendo\n---\nTexto sem cabeçalho."));

        mvc.perform(patch("/api/notes/" + id + "/properties").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"properties\":{}}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void brokenHeaderIsFlaggedAndNotRewritten() throws Exception {
        long id = createNote("Quebrada", "---\na: [x\n---\ncorpo");
        mvc.perform(get("/api/notes/" + id)).andExpect(jsonPath("$.frontmatter_error").value(true));
        mvc.perform(patch("/api/notes/" + id + "/properties").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"properties\":{\"b\":1}}"))
                .andExpect(status().isUnprocessableEntity());
        assertThat(notes.findById(id).orElseThrow().getContent()).isEqualTo("---\na: [x\n---\ncorpo");
    }

    @Test
    void indexAndTagsCountEverything() throws Exception {
        long a = createNote("A", "---\nstatus: feito\n---\n#ideia ligada a [[B]]");
        long b = createNote("B", "uma #ideia e #leitura");
        createNote("C", "sem nada");

        mvc.perform(get("/api/notes/index"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[?(@.id == " + a + ")].links_out").value(1))
                .andExpect(jsonPath("$[?(@.id == " + b + ")].links_in").value(1))
                .andExpect(jsonPath("$[?(@.id == " + a + ")].properties.status").value("feito"))
                .andExpect(jsonPath("$[?(@.id == " + b + ")].words").value(4));

        mvc.perform(get("/api/tags"))
                .andExpect(jsonPath("$[0].tag").value("ideia"))
                .andExpect(jsonPath("$[0].count").value(2))
                .andExpect(jsonPath("$[1].tag").value("leitura"));

        mvc.perform(get("/api/graph"))
                .andExpect(jsonPath("$.nodes[?(@.id == " + b + ")].tags[0]").value("ideia"));
    }

    @Test
    void savingFromTheAppKeepsTheAiSummary() throws Exception {
        long id = createNote("Resumida", "texto");
        Note note = notes.findById(id).orElseThrow();
        note.setSummary("Resumo escrito pela IA");
        notes.saveAndFlush(note);

        mvc.perform(put("/api/notes/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Resumida\",\"content\":\"texto novo\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary").value("Resumo escrito pela IA"));
    }

    @Test
    void linkToASectionConnectsToTheNote() throws Exception {
        long target = createNote("Estoicismo", "## Controle\nO que depende de mim.");
        long csharp = createNote("C# na prática", "");
        long source = createNote("Leituras", "Ver [[Estoicismo#Controle|a parte do controle]] e [[C# na prática]].");
        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(source, target)).isTrue();
        assertThat(connections.existsBySourceNoteIdAndTargetNoteId(source, csharp)).isTrue();
    }
}
