package com.deepthinker.auth;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

/**
 * Gera e confere tokens JWT.
 *
 * Um JWT é um texto em três partes (cabeçalho.dados.assinatura). Os dados dizem
 * "sou o usuário 7 e valho até tal hora"; a assinatura (HMAC-SHA256) prova que
 * fomos nós que emitimos. Como o servidor não precisa guardar sessão, qualquer
 * número de instâncias consegue validar o mesmo token.
 *
 * A chave da assinatura é derivada de DEEPTHINKER_SECRET, então há um segredo só
 * para cuidar. Trocar esse segredo desloga todo mundo (e invalida as API keys salvas).
 */
@Service
public class TokenService {

    private static final String ISSUER = "deepthinker";

    private final SecretKey key;
    private final Duration ttl;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public TokenService(@Value("${deepthinker.secret}") String secret,
                        @Value("${deepthinker.auth.token-ttl:7d}") Duration ttl) {
        this.key = deriveKey(secret);
        this.ttl = ttl;
        this.encoder = NimbusJwtEncoder.withSecretKey(key).build();
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    public String issue(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(user.getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim("name", user.getName())
                .claim("email", user.getEmail())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    /** Usado pelo Spring Security para validar o "Authorization: Bearer ..." de cada requisição. */
    public JwtDecoder decoder() {
        return decoder;
    }

    public long ttlSeconds() {
        return ttl.toSeconds();
    }

    /**
     * "jwt:" + segredo passa pelo SHA-256: dá 32 bytes, o tamanho certo para HS256,
     * e uma chave diferente da usada para criptografar as API keys (SecretCipher).
     */
    private static SecretKey deriveKey(String secret) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(("jwt:" + secret).getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(hash, "HmacSHA256");
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
