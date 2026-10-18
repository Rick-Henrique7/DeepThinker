package com.deepthinker.pilot;

/** Nenhuma aba do Deep thinker aberta (ou nenhuma respondeu): dá para fazer a ação sem a tela, se ela permitir. */
public class NoTabException extends PilotException {

    public NoTabException() {
        super("Nenhuma aba do Deep thinker aberta. Peça para a pessoa abrir o app no navegador.");
    }
}
