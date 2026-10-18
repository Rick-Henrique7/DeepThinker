package com.deepthinker.collab;

import java.nio.ByteBuffer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

/** Liga cada conexão WebSocket à sala da nota (CollabHub). Quem pode entrar já foi visto em CollabHandshake. */
@Component
public class CollabSocketHandler extends AbstractWebSocketHandler {

    private static final Pattern IDENTIFY = Pattern.compile("\"type\"\\s*:\\s*\"identify\".*\"client\"\\s*:\\s*(\\d{1,18})");

    private final CollabHub hub;

    public CollabSocketHandler(CollabHub hub) {
        this.hub = hub;
    }

    private static long noteId(WebSocketSession s) {
        return (Long) s.getAttributes().get(CollabHandshake.NOTE_ID);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession s) {
        hub.join(s, noteId(s), (Long) s.getAttributes().get(CollabHandshake.USER_ID),
                (String) s.getAttributes().get(CollabHandshake.NAME));
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession s, BinaryMessage message) {
        ByteBuffer buf = message.getPayload();
        byte[] data = new byte[buf.remaining()];
        buf.get(data);
        hub.message(s, noteId(s), data);
    }

    @Override
    protected void handleTextMessage(WebSocketSession s, TextMessage message) {
        Matcher m = IDENTIFY.matcher(message.getPayload());
        if (m.find()) {
            hub.identify(s, noteId(s), Long.parseLong(m.group(1)));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
        hub.leave(s, noteId(s));
    }
}
