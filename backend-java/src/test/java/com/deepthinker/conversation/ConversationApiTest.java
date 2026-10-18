package com.deepthinker.conversation;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ConversationApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    /** MockMvc já logado com uma conta nova a cada teste (ver TestLogin). */
    MockMvc mvc;

    String token;

    @Autowired
    ConversationMessageRepository messages;

    @BeforeEach
    void clean() {
        token = TestLogin.newUserToken(auth);
        mvc = TestLogin.mvcAs(ctx, token);
        messages.deleteAll();
    }

    private void save(String role, String content, String session) throws Exception {
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"" + role + "\",\"content\":\"" + content + "\",\"session_id\":\"" + session + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.session_id").value(session));
    }

    @Test
    void savesAndReloadsASessionInOrder() throws Exception {
        save("user", "primeira", "sessao-a");
        save("assistant", "resposta", "sessao-a");
        save("user", "de outra sessao", "sessao-b");

        mvc.perform(get("/api/conversations").param("session_id", "sessao-a"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].content").value("primeira"))
                .andExpect(jsonPath("$[1].role").value("assistant"));
    }

    @Test
    void clearRemovesOnlyThatSession() throws Exception {
        save("user", "a", "sessao-a");
        save("user", "b", "sessao-b");

        mvc.perform(post("/api/conversations/clear").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"session_id\":\"sessao-a\"}"))
                .andExpect(jsonPath("$.deleted").value(1));
        mvc.perform(get("/api/conversations")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void rejectsInvalidRoleAndUnknownNote() throws Exception {
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"hacker\",\"content\":\"x\"}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"user\",\"content\":\"x\",\"note_id\":999999}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors.note_id").exists());
    }

    @Test
    void showAndDelete() throws Exception {
        save("user", "apagar", "s");
        long id = messages.findAll().getFirst().getId();

        mvc.perform(get("/api/conversations/" + id)).andExpect(jsonPath("$.content").value("apagar"));
        mvc.perform(delete("/api/conversations/" + id)).andExpect(status().isOk());
        mvc.perform(get("/api/conversations/" + id)).andExpect(status().isNotFound());
    }
}
