package com.deepthinker.config;

import com.deepthinker.auth.TokenService;
import com.deepthinker.mcp.AccessTokenService;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationManagerResolver;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Quem pode acessar o quê.
 *
 * - /api/auth/register e /api/auth/login são públicos (senão ninguém entraria).
 * - /api/auth/local também, mas só existe no app desktop e pede a chave do app.
 * - Todo o resto exige "Authorization: Bearer <token>".
 * - /mcp (servidor MCP para IAs de fora) aceita também o token pessoal "dt_..." criado
 *   na tela IA; em qualquer outra rota esse token é recusado.
 * - Sem sessão no servidor (STATELESS): o token carrega quem é o usuário.
 * - CSRF desligado: ele protege cookies de sessão, e aqui não usamos cookies.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, AuthenticationManagerResolver<HttpServletRequest> bearer) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // A 2ª passagem do streaming (ASYNC) e as páginas de erro já foram autorizadas na 1ª.
                        .dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/local").permitAll()
                        // WebSocket da edição em conjunto: o login vem na URL e é conferido em CollabHandshake
                        .requestMatchers(HttpMethod.GET, "/ws/collab/*").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(rs -> rs
                        .authenticationManagerResolver(bearer)
                        .authenticationEntryPoint(unauthorized()))
                .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized()));
        return http.build();
    }

    /** Qual validador usar para o "Bearer ...": o login normal (JWT) ou, só no /mcp, o token pessoal. */
    @Bean
    AuthenticationManagerResolver<HttpServletRequest> bearerResolver(JwtDecoder decoder, AccessTokenService personal) {
        AuthenticationManager jwt = new JwtAuthenticationProvider(decoder)::authenticate;
        AuthenticationManager mcp = auth -> {
            String raw = ((BearerTokenAuthenticationToken) auth).getToken();
            return raw.startsWith(AccessTokenService.PREFIX) ? personal.authenticate(raw) : jwt.authenticate(auth);
        };
        return request -> "/mcp".equals(request.getRequestURI()) ? mcp : jwt;
    }

    @Bean
    JwtDecoder jwtDecoder(TokenService tokens) {
        return tokens.decoder();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** 401 em JSON, no mesmo formato dos outros erros, para o React mostrar a mensagem. */
    private static AuthenticationEntryPoint unauthorized() {
        return (request, response, ex) -> {
            response.setStatus(401);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"message\":\"Faça login para continuar.\"}");
        };
    }
}
