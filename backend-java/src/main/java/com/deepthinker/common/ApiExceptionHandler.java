package com.deepthinker.common;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.deepthinker.auth.AuthException;
import com.deepthinker.llm.LlmException;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Transforma exceções em respostas JSON, no mesmo formato que o Laravel usa:
 * { "message": "...", "errors": { "campo": ["..."] } }.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> invalidBody(MethodArgumentNotValidException ex) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(fe ->
                errors.computeIfAbsent(fe.getField(), k -> new ArrayList<>()).add(fe.getDefaultMessage()));
        String first = errors.values().stream().flatMap(List::stream).findFirst().orElse("Dados inválidos.");
        return body(HttpStatus.UNPROCESSABLE_CONTENT, first, errors);
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<Map<String, Object>> invalid(ValidationException ex) {
        return body(HttpStatus.UNPROCESSABLE_CONTENT, ex.getMessage(), ex.getErrors());
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NotFoundException ex) {
        return body(HttpStatus.NOT_FOUND, ex.getMessage(), null);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(ConflictException ex) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("message", ex.getMessage());
        if (ex.getCurrent() != null) {
            json.put("current", ex.getCurrent());
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(json);
    }

    /** Duas gravações ao mesmo tempo no mesmo registro: a segunda perde (ver @Version). */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> raced(ObjectOptimisticLockingFailureException ex) {
        return body(HttpStatus.CONFLICT, "Isto foi alterado ao mesmo tempo em outro lugar. Tente de novo.", null);
    }

    /** A IA falhou (fora do ar, chave errada...): 502 = "o serviço de que dependo falhou". */
    @ExceptionHandler(LlmException.class)
    public ResponseEntity<Map<String, Object>> llmFailed(LlmException ex) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("message", ex.getMessage());
        json.put("error", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(json);
    }

    /** Login errado (401) ou cadastro fechado (403). */
    @ExceptionHandler(AuthException.class)
    public ResponseEntity<Map<String, Object>> auth(AuthException ex) {
        return body(ex.getStatus(), ex.getMessage(), null);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> tooLarge(MaxUploadSizeExceededException ex) {
        return body(HttpStatus.CONTENT_TOO_LARGE, "Arquivo grande demais (máximo 10 MB).",
                Map.of("file", List.of("Arquivo grande demais (máximo 10 MB).")));
    }

    private ResponseEntity<Map<String, Object>> body(HttpStatus status, String message,
                                                     Map<String, List<String>> errors) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("message", message);
        if (errors != null) {
            json.put("errors", errors);
        }
        return ResponseEntity.status(status).body(json);
    }
}
