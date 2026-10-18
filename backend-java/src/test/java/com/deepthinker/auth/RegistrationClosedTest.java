package com.deepthinker.auth;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Com REGISTRATION_ENABLED=false ninguém consegue criar conta nova. */
@SpringBootTest(properties = "deepthinker.auth.registration-enabled=false")
@ActiveProfiles("test")
class RegistrationClosedTest {

    @Autowired
    WebApplicationContext ctx;

    @Test
    void registerIs403() throws Exception {
        MockMvcBuilders.webAppContextSetup(ctx).apply(springSecurity()).build()
                .perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"x@exemplo.com\",\"password\":\"senha-forte-1\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("O cadastro de novas contas está fechado."));
    }
}
