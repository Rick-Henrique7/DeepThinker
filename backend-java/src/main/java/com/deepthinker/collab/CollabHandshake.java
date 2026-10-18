package com.deepthinker.collab;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Porteiro do WebSocket /ws/collab/{noteId}?token=...
 *
 * O navegador não deixa mandar o cabeçalho Authorization ao abrir um WebSocket, então o login
 * vem na URL (o mesmo JWT do app). Antes de aceitar a conexão conferimos o token e se a pessoa
 * é dona ou convidada daquela nota. Sem isso: 403 e a conexão nem abre.
 */
@Component
public class CollabHandshake implements HandshakeInterceptor {

    public static final String USER_ID = "collab.userId";
    public static final String NOTE_ID = "collab.noteId";
    public static final String NAME = "collab.name";

    private final JwtDecoder jwt;
    private final CollabService collab;

    public CollabHandshake(JwtDecoder jwt, CollabService collab) {
        this.jwt = jwt;
        this.collab = collab;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler,
                                   Map<String, Object> attributes) {
        try {
            var uri = UriComponentsBuilder.fromUri(request.getURI()).build();
            String token = uri.getQueryParams().getFirst("token");
            String last = uri.getPathSegments().getLast();
            long noteId = Long.parseLong(last);
            Jwt decoded = jwt.decode(token);
            long userId = Long.parseLong(decoded.getSubject());
            if (collab.accessible(noteId, userId).isEmpty()) {
                response.setStatusCode(HttpStatus.FORBIDDEN);
                return false;
            }
            attributes.put(USER_ID, userId);
            attributes.put(NOTE_ID, noteId);
            attributes.put(NAME, collab.nameOf(userId));
            return true;
        } catch (JwtException | IllegalArgumentException | NullPointerException | java.util.NoSuchElementException e) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler,
                               Exception exception) {
    }
}
