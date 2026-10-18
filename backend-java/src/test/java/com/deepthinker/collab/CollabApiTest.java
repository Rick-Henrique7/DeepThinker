package com.deepthinker.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import java.net.URI;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import tools.jackson.databind.json.JsonMapper;

/** Edição em conjunto: convites, quem pode ler/salvar e a sala ao vivo pelo WebSocket. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class CollabApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    JdbcTemplate jdbc;

    @LocalServerPort
    int port;

    private final JsonMapper json = JsonMapper.builder().build();

    String ownerToken;
    String guestToken;
    String guestEmail;
    MockMvc owner;
    MockMvc guest;
    MockMvc stranger;
    long noteId;

    @BeforeEach
    void setUp() throws Exception {
        ownerToken = TestLogin.newUserToken(auth);
        guestEmail = "convidada-" + UUID.randomUUID() + "@deepthinker.dev";
        guestToken = auth.register("Ana Convidada", guestEmail, "senha-de-teste-123").token();
        owner = TestLogin.mvcAs(ctx, ownerToken);
        guest = TestLogin.mvcAs(ctx, guestToken);
        stranger = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        String body = owner.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Plano da loja\",\"content\":\"Primeira ideia.\"}"))
                .andReturn().getResponse().getContentAsString();
        noteId = json.readTree(body).get("id").asLong();
    }

    private long invite() throws Exception {
        String body = owner.perform(post("/api/collab/notes/" + noteId + "/shares").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", guestEmail.toUpperCase()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Ana Convidada"))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("id").asLong();
    }

    @Test
    void invitedPersonReadsAndSavesWithHistory() throws Exception {
        guest.perform(get("/api/collab/notes/" + noteId)).andExpect(status().isNotFound());
        invite();
        guest.perform(get("/api/collab/shared-with-me"))
                .andExpect(jsonPath("$[0].title").value("Plano da loja"));
        guest.perform(get("/api/collab/notes/" + noteId))
                .andExpect(jsonPath("$.content").value("Primeira ideia."))
                .andExpect(jsonPath("$.is_owner").value(false));
        guest.perform(put("/api/collab/notes/" + noteId + "/content").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"Primeira ideia. E a da Ana.\"}"))
                .andExpect(status().isOk());
        // A nota continua do dono, com o texto novo e a versão anterior no histórico
        owner.perform(get("/api/notes/" + noteId)).andExpect(jsonPath("$.content").value("Primeira ideia. E a da Ana."));
        Integer versions = jdbc.queryForObject(
                "SELECT COUNT(*) FROM note_versions WHERE note_id = ? AND reason = 'colaboracao'", Integer.class, noteId);
        assertThat(versions).isEqualTo(1);
        // A convidada não vê a nota pelo caminho normal (lá só aparecem as notas dela)
        guest.perform(get("/api/notes/" + noteId)).andExpect(status().isNotFound());
    }

    @Test
    void onlyTheOwnerManagesInvites() throws Exception {
        long shareId = invite();
        guest.perform(get("/api/collab/notes/" + noteId + "/shares")).andExpect(status().isNotFound());
        stranger.perform(post("/api/collab/notes/" + noteId + "/shares").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"x@y.z\"}")).andExpect(status().isNotFound());
        stranger.perform(put("/api/collab/notes/" + noteId + "/content").contentType(MediaType.APPLICATION_JSON)
                .content("{\"content\":\"invasão\"}")).andExpect(status().isNotFound());

        owner.perform(post("/api/collab/notes/" + noteId + "/shares").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", guestEmail)))).andExpect(status().isUnprocessableEntity());
        owner.perform(post("/api/collab/notes/" + noteId + "/shares").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"ninguem@nada.dev\"}")).andExpect(status().isUnprocessableEntity());

        owner.perform(delete("/api/collab/notes/" + noteId + "/shares/" + shareId)).andExpect(status().isOk());
        guest.perform(get("/api/collab/notes/" + noteId)).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------ WebSocket

    private static final class Client extends AbstractWebSocketHandler {
        final BlockingQueue<Object> inbox = new LinkedBlockingQueue<>();

        @Override
        protected void handleTextMessage(WebSocketSession s, TextMessage m) {
            inbox.add(m.getPayload());
        }

        @Override
        protected void handleBinaryMessage(WebSocketSession s, BinaryMessage m) {
            ByteBuffer b = m.getPayload();
            byte[] data = new byte[b.remaining()];
            b.get(data);
            inbox.add(data);
        }

        Object next() throws InterruptedException {
            Object o = inbox.poll(5, TimeUnit.SECONDS);
            assertThat(o).as("mensagem do servidor").isNotNull();
            return o;
        }
    }

    private WebSocketSession connect(String token, Client client) throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:5173");
        return new StandardWebSocketClient()
                .execute(client, headers, URI.create("ws://localhost:" + port + "/ws/collab/" + noteId + "?token=" + token))
                .get(5, TimeUnit.SECONDS);
    }

    @Test
    void liveRoomSeedsOnceRelaysAndRemembers() throws Exception {
        invite();
        Client a = new Client();
        WebSocketSession sa = connect(ownerToken, a);
        assertThat((String) a.next()).contains("\"seed\":true");

        sa.sendMessage(new BinaryMessage(new byte[] {CollabHub.UPDATE, 1, 2, 3}));

        Client b = new Client();
        WebSocketSession sb = connect(guestToken, b);
        assertThat((String) b.next()).contains("\"seed\":false");
        // Quem chega depois recebe o que já foi escrito
        assertThat((byte[]) b.next()).containsExactly(CollabHub.UPDATE, 1, 2, 3);
        assertThat((String) a.next()).contains("hello");

        // Edição da convidada chega na dona; presença também
        sb.sendMessage(new BinaryMessage(new byte[] {CollabHub.UPDATE, 9}));
        assertThat((byte[]) a.next()).containsExactly(CollabHub.UPDATE, 9);
        sb.sendMessage(new BinaryMessage(new byte[] {CollabHub.AWARENESS, 7}));
        assertThat((byte[]) a.next()).containsExactly(CollabHub.AWARENESS, 7);

        // Saiu: a outra pessoa fica sabendo para apagar o cursor
        sb.sendMessage(new TextMessage("{\"type\":\"identify\",\"client\":4242}"));
        Thread.sleep(200);
        sb.close();
        assertThat((String) a.next()).contains("\"client\":4242");
        sa.close();
    }

    @Test
    void strangersAndBadTokensCannotConnect() {
        assertThatThrownBy(() -> connect(TestLogin.newUserToken(auth), new Client())).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> connect("token-falso", new Client())).isInstanceOf(Exception.class);
    }
}
