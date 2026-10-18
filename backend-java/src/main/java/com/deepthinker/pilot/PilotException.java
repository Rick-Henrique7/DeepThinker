package com.deepthinker.pilot;

/** Não deu para fazer a ação na tela (sem aba aberta, aba não respondeu, pessoa pausou). */
public class PilotException extends RuntimeException {

    public PilotException(String message) {
        super(message);
    }
}
