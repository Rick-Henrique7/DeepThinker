package com.deepthinker.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.support.TestLogin;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/** Cadastro, login, rotas protegidas e separação dos dados entre usuários. */
@SpringBootTest
@ActiveProfiles("test")
class AuthApiTest {

    @Autowired
    WebApplicationContext ctx;

    @Autowired
    AuthService auth;

    @Autowired
    JdbcTemplate jdbc;

    /** Sem token nenhum: como um visitante anônimo. */
    MockMvc anonymous;

    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        anonymous = MockMvcBuilders.webAppContextSetup(ctx).apply(springSecurity()).build();
    }

    private String register(String email, String password) throws Exception {
        String res = anonymous.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rick\",\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("token").asString();
    }

    @Test
    void registerReturnsTokenAndUser() throws Exception {
        anonymous.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rick\",\"email\":\"  Rick.Cadastro@Exemplo.com \",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.user.email").value("rick.cadastro@exemplo.com"))
                .andExpect(jsonPath("$.user.password_hash").doesNotExist());

        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE email = ?", String.class,
                "rick.cadastro@exemplo.com");
        assertThat(hash).startsWith("$2").doesNotContain("senha-forte-1");
    }

    @Test
    void duplicateEmailAndWeakPasswordAre422() throws Exception {
        register("dup@exemplo.com", "senha-forte-1");
        anonymous.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Outro\",\"email\":\"DUP@exemplo.com\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors.email[0]").value("Este e-mail já tem uma conta."));
        anonymous.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"curta@exemplo.com\",\"password\":\"123\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.errors.password").exists());
    }

    @Test
    void loginWorksAndWrongPasswordIs401() throws Exception {
        register("login@exemplo.com", "senha-forte-1");

        anonymous.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"LOGIN@exemplo.com\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("login@exemplo.com"));

        anonymous.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"login@exemplo.com\",\"password\":\"errada-123\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("E-mail ou senha incorretos."));
        anonymous.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ninguem@exemplo.com\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("E-mail ou senha incorretos."));
    }

    @Test
    void protectedRoutesNeedAValidToken() throws Exception {
        anonymous.perform(get("/api/notes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Faça login para continuar."));
        anonymous.perform(get("/api/notes").header("Authorization", "Bearer token.falso.qualquer"))
                .andExpect(status().isUnauthorized());

        String token = register("me@exemplo.com", "senha-forte-1");
        TestLogin.mvcAs(ctx, token).perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("me@exemplo.com"));
    }

    @Test
    void eachUserSeesOnlyTheirOwnData() throws Exception {
        MockMvc ana = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        MockMvc bia = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));

        String res = ana.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Ideias\",\"content\":\"segredo da Ana\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long anaNote = json.readTree(res).get("id").asLong();
        ana.perform(post("/api/conversations").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"user\",\"content\":\"oi\",\"session_id\":\"s1\"}"))
                .andExpect(status().isCreated());

        bia.perform(get("/api/notes")).andExpect(jsonPath("$", hasSize(0)));
        bia.perform(get("/api/graph")).andExpect(jsonPath("$.nodes", hasSize(0)));
        bia.perform(get("/api/notes/" + anaNote)).andExpect(status().isNotFound());
        bia.perform(put("/api/notes/" + anaNote).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Roubada\"}")).andExpect(status().isNotFound());
        bia.perform(get("/api/conversations?session_id=s1")).andExpect(jsonPath("$", hasSize(0)));

        // O mesmo título pode existir para pessoas diferentes.
        bia.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Ideias\"}")).andExpect(status().isCreated());
        ana.perform(get("/api/notes")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void aiKeysArePerUser() throws Exception {
        MockMvc ana = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        MockMvc bia = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));

        ana.perform(put("/api/settings/llm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"groq\",\"api_key\":\"gsk_chave_da_ana_123456\"}"))
                .andExpect(status().isOk());

        ana.perform(get("/api/settings/llm"))
                .andExpect(jsonPath("$.active_provider").value("groq"))
                .andExpect(jsonPath("$.providers.groq.has_api_key").value(true));
        bia.perform(get("/api/settings/llm"))
                .andExpect(jsonPath("$.active_provider").value("openai"))
                .andExpect(jsonPath("$.providers.groq.has_api_key").value(false));
    }

    @Test
    void firstAccountAdoptsDataCreatedBeforeLogin() throws Exception {
        jdbc.update("DELETE FROM users"); // CASCADE apaga os dados de testes anteriores
        jdbc.update("DELETE FROM notes WHERE user_id IS NULL");
        jdbc.update("INSERT INTO notes (title, content, created_at, updated_at) "
                + "VALUES ('Nota antiga', 'de antes do login', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");

        MockMvc first = TestLogin.mvcAs(ctx, register("primeira@exemplo.com", "senha-forte-1"));
        first.perform(get("/api/notes"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].title").value("Nota antiga"));

        MockMvc second = TestLogin.mvcAs(ctx, register("segunda@exemplo.com", "senha-forte-1"));
        second.perform(get("/api/notes")).andExpect(jsonPath("$", hasSize(0)));
    }
}
