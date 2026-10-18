package com.deepthinker.auth;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Perfil desktop: o app entra sozinho com POST /api/auth/local, desde que mande a chave certa.
 * "test" vem depois de "desktop" para o banco em memória dos testes valer.
 */
@SpringBootTest(properties = {
        "DEEPTHINKER_SECRET=segredo-de-teste",
        "DEEPTHINKER_DESKTOP_KEY=chave-do-app",
        "PORT=0"})
@ActiveProfiles({"desktop", "test"})
class DesktopAuthTest {

    @Autowired
    WebApplicationContext ctx;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(ctx).apply(springSecurity()).build();
    }

    @Test
    void rightKeyLogsInTheSameLocalAccountEveryTime() throws Exception {
        String first = mvc.perform(post("/api/auth/local").header("X-Desktop-Key", "chave-do-app"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(AuthService.LOCAL_EMAIL))
                .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/auth/local").header("X-Desktop-Key", "chave-do-app"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        Integer id1 = JsonPath.read(first, "$.user.id");
        Integer id2 = JsonPath.read(second, "$.user.id");
        org.junit.jupiter.api.Assertions.assertEquals(id1, id2);

        String token = JsonPath.read(second, "$.token");
        mvc.perform(get("/api/notes").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void wrongOrMissingKeyIs401() throws Exception {
        mvc.perform(post("/api/auth/local").header("X-Desktop-Key", "chute"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/local"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void registrationIsClosedOnDesktop() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"x@exemplo.com\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isForbidden());
    }
}
