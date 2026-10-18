package com.deepthinker.auth;

import org.springframework.http.HttpStatus;

/** Falha de login ou cadastro que vira uma resposta com status próprio (401, 403). */
public class AuthException extends RuntimeException {

    private final HttpStatus status;

    public AuthException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
