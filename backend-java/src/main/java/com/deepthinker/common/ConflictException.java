package com.deepthinker.common;

/**
 * 409 Conflict: o que você quer gravar foi feito em cima de uma versão que já mudou
 * (por exemplo, o mesmo canvas aberto em duas abas). "current" vai junto na resposta para
 * a tela poder mostrar a versão mais nova e deixar você escolher.
 */
public class ConflictException extends RuntimeException {

    private final transient Object current;

    public ConflictException(String message, Object current) {
        super(message);
        this.current = current;
    }

    public Object getCurrent() {
        return current;
    }
}
