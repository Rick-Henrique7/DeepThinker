package com.deepthinker.pilot;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * "Modo piloto": o canal entre o servidor e as abas abertas do Deep thinker.
 *
 * Cada aba logada abre um stream (GET /api/pilot/stream) e fica ouvindo. Quando uma IA
 * de fora pede pelo MCP "mova este cartão", o servidor manda o comando para a aba,
 * a aba faz a ação na frente da pessoa (cursor da IA, arrasto animado) e devolve o
 * resultado em POST /api/pilot/results/{id}. run() espera esse resultado.
 *
 * Fica tudo em memória: com o servidor reiniciado, as abas se reconectam sozinhas.
 */
@Component
public class PilotHub {

    /** Quanto a aba tem para fazer a ação (animação + salvar) antes de desistirmos. */
    public static final Duration TIMEOUT = Duration.ofSeconds(20);
    /**
     * Quanto a aba tem para dizer "recebi". Uma aba fechada nem sempre derruba o stream na hora
     * (o servidor só descobre quando a escrita falha); sem esse aviso, a IA esperaria os 20 s à toa.
     */
    public static final Duration ACK_TIMEOUT = Duration.ofSeconds(3);

    private record Tab(String id, SseEmitter emitter) {
    }

    private record Pending(Long userId, CompletableFuture<Void> ack, CompletableFuture<Map<String, Object>> result) {
    }

    private final Map<Long, List<Tab>> tabs = new ConcurrentHashMap<>();
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "pilot-heartbeat");
        t.setDaemon(true);
        return t;
    });

    public PilotHub() {
        // Um "ping" a cada 25 s: sem isso, proxies e o próprio navegador fecham o stream parado
        heartbeat.scheduleAtFixedRate(this::ping, 25, 25, TimeUnit.SECONDS);
    }

    /** Nova aba ouvindo. A mais recente é a que recebe os comandos. */
    public SseEmitter connect(Long userId) {
        SseEmitter emitter = new SseEmitter(0L);
        Tab tab = new Tab(UUID.randomUUID().toString(), emitter);
        tabs.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(tab);
        Runnable remove = () -> drop(userId, tab);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        send(userId, tab, Map.of("type", "hello"));
        return emitter;
    }

    public boolean hasTab(Long userId) {
        List<Tab> list = tabs.get(userId);
        return list != null && !list.isEmpty();
    }

    /**
     * Manda um comando para a aba mais recente e espera ela responder.
     * Sem aba que responda, lança NoTabException; se a aba recebeu mas não terminou a tempo, PilotException.
     */
    public Map<String, Object> run(Long userId, String action, Map<String, Object> args, String agent) {
        List<Tab> list = tabs.get(userId);
        if (list == null || list.isEmpty()) {
            throw new NoTabException();
        }
        String id = UUID.randomUUID().toString();
        Pending p = new Pending(userId, new CompletableFuture<>(), new CompletableFuture<>());
        pending.put(id, p);
        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", "command");
        command.put("id", id);
        command.put("action", action);
        command.put("args", args);
        command.put("agent", agent);
        try {
            // Da aba mais nova para a mais antiga. A que não diz "recebi" a tempo é dada como fechada.
            boolean received = false;
            for (Tab tab : List.copyOf(list).reversed()) {
                if (!send(userId, tab, command)) {
                    continue;
                }
                try {
                    p.ack().get(ACK_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
                    received = true;
                    break;
                } catch (TimeoutException e) {
                    drop(userId, tab);
                    tab.emitter().complete();
                }
            }
            if (!received) {
                throw new NoTabException();
            }
            return p.result().get(TIMEOUT.toSeconds(), TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            throw new PilotException("A aba do Deep thinker não respondeu a tempo.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PilotException("Interrompido.");
        } catch (ExecutionException e) {
            throw new PilotException(e.getCause() == null ? "Falhou." : e.getCause().getMessage());
        } finally {
            pending.remove(id);
        }
    }

    /** A aba recebeu o comando e começou. Só vale para comandos do mesmo usuário. */
    public boolean ack(Long userId, String id) {
        Pending p = pending.get(id);
        return p != null && p.userId().equals(userId) && p.ack().complete(null);
    }

    /** A aba terminou a ação (também conta como "recebi"). */
    public boolean complete(Long userId, String id, Map<String, Object> result) {
        Pending p = pending.get(id);
        if (p == null || !p.userId().equals(userId)) {
            return false;
        }
        p.ack().complete(null);
        return p.result().complete(result == null ? Map.of() : result);
    }

    private boolean send(Long userId, Tab tab, Map<String, Object> event) {
        try {
            tab.emitter().send(SseEmitter.event().data(event, MediaType.APPLICATION_JSON));
            return true;
        } catch (IOException | IllegalStateException e) {
            drop(userId, tab);
            return false;
        }
    }

    private void drop(Long userId, Tab tab) {
        List<Tab> list = tabs.get(userId);
        if (list != null) {
            list.remove(tab);
        }
    }

    private void ping() {
        tabs.forEach((userId, list) -> {
            for (Tab tab : list) {
                try {
                    tab.emitter().send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException e) {
                    drop(userId, tab);
                }
            }
        });
    }
}
