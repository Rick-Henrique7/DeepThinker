package com.deepthinker.collab;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET    /api/collab/shared-with-me                 notas que outras pessoas compartilharam comigo
 * GET    /api/collab/notes/{id}                     a nota (dona ou convidada)
 * PUT    /api/collab/notes/{id}/content             salva o texto editado em conjunto
 * GET    /api/collab/notes/{id}/shares              quem foi convidado (só a dona)
 * POST   /api/collab/notes/{id}/shares              convida pelo e-mail (só a dona)
 * DELETE /api/collab/notes/{id}/shares/{shareId}    tira o convite (só a dona)
 *
 * A edição ao vivo em si é pelo WebSocket /ws/collab/{id} (ver CollabHub).
 */
@RestController
@RequestMapping("/api/collab")
public class CollabController {

    private final CollabService collab;

    public CollabController(CollabService collab) {
        this.collab = collab;
    }

    public record ContentRequest(String content) {
    }

    public record InviteRequest(String email) {
    }

    @GetMapping("/shared-with-me")
    public List<CollabService.SharedNote> sharedWithMe() {
        return collab.sharedWithMe();
    }

    @GetMapping("/notes/{id}")
    public CollabService.CollabNote show(@PathVariable Long id) {
        return collab.show(id);
    }

    @PutMapping("/notes/{id}/content")
    public CollabService.CollabNote save(@PathVariable Long id, @RequestBody ContentRequest req) {
        return collab.saveContent(id, req.content());
    }

    @GetMapping("/notes/{id}/shares")
    public List<CollabService.ShareInfo> shares(@PathVariable Long id) {
        return collab.list(id);
    }

    @PostMapping("/notes/{id}/shares")
    @ResponseStatus(HttpStatus.CREATED)
    public CollabService.ShareInfo invite(@PathVariable Long id, @RequestBody InviteRequest req) {
        return collab.invite(id, req.email());
    }

    @DeleteMapping("/notes/{id}/shares/{shareId}")
    public Map<String, String> revoke(@PathVariable Long id, @PathVariable Long shareId) {
        collab.revoke(id, shareId);
        return Map.of("message", "Convite removido.");
    }
}
