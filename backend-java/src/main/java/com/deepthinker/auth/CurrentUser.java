package com.deepthinker.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Quem está fazendo a requisição. O Spring Security valida o token JWT antes
 * de chegar no controller e guarda o resultado no SecurityContext; aqui só lemos.
 *
 * O "subject" do token é o id do usuário (ver TokenService).
 * Equivale ao auth()->id() do Laravel.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static Long id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            return Long.valueOf(jwt.getSubject());
        }
        throw new IllegalStateException("Nenhum usuário logado nesta requisição.");
    }
}
