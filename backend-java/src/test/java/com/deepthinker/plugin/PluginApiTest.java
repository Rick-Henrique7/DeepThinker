package com.deepthinker.plugin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.deepthinker.auth.AuthService;
import com.deepthinker.support.TestLogin;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/** Plugins da comunidade: o servidor só confere o manifesto e guarda; cada pessoa vê os seus. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PluginApiTest {

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

    private Map<String, Object> manifest() {
        Map<String, Object> m = new HashMap<>();
        m.put("id", "contador-de-palavras");
        m.put("name", "Contador de palavras");
        m.put("version", "1.0.0");
        m.put("description", "Conta as palavras da nota aberta.");
        m.put("permissions", List.of("note:read", "commands"));
        m.put("code", "deepthinker.registerCommand('contar', 'Contar palavras', async () => {});");
        return m;
    }

    private ResultActions install(MockMvc as, Map<String, Object> m) throws Exception {
        return as.perform(post("/api/plugins").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(m)));
    }

    @Test
    void installListToggleAndUninstall() throws Exception {
        String body = install(mvc, manifest())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.key").value("contador-de-palavras"))
                .andExpect(jsonPath("$.permissions[0]").value("note:read"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andReturn().getResponse().getContentAsString();
        long id = json.readTree(body).get("id").asLong();

        mvc.perform(get("/api/plugins"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value(org.hamcrest.Matchers.containsString("registerCommand")));

        mvc.perform(patch("/api/plugins/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(jsonPath("$.enabled").value(false));

        mvc.perform(delete("/api/plugins/" + id)).andExpect(status().isOk());
        mvc.perform(get("/api/plugins")).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void reinstallingTheSameIdUpdates() throws Exception {
        install(mvc, manifest()).andExpect(status().isCreated());
        Map<String, Object> v2 = manifest();
        v2.put("version", "2.0.0");
        v2.put("permissions", List.of("note:read", "note:write", "commands"));
        install(mvc, v2).andExpect(jsonPath("$.version").value("2.0.0"));
        mvc.perform(get("/api/plugins"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].permissions.length()").value(3));
    }

    @Test
    void unknownPermissionIsRefused() throws Exception {
        Map<String, Object> m = manifest();
        m.put("permissions", List.of("note:read", "network"));
        install(mvc, m).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void badIdEmptyCodeAndHugeCodeAreRefused() throws Exception {
        Map<String, Object> badId = manifest();
        badId.put("id", "Meu Plugin!");
        install(mvc, badId).andExpect(status().isUnprocessableEntity());

        Map<String, Object> empty = manifest();
        empty.put("code", "  ");
        install(mvc, empty).andExpect(status().isUnprocessableEntity());

        Map<String, Object> huge = manifest();
        huge.put("code", "x".repeat(200_001));
        install(mvc, huge).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void eachPersonSeesOnlyTheirPlugins() throws Exception {
        String body = install(mvc, manifest()).andReturn().getResponse().getContentAsString();
        long id = json.readTree(body).get("id").asLong();
        MockMvc other = TestLogin.mvcAs(ctx, TestLogin.newUserToken(auth));
        other.perform(get("/api/plugins")).andExpect(jsonPath("$.length()").value(0));
        other.perform(delete("/api/plugins/" + id)).andExpect(status().isNotFound());
        other.perform(patch("/api/plugins/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isNotFound());
    }
}
