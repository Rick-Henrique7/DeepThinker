package com.deepthinker.mcp;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET    /api/mcp/tokens       tokens do usuário (sem o token em si)
 * POST   /api/mcp/tokens       cria um token; a resposta traz o token inteiro, uma única vez
 * DELETE /api/mcp/tokens/{id}  revoga
 *
 * Só com o login normal (JWT): um token pessoal não serve para criar outros tokens.
 */
@RestController
@RequestMapping("/api/mcp/tokens")
public class AccessTokenController {

    private final AccessTokenService tokens;

    public AccessTokenController(AccessTokenService tokens) {
        this.tokens = tokens;
    }

    public record CreateRequest(String name, Boolean canWrite) {
    }

    @GetMapping
    public List<AccessTokenService.TokenInfo> index() {
        return tokens.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccessTokenService.CreatedToken store(@RequestBody CreateRequest req) {
        return tokens.create(req.name(), Boolean.TRUE.equals(req.canWrite()));
    }

    @DeleteMapping("/{id}")
    public Map<String, String> destroy(@PathVariable Long id) {
        tokens.revoke(id);
        return Map.of("message", "Token revogado.");
    }
}
