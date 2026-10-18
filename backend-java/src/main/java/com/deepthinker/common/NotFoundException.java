package com.deepthinker.common;

/** Lançada quando um recurso pedido não existe; vira HTTP 404. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
