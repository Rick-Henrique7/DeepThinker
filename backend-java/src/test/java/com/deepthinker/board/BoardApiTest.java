package com.deepthinker.board;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

/** Quadro (Kanban): só notas escolhidas, colunas editáveis e cartões que vivem só no Quadro. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BoardApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    JdbcTemplate jdbc;

    MockMvc mvc;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void login() {
        mvc = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
    }

    private long note(String title, String content) throws Exception {
        String body = mvc.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("title", title, "content", content))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asLong();
    }

    private JsonNode board() throws Exception {
        return json.readTree(mvc.perform(get("/api/board")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private long columnId(String name) throws Exception {
        for (JsonNode c : board().get("columns")) {
            if (c.get("name").asString().equals(name)) {
                return c.get("id").asLong();
            }
        }
        throw new AssertionError("sem coluna " + name);
    }

    @Test
    void onlyNotesWithStatusAppearAndColumnsStartFromThem() throws Exception {
        note("Ideia solta", "Sem status nenhum.");
        long loja = note("Abrir a loja", "---\nstatus: fazendo\n---\nTexto.");
        mvc.perform(get("/api/board"))
                .andExpect(jsonPath("$.columns[*].name", hasItem("fazendo")))
                .andExpect(jsonPath("$.columns[*].name", not(hasItem(""))))
                .andExpect(jsonPath("$.columns[0].cards.length()").value(1))
                .andExpect(jsonPath("$.columns[0].cards[0].id").value(loja));
        assertThat(board().toString()).doesNotContain("Ideia solta");
    }

    @Test
    void emptyBoardStartsWithThreeColumns() throws Exception {
        mvc.perform(get("/api/board"))
                .andExpect(jsonPath("$.columns.length()").value(3))
                .andExpect(jsonPath("$.columns[0].name").value("a fazer"))
                .andExpect(jsonPath("$.columns[2].name").value("feito"));
    }

    @Test
    void addMoveAndRemoveANote() throws Exception {
        long id = note("Contratar barista", "Texto.");
        mvc.perform(put("/api/board/notes/" + id).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(jsonPath("$.column").value("a fazer"));
        mvc.perform(put("/api/board/notes/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"column\":\"Revisão\"}"))
                .andExpect(jsonPath("$.column").value("Revisão"));
        assertThat(board().toString()).contains("Revisão", "Contratar barista");
        mvc.perform(delete("/api/board/notes/" + id)).andExpect(status().isOk());
        assertThat(board().toString()).doesNotContain("Contratar barista");
        // A nota continua existindo, sem status
        mvc.perform(get("/api/notes/" + id)).andExpect(jsonPath("$.properties.status").doesNotExist());
    }

    @Test
    void createRenameMoveAndDeleteColumns() throws Exception {
        long id = note("Escolher o ponto", "---\nstatus: feito\n---\nTexto.");
        mvc.perform(post("/api/board/columns").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ideias\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/board/columns").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"ideias\"}"))
                .andExpect(status().isUnprocessableEntity());

        // Renomear leva os cartões junto
        mvc.perform(patch("/api/board/columns/" + columnId("feito")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Concluído\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/notes/" + id)).andExpect(jsonPath("$.properties.status").value("Concluído"));

        // Mudar de lugar: "Ideias" vira a primeira
        mvc.perform(patch("/api/board/columns/" + columnId("Ideias")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"position\":0}")).andExpect(jsonPath("$.columns[0].name").value("Ideias"));

        // Excluir a coluna tira os cartões do Quadro, mas não apaga a nota
        mvc.perform(delete("/api/board/columns/" + columnId("Concluído")))
                .andExpect(jsonPath("$.cards_removed").value(1));
        mvc.perform(get("/api/notes/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.properties.status").doesNotExist());
        assertThat(board().toString()).doesNotContain("Concluído");
    }

    @Test
    void cardsCreatedOnTheBoardStayOutOfTheGraph() throws Exception {
        String body = mvc.perform(post("/api/board/cards").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Ligar para o fornecedor\",\"content\":\"#urgente\",\"column\":\"fazendo\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.board_only").value(true))
                .andReturn().getResponse().getContentAsString();
        long id = json.readTree(body).get("id").asLong();

        assertThat(board().toString()).contains("Ligar para o fornecedor");
        assertThat(mvc.perform(get("/api/graph")).andReturn().getResponse().getContentAsString()).doesNotContain("Ligar para o fornecedor");
        assertThat(mvc.perform(get("/api/notes")).andReturn().getResponse().getContentAsString()).doesNotContain("Ligar para o fornecedor");
        assertThat(mvc.perform(get("/api/notes/titles")).andReturn().getResponse().getContentAsString()).doesNotContain("Ligar para o fornecedor");
        assertThat(mvc.perform(get("/api/notes/index")).andReturn().getResponse().getContentAsString()).doesNotContain("Ligar para o fornecedor");
        assertThat(mvc.perform(get("/api/tags")).andReturn().getResponse().getContentAsString()).doesNotContain("urgente");
        Integer vectors = jdbc.queryForObject("SELECT COUNT(*) FROM note_embeddings WHERE note_id = ?", Integer.class, id);
        assertThat(vectors).isZero();
        // Mas abre pelo id normalmente (o cartão do Quadro abre a nota)
        mvc.perform(get("/api/notes/" + id)).andExpect(jsonPath("$.title").value("Ligar para o fornecedor"));
    }

    @Test
    void columnsOfOtherPeopleAreInvisible() throws Exception {
        board();
        long id = columnId("a fazer");
        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(delete("/api/board/columns/" + id)).andExpect(status().isNotFound());
        other.perform(patch("/api/board/columns/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\"}"))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ MCP

    private JsonNode tool(String token, String name, Map<String, Object> args) throws Exception {
        MockMvc anonymous = MockMvcBuilders.webAppContextSetup(ctx).apply(springSecurity()).build();
        String body = json.writeValueAsString(Map.of("jsonrpc", "2.0", "id", 1, "method", "tools/call",
                "params", Map.of("name", name, "arguments", args)));
        String res = anonymous.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON).content(body)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("result");
    }

    @Test
    void aiManagesTheBoardThroughMcp() throws Exception {
        String res = mvc.perform(post("/api/mcp/tokens").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Claude\",\"can_write\":true}")).andReturn().getResponse().getContentAsString();
        String token = json.readTree(res).get("token").asString();
        long id = note("Plano", "Texto.");

        assertThat(tool(token, "create_column", Map.of("name", "Revisar")).get("isError").asBoolean()).isFalse();
        assertThat(tool(token, "add_to_board", Map.of("id", id, "column", "Revisar")).get("isError").asBoolean()).isFalse();
        assertThat(tool(token, "create_card", Map.of("title", "Só no Quadro", "column", "Revisar")).get("isError").asBoolean()).isFalse();
        assertThat(tool(token, "get_board", Map.of()).get("content").get(0).get("text").asString())
                .contains("Revisar", "Plano", "Só no Quadro");
        assertThat(tool(token, "rename_column", Map.of("column", "Revisar", "name", "Revisão")).get("isError").asBoolean()).isFalse();
        assertThat(tool(token, "remove_from_board", Map.of("id", id)).get("isError").asBoolean()).isFalse();
        JsonNode del = tool(token, "delete_column", Map.of("column", "Revisão"));
        assertThat(del.get("content").get(0).get("text").asString()).contains("\"cards_removed\":1");
        assertThat(tool(token, "delete_column", Map.of("column", "Não existe")).get("isError").asBoolean()).isTrue();
        // Nenhuma nota apagada
        mvc.perform(get("/api/notes/" + id)).andExpect(status().isOk());
    }
}
