package com.deepthinker.support;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.deepthinker.auth.AuthService;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Ajuda dos testes: cria uma conta nova (e-mail aleatório) e devolve um MockMvc
 * que já manda "Authorization: Bearer <token>" em toda requisição.
 */
public final class TestLogin {

    private TestLogin() {
    }

    public static String newUserToken(AuthService auth) {
        String email = "teste-" + UUID.randomUUID() + "@deepthinker.dev";
        return auth.register("Pessoa de Teste", email, "senha-de-teste-123").token();
    }

    public static MockMvc mvcAs(WebApplicationContext ctx, String token) {
        return MockMvcBuilders.webAppContextSetup(ctx)
                .apply(springSecurity())
                .defaultRequest(get("/").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .build();
    }
}
