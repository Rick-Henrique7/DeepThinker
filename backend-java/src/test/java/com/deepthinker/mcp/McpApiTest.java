package com.deepthinker.mcp;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Servidor MCP (/mcp) e os tokens pessoais que dão acesso a ele. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class McpApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    MockMvc app;
    MockMvc anonymous;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void login() {
        app = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        anonymous = MockMvcBuilders.webAppContextSetup(ctx).apply(springSecurity()).build();
    }

    private String newToken(boolean canWrite) throws Exception {
        String body = json.writeValueAsString(Map.of("name", "Claude Desktop", "can_write", canWrite));
        String response = app.perform(post("/api/mcp/tokens").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").value(containsString("dt_")))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("token").asString();
    }

    private ResultActions rpc(String token, String method, Object params) throws Exception {
        String body = json.writeValueAsString(Map.of("jsonrpc", "2.0", "id", 1, "method", method, "params", params));
        return anonymous.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON).content(body)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
    }

    /** Chama uma ferramenta e devolve o resultado MCP ({content, isError}). */
    private JsonNode call(String token, String tool, Map<String, Object> args) throws Exception {
        String response = rpc(token, "tools/call", Map.of("name", tool, "arguments", args))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(response).get("result");
    }

    private JsonNode payload(JsonNode result) {
        return json.readTree(result.get("content").get(0).get("text").asString());
    }

    @Test
    void handshakeAndToolList() throws Exception {
        String token = newToken(false);
        rpc(token, "initialize", Map.of("protocolVersion", "2025-06-18", "capabilities", Map.of(),
                "clientInfo", Map.of("name", "teste", "version", "1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result.protocolVersion").value("2025-06-18"))
                .andExpect(jsonPath("$.result.serverInfo.name").value("deep-thinker"));
        rpc(token, "tools/list", Map.of())
                .andExpect(jsonPath("$.result.tools[*].name", hasItem("move_card")))
                .andExpect(jsonPath("$.result.tools[0].inputSchema.type").value("object"));
        // Notificação não tem resposta
        anonymous.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isAccepted());
    }

    @Test
    void createListAndMoveCardWithoutOpenTab() throws Exception {
        String token = newToken(true);
        JsonNode created = call(token, "create_note", Map.of("title", "Abrir a loja", "content", "Plano da loja."));
        long id = payload(created).get("id").asLong();

        JsonNode list = payload(call(token, "list_notes", Map.of("query", "loja")));
        org.assertj.core.api.Assertions.assertThat(list.get("total").asInt()).isEqualTo(1);

        // Sem aba aberta, move_card muda a nota direto
        JsonNode moved = call(token, "move_card", Map.of("id", id, "column", "fazendo"));
        org.assertj.core.api.Assertions.assertThat(moved.get("isError").asBoolean()).isFalse();
        org.assertj.core.api.Assertions.assertThat(payload(moved).get("on_screen").asBoolean()).isFalse();
        app.perform(get("/api/notes/" + id)).andExpect(jsonPath("$.properties.status").value("fazendo"));

        JsonNode board = payload(call(token, "get_board", Map.of()));
        org.assertj.core.api.Assertions.assertThat(board.toString()).contains("\"column\":\"fazendo\"", "Abrir a loja");
    }

    @Test
    void createsCanvasWithCardsAndArrows() throws Exception {
        String token = newToken(true);
        JsonNode created = payload(call(token, "create_canvas",
                Map.of("title", "Plano da cafeteria", "cards", java.util.List.of("Ideia", "Custos", "Clientes"), "connect", true)));
        long id = created.get("id").asLong();
        app.perform(get("/api/canvases/" + id))
                .andExpect(jsonPath("$.data.nodes.length()").value(3))
                .andExpect(jsonPath("$.data.edges.length()").value(2))
                .andExpect(jsonPath("$.data.nodes[1].text").value("Custos"));

        String first = created.get("card_ids").get(0).asString();
        JsonNode added = call(token, "add_canvas_card", Map.of("canvas_id", id, "text", "Fornecedores", "from_card", first));
        org.assertj.core.api.Assertions.assertThat(added.get("isError").asBoolean()).isFalse();
        app.perform(get("/api/canvases/" + id))
                .andExpect(jsonPath("$.data.nodes.length()").value(4))
                .andExpect(jsonPath("$.data.edges.length()").value(3));

        org.assertj.core.api.Assertions.assertThat(payload(call(token, "list_canvases", Map.of())).toString())
                .contains("Plano da cafeteria");
        JsonNode bad = call(token, "add_canvas_card", Map.of("canvas_id", id, "text", "x", "from_card", "nao-existe"));
        org.assertj.core.api.Assertions.assertThat(bad.get("isError").asBoolean()).isTrue();
    }

    @Test
    void readOnlyTokenCannotWrite() throws Exception {
        String token = newToken(false);
        JsonNode r = call(token, "create_note", Map.of("title", "X", "content", "Y"));
        org.assertj.core.api.Assertions.assertThat(r.get("isError").asBoolean()).isTrue();
        org.assertj.core.api.Assertions.assertThat(r.get("content").get(0).get("text").asString()).contains("só de leitura");
    }

    @Test
    void screenToolsNeedAnOpenTab() throws Exception {
        String token = newToken(false);
        JsonNode r = call(token, "navigate", Map.of("screen", "quadro"));
        org.assertj.core.api.Assertions.assertThat(r.get("isError").asBoolean()).isTrue();
        org.assertj.core.api.Assertions.assertThat(r.get("content").get(0).get("text").asString()).contains("Nenhuma aba");
    }

    @Test
    void personalTokenOnlyWorksOnMcp() throws Exception {
        String token = newToken(true);
        anonymous.perform(get("/api/notes").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
        // E também não cria outros tokens
        anonymous.perform(get("/api/mcp/tokens").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedOrWrongTokenIsRejected() throws Exception {
        String token = newToken(true);
        rpc(token + "x", "ping", Map.of()).andExpect(status().isUnauthorized());
        String list = app.perform(get("/api/mcp/tokens")).andReturn().getResponse().getContentAsString();
        long id = json.readTree(list).get(0).get("id").asLong();
        app.perform(delete("/api/mcp/tokens/" + id)).andExpect(status().isOk());
        rpc(token, "ping", Map.of()).andExpect(status().isUnauthorized());
    }

    @Test
    void otherWebsitesAreBlocked() throws Exception {
        String token = newToken(false);
        anonymous.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .header(HttpHeaders.ORIGIN, "https://site-malicioso.example"))
                .andExpect(status().isForbidden());
    }

    @Test
    void tokensOfOtherPeopleAreInvisible() throws Exception {
        newToken(true);
        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(get("/api/mcp/tokens")).andExpect(jsonPath("$.length()").value(0));
    }
}
