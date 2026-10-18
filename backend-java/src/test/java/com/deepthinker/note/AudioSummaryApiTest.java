package com.deepthinker.note;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.chat.FakeLlmServer;
import com.deepthinker.support.TestLogin;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/** "Resumo em áudio": a IA escreve o roteiro e o Java confere e limpa cada fala. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AudioSummaryApiTest {

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
    JdbcTemplate jdbc;

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

    private ResultActions audio(String body) throws Exception {
        return mvc.perform(post("/api/notes/audio-summary").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void conversationAlternatesHostsAndCleansWhatWouldSoundOdd() throws Exception {
        createNote("Abrir uma loja", "---\ntags: [negocio]\n---\nQuero abrir uma loja.");
        createNote("Medo de falir", "Tenho receio de perder tudo.");

        audio("{\"days\":7,\"style\":\"conversa\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Semana de ideias"))
                .andExpect(jsonPath("$.style").value("conversa"))
                .andExpect(jsonPath("$.days").value(7))
                .andExpect(jsonPath("$.notes", hasSize(2)))
                // a fala vazia some; "bruno:" vira Bruno; a fala sem nome alterna e volta para Ana
                .andExpect(jsonPath("$.lines", hasSize(3)))
                .andExpect(jsonPath("$.lines[0].speaker").value("Ana"))
                .andExpect(jsonPath("$.lines[0].text").value("Esta semana voce pensou em lojas."))
                .andExpect(jsonPath("$.lines[1].speaker").value("Bruno"))
                .andExpect(jsonPath("$.lines[1].text").value("Mas sera que o medo faz sentido?"))
                .andExpect(jsonPath("$.lines[2].speaker").value("Ana"));
    }

    @Test
    void narratorIsTheDefaultStyle() throws Exception {
        createNote("Ideia solta", "Um pensamento.");

        audio("{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.style").value("resumo"))
                .andExpect(jsonPath("$.days").value(7))
                .andExpect(jsonPath("$.lines[*].speaker", everyItem(is("Narrador"))));
    }

    @Test
    void onlyNotesTouchedInThePeriodCount() throws Exception {
        long old = createNote("Nota antiga", "Escrita faz tempo.");
        Timestamp monthAgo = Timestamp.from(Instant.now().minus(30, ChronoUnit.DAYS));
        jdbc.update("update notes set created_at = ?, updated_at = ? where id = ?", monthAgo, monthAgo, old);

        audio("{\"days\":7}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("últimos 7 dias")));

        audio("{\"days\":60}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes", hasSize(1)))
                .andExpect(jsonPath("$.notes[0].title").value("Nota antiga"));
    }

    @Test
    void plainTextAnswerStillBecomesAScript() throws Exception {
        createNote("Teste sem JSON", "SEM_ROTEIRO");

        audio("{\"days\":7,\"style\":\"conversa\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Suas notas dos últimos 7 dias"))
                .andExpect(jsonPath("$.lines", hasSize(2)))
                .andExpect(jsonPath("$.lines[*].speaker", everyItem(is("Narrador"))))
                .andExpect(jsonPath("$.lines[1].text", containsString("pergunta para o caminho")));
    }

    @Test
    void tooShortAnswerAndBadInputAre422() throws Exception {
        createNote("Teste vazio", "ROTEIRO_VAZIO");
        audio("{}").andExpect(status().isUnprocessableEntity());

        audio("{\"days\":0}").andExpect(status().isUnprocessableEntity());
        audio("{\"days\":91}").andExpect(status().isUnprocessableEntity());
        audio("{\"style\":\"musica\"}").andExpect(status().isUnprocessableEntity());
    }
}
