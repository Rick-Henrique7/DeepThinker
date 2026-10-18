package com.deepthinker.collab;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * As "salas" de edição ao vivo: uma por nota aberta em conjunto.
 *
 * Quem faz a mágica de juntar as edições é o Yjs, no navegador (um CRDT: cada edição é uma
 * "atualização" que pode chegar em qualquer ordem e todos terminam com o mesmo texto).
 * O servidor só faz três coisas:
 * 1. repassa cada atualização para as outras pessoas da sala;
 * 2. guarda as atualizações, para quem entra depois receber o texto atual;
 * 3. escolhe quem "semeia" a sala com o texto salvo da nota (só o primeiro a entrar).
 *
 * Mensagens binárias (o 1º byte diz o tipo):
 *   0 = atualização do documento (guardada e repassada)
 *   1 = presença (cursor, nome, cor; só repassada)
 *   2 = retrato do documento inteiro (substitui as guardadas, para a lista não crescer sem fim)
 * Mensagens de texto (JSON): init, hello/left (alguém entrou/saiu), compact (pede um retrato).
 */
@Component
public class CollabHub {

    public static final byte UPDATE = 0;
    public static final byte AWARENESS = 1;
    public static final byte SNAPSHOT = 2;

    private static final Logger log = LoggerFactory.getLogger(CollabHub.class);
    /** Com tantas atualizações guardadas, pede um retrato para alguém da sala. */
    private static final int COMPACT_AT = 300;
    private static final int MAX_STORED_BYTES = 8 * 1024 * 1024;

    static final class Room {
        final List<byte[]> updates = new ArrayList<>();
        final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
        /** clientID do Yjs de cada sessão, para avisar os outros quando ela sair. */
        final Map<String, Long> clientIds = new ConcurrentHashMap<>();
        boolean seeding;
        long bytes;
        boolean compactAsked;
    }

    private final Map<Long, Room> rooms = new ConcurrentHashMap<>();

    public void join(WebSocketSession s, long noteId, long userId, String name) {
        Room room = rooms.computeIfAbsent(noteId, k -> new Room());
        boolean seed;
        List<byte[]> backlog;
        synchronized (room) {
            room.sessions.put(s.getId(), s);
            // Sala vazia e ninguém semeando: esta pessoa põe o texto salvo da nota
            seed = room.updates.isEmpty() && !room.seeding;
            if (seed) {
                room.seeding = true;
            }
            backlog = List.copyOf(room.updates);
        }
        sendText(s, "{\"type\":\"init\",\"seed\":" + seed + ",\"peers\":" + (room.sessions.size() - 1) + "}");
        for (byte[] u : backlog) {
            sendBinary(s, u);
        }
        // Os outros reenviam a presença deles para quem acabou de chegar
        broadcastText(room, s, "{\"type\":\"hello\"}");
    }

    public void message(WebSocketSession s, long noteId, byte[] data) {
        Room room = rooms.get(noteId);
        if (room == null || data.length == 0) {
            return;
        }
        byte type = data[0];
        if (type == UPDATE) {
            WebSocketSession compactor = null;
            synchronized (room) {
                room.updates.add(data);
                room.bytes += data.length;
                room.seeding = false;
                if ((room.updates.size() > COMPACT_AT || room.bytes > MAX_STORED_BYTES) && !room.compactAsked) {
                    room.compactAsked = true;
                    compactor = s;
                }
            }
            broadcastBinary(room, s, data);
            if (compactor != null) {
                sendText(compactor, "{\"type\":\"compact\"}");
            }
        } else if (type == AWARENESS) {
            broadcastBinary(room, s, data);
        } else if (type == SNAPSHOT) {
            synchronized (room) {
                // O retrato vira uma atualização comum (tipo 0) que contém tudo
                byte[] asUpdate = data.clone();
                asUpdate[0] = UPDATE;
                room.updates.clear();
                room.updates.add(asUpdate);
                room.bytes = asUpdate.length;
                room.compactAsked = false;
                room.seeding = false;
            }
        }
    }

    /** A aba conta o clientID do Yjs dela, para os outros apagarem o cursor quando ela sair. */
    public void identify(WebSocketSession s, long noteId, long clientId) {
        Room room = rooms.get(noteId);
        if (room != null) {
            room.clientIds.put(s.getId(), clientId);
        }
    }

    public void leave(WebSocketSession s, long noteId) {
        Room room = rooms.get(noteId);
        if (room == null) {
            return;
        }
        Long clientId;
        synchronized (room) {
            room.sessions.remove(s.getId());
            clientId = room.clientIds.remove(s.getId());
            // Quem ia semear saiu antes de mandar o texto: o próximo a entrar semeia
            if (room.updates.isEmpty()) {
                room.seeding = false;
            }
            // Sala vazia: esquece tudo (o texto já foi salvo na nota pelas abas)
            if (room.sessions.isEmpty()) {
                rooms.remove(noteId, room);
            }
        }
        if (clientId != null) {
            broadcastText(room, null, "{\"type\":\"left\",\"client\":" + clientId + "}");
        }
    }

    /** Convite revogado: fecha as conexões daquela pessoa naquela nota. */
    public void kick(long noteId, long userId) {
        Room room = rooms.get(noteId);
        if (room == null) {
            return;
        }
        for (WebSocketSession s : room.sessions.values()) {
            if (Long.valueOf(userId).equals(s.getAttributes().get(CollabHandshake.USER_ID))) {
                try {
                    s.close(new CloseStatus(4403, "Convite removido"));
                } catch (IOException e) {
                    // já fechada
                }
            }
        }
    }

    int roomSize(long noteId) {
        Room room = rooms.get(noteId);
        return room == null ? 0 : room.sessions.size();
    }

    private void broadcastBinary(Room room, WebSocketSession from, byte[] data) {
        for (WebSocketSession other : room.sessions.values()) {
            if (from == null || !other.getId().equals(from.getId())) {
                sendBinary(other, data);
            }
        }
    }

    private void broadcastText(Room room, WebSocketSession from, String text) {
        for (WebSocketSession other : room.sessions.values()) {
            if (from == null || !other.getId().equals(from.getId())) {
                sendText(other, text);
            }
        }
    }

    private void sendBinary(WebSocketSession s, byte[] data) {
        send(s, new BinaryMessage(ByteBuffer.wrap(data)));
    }

    private void sendText(WebSocketSession s, String text) {
        send(s, new TextMessage(text));
    }

    private void send(WebSocketSession s, org.springframework.web.socket.WebSocketMessage<?> m) {
        // A mesma sessão pode receber de várias threads: o envio precisa ser um de cada vez
        synchronized (s) {
            try {
                if (s.isOpen()) {
                    s.sendMessage(m);
                }
            } catch (IOException | IllegalStateException e) {
                log.debug("Falha ao enviar para a sessão {}", s.getId(), e);
            }
        }
    }
}
