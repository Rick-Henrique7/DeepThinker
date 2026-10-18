package com.deepthinker.canvas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
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

/** Canvas: guardar no formato JSON Canvas, limpar o que é perigoso e não perder trabalho em conflito. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CanvasApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    MockMvc mvc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void login() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
    }

    private JsonNode create(String body) throws Exception {
        var req = post("/api/canvases").contentType(MediaType.APPLICATION_JSON);
        if (body != null) {
            req = req.content(body);
        }
        return json.readTree(mvc.perform(req).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void newCanvasStartsEmpty() throws Exception {
        JsonNode c = create(null);
        assertThat(c.get("title").asString()).isEqualTo("Canvas sem título");
        assertThat(c.get("data").get("nodes")).isEmpty();
        assertThat(c.get("data").get("edges")).isEmpty();
        assertThat(c.get("revision").asLong()).isZero();
        assertThat(c.has("updated_at")).isTrue();
    }

    @Test
    void savingCleansTheDrawingAndBumpsTheRevision() throws Exception {
        long id = create("{\"title\":\"Loja\"}").get("id").asLong();
        String data = """
                {"nodes":[
                  {"id":"t1","type":"text","x":10.6,"y":-20,"width":250,"height":60,"text":"Ideia","color":"4","segredo":"x"},
                  {"id":"n1","type":"file","x":400,"y":0,"width":300,"height":200,"file":"Abrir uma loja.md"},
                  {"id":"l1","type":"link","x":0,"y":300,"width":300,"height":80,"url":"https://exemplo.com"},
                  {"id":"l2","type":"link","x":0,"y":400,"width":300,"height":80,"url":"javascript:alert(1)"},
                  {"id":"g1","type":"group","x":-50,"y":-50,"width":900,"height":500,"label":"Plano","color":"9"},
                  {"id":"x1","type":"video","x":0,"y":0,"width":10,"height":10}
                ],"edges":[
                  {"id":"e1","fromNode":"t1","fromSide":"right","toNode":"n1","toSide":"left","toEnd":"arrow","label":"leva a"},
                  {"id":"e2","fromNode":"t1","toNode":"l2"},
                  {"id":"e3","fromNode":"t1","toNode":"n1","fromSide":"meio"}
                ]}""";
        String body = "{\"title\":\"Loja nova\",\"revision\":0,\"data\":" + data + "}";
        JsonNode saved = json.readTree(mvc.perform(put("/api/canvases/" + id).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());

        assertThat(saved.get("title").asString()).isEqualTo("Loja nova");
        assertThat(saved.get("revision").asLong()).isEqualTo(1);
        JsonNode nodes = saved.get("data").get("nodes");
        // l2 (javascript:) e x1 (tipo que não existe) saíram.
        assertThat(nodes).extracting(n -> n.get("id").asString()).containsExactly("t1", "n1", "l1", "g1");
        JsonNode t1 = nodes.get(0);
        assertThat(t1.get("x").asLong()).isEqualTo(11);
        assertThat(t1.get("color").asString()).isEqualTo("4");
        assertThat(t1.has("segredo")).as("campo desconhecido é jogado fora").isFalse();
        assertThat(nodes.get(3).has("color")).as("cor fora das 6 é jogada fora").isFalse();

        JsonNode edges = saved.get("data").get("edges");
        // e2 apontava para o link removido; e3 fica, mas sem o lado inválido.
        assertThat(edges).extracting(e -> e.get("id").asString()).containsExactly("e1", "e3");
        assertThat(edges.get(0).get("label").asString()).isEqualTo("leva a");
        assertThat(edges.get(1).has("fromSide")).isFalse();

        mvc.perform(get("/api/canvases"))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].cards").value(4));
    }

    @Test
    void savingOverAnOlderRevisionIsAConflictAndShowsTheNewest() throws Exception {
        long id = create(null).get("id").asLong();
        String first = "{\"revision\":0,\"data\":{\"nodes\":[{\"id\":\"a\",\"type\":\"text\",\"x\":0,\"y\":0,\"width\":100,\"height\":50,\"text\":\"aba 1\"}],\"edges\":[]}}";
        mvc.perform(put("/api/canvases/" + id).contentType(MediaType.APPLICATION_JSON).content(first)).andExpect(status().isOk());

        // A outra aba ainda acha que está na revision 0.
        String stale = "{\"revision\":0,\"data\":{\"nodes\":[],\"edges\":[]}}";
        mvc.perform(put("/api/canvases/" + id).contentType(MediaType.APPLICATION_JSON).content(stale))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.current.revision").value(1))
                .andExpect(jsonPath("$.current.data.nodes[0].text").value("aba 1"));

        mvc.perform(put("/api/canvases/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"sem revision\"}"))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void brokenDrawingsAreRejected() throws Exception {
        mvc.perform(post("/api/canvases").contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"oi\"}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(post("/api/canvases").contentType(MediaType.APPLICATION_JSON).content("{\"data\":{\"nodes\":{}}}"))
                .andExpect(status().isUnprocessableContent());
        String twice = "{\"data\":{\"nodes\":[{\"id\":\"a\",\"type\":\"text\"},{\"id\":\"a\",\"type\":\"text\"}]}}";
        mvc.perform(post("/api/canvases").contentType(MediaType.APPLICATION_JSON).content(twice))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void someoneElsesCanvasIs404AndDeleteRemovesIt() throws Exception {
        long id = create("{\"title\":\"Meu\"}").get("id").asLong();
        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(get("/api/canvases/" + id)).andExpect(status().isNotFound());
        other.perform(put("/api/canvases/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"revision\":0}"))
                .andExpect(status().isNotFound());
        other.perform(delete("/api/canvases/" + id)).andExpect(status().isNotFound());
        other.perform(get("/api/canvases")).andExpect(jsonPath("$").isEmpty());

        mvc.perform(delete("/api/canvases/" + id)).andExpect(status().isOk());
        mvc.perform(get("/api/canvases/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void renamingANoteUpdatesItsCardsInEveryCanvas() throws Exception {
        long note = json.readTree(mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Ação inicial\",\"content\":\"x\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
        String data = "{\"nodes\":[{\"id\":\"a\",\"type\":\"file\",\"file\":\"Pasta/acao inicial.md\"},"
                + "{\"id\":\"b\",\"type\":\"file\",\"file\":\"Outra.md\"}],\"edges\":[]}";
        long id = create("{\"data\":" + data + "}").get("id").asLong();

        mvc.perform(put("/api/notes/" + note).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Primeiro passo\",\"content\":\"x\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/canvases/" + id))
                .andExpect(jsonPath("$.data.nodes[0].file").value("Pasta/Primeiro passo.md"))
                .andExpect(jsonPath("$.data.nodes[1].file").value("Outra.md"))
                .andExpect(jsonPath("$.revision").value(1));
    }
}
