package com.deepthinker.collab;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

/** WebSocket /ws/collab/{noteId}: só aceita páginas do próprio app (mesmas origens do CORS). */
@Configuration
@EnableWebSocket
public class CollabSocketConfig implements WebSocketConfigurer {

    private final CollabSocketHandler handler;
    private final CollabHandshake handshake;
    private final String[] origins;

    public CollabSocketConfig(CollabSocketHandler handler, CollabHandshake handshake,
                              @Value("${deepthinker.frontend-origin}") String[] origins) {
        this.handler = handler;
        this.handshake = handshake;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/collab/*").addInterceptors(handshake).setAllowedOrigins(origins);
    }

    /**
     * Tamanho máximo de cada mensagem: um retrato de nota grande cabe com folga (o padrão é 8 KB).
     * Nos testes sem servidor de verdade (MockMvc) não existe container de WebSocket: aí não faz nada.
     */
    @Bean
    ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean c = new ServletServerContainerFactoryBean() {
            private jakarta.servlet.ServletContext context;

            @Override
            public void setServletContext(jakarta.servlet.ServletContext servletContext) {
                this.context = servletContext;
                super.setServletContext(servletContext);
            }

            @Override
            public void afterPropertiesSet() {
                if (context != null && context.getAttribute("jakarta.websocket.server.ServerContainer") != null) {
                    super.afterPropertiesSet();
                }
            }
        };
        c.setMaxBinaryMessageBufferSize(4 * 1024 * 1024);
        c.setMaxTextMessageBufferSize(64 * 1024);
        c.setMaxSessionIdleTimeout(10L * 60 * 1000);
        return c;
    }
}
