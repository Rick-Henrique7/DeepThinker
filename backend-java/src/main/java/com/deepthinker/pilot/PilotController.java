package com.deepthinker.pilot;

import com.deepthinker.auth.CurrentUser;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * GET  /api/pilot/stream        a aba fica ouvindo os comandos da IA (Server-Sent Events)
 * POST /api/pilot/acks/{id}     a aba avisa que recebeu o comando (ver PilotHub.ACK_TIMEOUT)
 * POST /api/pilot/results/{id}  a aba conta como terminou o comando
 */
@RestController
@RequestMapping("/api/pilot")
public class PilotController {

    private final PilotHub hub;

    public PilotController(PilotHub hub) {
        this.hub = hub;
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream() {
        return ResponseEntity.ok()
                .header("Cache-Control", "no-cache")
                .header("X-Accel-Buffering", "no") // pede ao Nginx para não segurar o stream
                .body(hub.connect(CurrentUser.id()));
    }

    @PostMapping("/acks/{id}")
    public ResponseEntity<Void> ack(@PathVariable String id) {
        return hub.ack(CurrentUser.id(), id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/results/{id}")
    public ResponseEntity<Void> result(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        return hub.complete(CurrentUser.id(), id, body) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }
}
