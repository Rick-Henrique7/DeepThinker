package com.deepthinker.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * CORS: diz ao navegador quais sites podem chamar esta API.
 * Em produção, defina FRONTEND_ORIGIN com o domínio do frontend
 * (pode ser mais de um, separados por vírgula).
 *
 * Com o Spring Security na frente, o CORS precisa ser um bean CorsConfigurationSource:
 * o filtro de segurança responde o "preflight" (OPTIONS) do navegador antes de
 * exigir o token.
 */
@Configuration
public class CorsConfig {

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${deepthinker.frontend-origin}") String[] origins) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(List.of(origins));
        // PATCH: mudar só as propriedades de uma nota (PATCH /api/notes/{id}/properties).
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("*"));
        cors.setExposedHeaders(List.of("X-Token-Usage", "X-Model-Name"));
        cors.setMaxAge(86400L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
