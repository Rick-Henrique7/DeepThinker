package com.deepthinker.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/auth/register  { name, email, password }  -> { token, user }
 * POST /api/auth/login     { email, password }        -> { token, user }
 * GET  /api/auth/me                                    -> { id, name, email }
 *
 * O frontend guarda o token e manda em toda requisição: "Authorization: Bearer <token>".
 * Sair (logout) é só o frontend apagar o token.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record RegisterRequest(
            @NotBlank(message = "Informe seu nome.") @Size(max = 100, message = "Nome muito longo.") String name,
            @NotBlank(message = "Informe o e-mail.") @Email(message = "E-mail inválido.") String email,
            // O BCrypt só considera os primeiros 72 bytes da senha.
            @NotBlank(message = "Informe a senha.")
            @Size(min = 8, max = 72, message = "A senha precisa ter entre 8 e 72 caracteres.") String password) {

        // Construtor compacto do record: roda antes da validação. Tira espaços colados sem querer.
        public RegisterRequest {
            email = email == null ? null : email.trim();
        }
    }

    public record LoginRequest(
            @NotBlank(message = "Informe o e-mail.") String email,
            @NotBlank(message = "Informe a senha.") String password) {
    }

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Session register(@Valid @RequestBody RegisterRequest req) {
        return auth.register(req.name(), req.email(), req.password());
    }

    @PostMapping("/login")
    public AuthService.Session login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req.email(), req.password());
    }

    @GetMapping("/me")
    public AuthService.UserView me() {
        return auth.me();
    }
}
