package com.deepthinker.common;

import java.util.List;
import java.util.Map;

/** Erro de regra de negócio ligado a um campo; vira HTTP 422 como no Laravel. */
public class ValidationException extends RuntimeException {

    private final Map<String, List<String>> errors;

    public ValidationException(String message, Map<String, List<String>> errors) {
        super(message);
        this.errors = errors;
    }

    public static ValidationException of(String field, String message) {
        return new ValidationException(message, Map.of(field, List.of(message)));
    }

    public Map<String, List<String>> getErrors() {
        return errors;
    }
}
