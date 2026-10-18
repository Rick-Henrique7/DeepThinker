package com.deepthinker.mcp;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tokens de acesso pessoal para IAs de fora (servidor MCP).
 *
 * Diferente do login (JWT que vence em 7 dias), o token pessoal não vence: vale até a
 * pessoa revogar. Por isso só é aceito na rota /mcp (ver SecurityConfig), e quem o usa
 * só faz o que as ferramentas do MCP deixam.
 */
@Service
public class AccessTokenService {

    /** Todo token começa assim: dá para reconhecer um token do Deep thinker vazado num log. */
    public static final String PREFIX = "dt_";
    /** Claim que diz se o token pode criar e alterar notas. */
    public static final String WRITE_CLAIM = "pat_write";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_TOKENS = 20;

    private final AccessTokenRepository repo;

    public AccessTokenService(AccessTokenRepository repo) {
        this.repo = repo;
    }

    public record TokenInfo(Long id, String name, String prefix, boolean canWrite, Instant createdAt, Instant lastUsedAt) {
        static TokenInfo of(AccessToken t) {
            return new TokenInfo(t.getId(), t.getName(), t.getPrefix(), t.isCanWrite(), t.getCreatedAt(), t.getLastUsedAt());
        }
    }

    /** O token inteiro só existe nesta resposta: depois disso guardamos apenas o hash. */
    public record CreatedToken(TokenInfo info, String token) {
    }

    @Transactional(readOnly = true)
    public List<TokenInfo> list() {
        return repo.findByUserIdOrderByIdDesc(CurrentUser.id()).stream().map(TokenInfo::of).toList();
    }

    @Transactional
    public CreatedToken create(String name, boolean canWrite) {
        Long userId = CurrentUser.id();
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty()) {
            throw ValidationException.of("name", "Dê um nome ao token (ex.: \"Claude Desktop\").");
        }
        if (clean.length() > 80) {
            throw ValidationException.of("name", "O nome pode ter no máximo 80 caracteres.");
        }
        if (repo.findByUserIdOrderByIdDesc(userId).size() >= MAX_TOKENS) {
            throw ValidationException.of("name", "Limite de " + MAX_TOKENS + " tokens. Revogue um que não usa mais.");
        }
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        AccessToken saved = repo.save(new AccessToken(userId, clean, hash(token), token.substring(0, 8), canWrite));
        return new CreatedToken(TokenInfo.of(saved), token);
    }

    @Transactional
    public void revoke(Long id) {
        AccessToken t = repo.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Token não encontrado."));
        repo.delete(t);
    }

    /**
     * Confere o token de uma chamada ao /mcp. Devolve o mesmo tipo de login que o JWT normal
     * (JwtAuthenticationToken com o id do usuário no "subject"), então CurrentUser.id()
     * e o resto do sistema funcionam sem saber que veio de um token pessoal.
     */
    @Transactional
    public JwtAuthenticationToken authenticate(String raw) {
        if (raw == null || !raw.startsWith(PREFIX)) {
            throw new InvalidBearerTokenException("Token inválido.");
        }
        AccessToken t = repo.findByTokenHash(hash(raw))
                .orElseThrow(() -> new InvalidBearerTokenException("Token revogado ou inválido."));
        Instant now = Instant.now();
        // Grava o "último uso" no máximo uma vez por minuto: o MCP faz muitas chamadas seguidas
        if (t.getLastUsedAt() == null || Duration.between(t.getLastUsedAt(), now).toMinutes() >= 1) {
            t.setLastUsedAt(now);
        }
        Jwt jwt = Jwt.withTokenValue(raw)
                .header("alg", "none")
                .subject(String.valueOf(t.getUserId()))
                .claim("pat_id", t.getId())
                .claim("pat_name", t.getName())
                .claim(WRITE_CLAIM, t.isCanWrite())
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofHours(1)))
                .build();
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_mcp")));
    }

    static String hash(String token) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
