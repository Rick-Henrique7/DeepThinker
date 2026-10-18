package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Histórico de versões: o que fica guardado, o que não fica, e restaurar. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NoteVersionsApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    NoteVersionRepository versions;

    MockMvc mvc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void login() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
    }

    private long createNote(String title, String content) throws Exception {
        String response = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", content))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("id").asLong();
    }

    private void edit(long id, String title, String content) throws Exception {
        mvc.perform(put("/api/notes/" + id).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", content))))
                .andExpect(status().isOk());
    }

    private JsonNode list(long id) throws Exception {
        return json.readTree(mvc.perform(get("/api/notes/" + id + "/versions"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void eachEditKeepsThePreviousStateNewestFirst() throws Exception {
        long id = createNote("Ideia", "primeira versão");
        edit(id, "Ideia", "segunda versão");
        edit(id, "Ideia melhor", "terceira versão");

        JsonNode items = list(id);
        assertThat(items).hasSize(2);
        assertThat(items.get(0).get("title").asString()).isEqualTo("Ideia");
        assertThat(items.get(0).get("reason").asString()).isEqualTo("edicao");
        assertThat(items.get(0).get("size").asInt()).isEqualTo("segunda versão".length());
        assertThat(items.get(0).has("content")).as("a lista não traz o texto inteiro").isFalse();

        long oldest = items.get(1).get("id").asLong();
        mvc.perform(get("/api/notes/" + id + "/versions/" + oldest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("primeira versão"));
    }

    @Test
    void savingWithoutChangesDoesNotCreateAVersion() throws Exception {
        long id = createNote("Sem mudança", "texto");
        edit(id, "Sem mudança", "texto");
        assertThat(list(id)).isEmpty();
    }

    @Test
    void automaticChangesInARowBecomeOneVersion() throws Exception {
        long id = createNote("Tarefa", "Fazer algo.");
        for (String status : new String[] {"a fazer", "fazendo", "feito"}) {
            mvc.perform(patch("/api/notes/" + id + "/properties").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"properties\":{\"status\":\"" + status + "\"}}"))
                    .andExpect(status().isOk());
        }
        JsonNode items = list(id);
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("reason").asString()).isEqualTo("propriedades");

        // Uma edição feita de propósito sempre guarda a versão anterior, mesmo logo depois.
        edit(id, "Tarefa", "Texto novo.");
        assertThat(list(id)).hasSize(2);
    }

    @Test
    void restoreBringsBackTheOldTextAndCanBeUndone() throws Exception {
        long id = createNote("Plano", "plano original");
        edit(id, "Plano B", "plano mudado");
        long original = list(id).get(0).get("id").asLong();

        mvc.perform(post("/api/notes/" + id + "/versions/" + original + "/restore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note.title").value("Plano"))
                .andExpect(jsonPath("$.note.content").value("plano original"))
                .andExpect(jsonPath("$.title_restored").value(true));

        // O estado de antes da restauração virou versão: dá para desfazer.
        JsonNode items = list(id);
        assertThat(items.get(0).get("reason").asString()).isEqualTo("restauracao");
        assertThat(items.get(0).get("title").asString()).isEqualTo("Plano B");
    }

    @Test
    void restoreKeepsTheCurrentTitleWhenTheOldOneIsTaken() throws Exception {
        long id = createNote("Nome antigo", "texto antigo");
        edit(id, "Nome novo", "texto novo");
        createNote("Nome antigo", "outra nota pegou o nome");
        long old = list(id).get(0).get("id").asLong();

        mvc.perform(post("/api/notes/" + id + "/versions/" + old + "/restore"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.note.title").value("Nome novo"))
                .andExpect(jsonPath("$.note.content").value("texto antigo"))
                .andExpect(jsonPath("$.title_restored").value(false));
    }

    @Test
    void keepsOnlyTheNewestHundred() throws Exception {
        long id = createNote("Muitas edições", "v0");
        for (int i = 1; i <= NoteService.MAX_VERSIONS + 5; i++) {
            edit(id, "Muitas edições", "v" + i);
        }
        JsonNode items = list(id);
        assertThat(items).hasSize(NoteService.MAX_VERSIONS);
        // A mais antiga que sobrou é a v5 (v0 a v4 saíram).
        long oldest = items.get(items.size() - 1).get("id").asLong();
        mvc.perform(get("/api/notes/" + id + "/versions/" + oldest)).andExpect(jsonPath("$.content").value("v5"));
    }

    @Test
    void someoneElsesHistoryIs404AndDeletingTheNoteDeletesItsHistory() throws Exception {
        long id = createNote("Particular", "um");
        edit(id, "Particular", "dois");
        long version = list(id).get(0).get("id").asLong();

        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(get("/api/notes/" + id + "/versions")).andExpect(status().isNotFound());
        other.perform(get("/api/notes/" + id + "/versions/" + version)).andExpect(status().isNotFound());
        other.perform(post("/api/notes/" + id + "/versions/" + version + "/restore")).andExpect(status().isNotFound());

        mvc.perform(delete("/api/notes/" + id)).andExpect(status().isOk());
        assertThat(versions.countByNoteId(id)).isZero();
        mvc.perform(get("/api/notes/" + id + "/versions")).andExpect(status().isNotFound());
    }

    @Test
    void linkingAMentionAlsoKeepsAVersion() throws Exception {
        long target = createNote("Medo de falir", "receio");
        long source = createNote("Diário", "Hoje pensei no medo de falir.");
        mvc.perform(post("/api/notes/" + target + "/mentions/" + source + "/link")).andExpect(status().isOk());
        mvc.perform(get("/api/notes/" + source + "/versions"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].reason").value("link"));
    }
}
