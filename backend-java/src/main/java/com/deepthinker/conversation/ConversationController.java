package com.deepthinker.conversation;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.note.NoteRepository;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Histórico do chat. O frontend salva cada mensagem (sua e do Advogado) aqui,
 * e ao reabrir a página recarrega a conversa pela sessão.
 *
 * GET    /api/conversations?session_id=...&note_id=...
 * POST   /api/conversations             { role, content, session_id?, note_id? }
 * GET    /api/conversations/{id}
 * DELETE /api/conversations/{id}
 * POST   /api/conversations/clear       { session_id }
 */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    public record MessageRequest(Long noteId, String role, String content, String sessionId) {
    }

    public record ClearRequest(String sessionId) {
    }

    private static final List<String> ROLES = List.of("user", "assistant", "system");

    private final ConversationMessageRepository messages;
    private final NoteRepository notes;

    public ConversationController(ConversationMessageRepository messages, NoteRepository notes) {
        this.messages = messages;
        this.notes = notes;
    }

    @GetMapping
    public List<ConversationMessage> index(@RequestParam(name = "note_id", required = false) Long noteId,
                                           @RequestParam(name = "session_id", required = false) String sessionId) {
        return messages.search(CurrentUser.id(), noteId, sessionId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConversationMessage store(@RequestBody MessageRequest req) {
        if (req.role() == null || !ROLES.contains(req.role())) {
            throw ValidationException.of("role", "role deve ser user, assistant ou system.");
        }
        if (req.content() == null || req.content().isEmpty()) {
            throw ValidationException.of("content", "content é obrigatório.");
        }
        if (req.sessionId() != null && req.sessionId().length() > 64) {
            throw ValidationException.of("session_id", "session_id pode ter no máximo 64 caracteres.");
        }
        Long userId = CurrentUser.id();
        if (req.noteId() != null && !notes.existsByIdAndUserId(req.noteId(), userId)) {
            throw ValidationException.of("note_id", "A nota informada não existe.");
        }
        return messages.save(new ConversationMessage(userId, req.noteId(), req.sessionId(), req.role(), req.content()));
    }

    @GetMapping("/{id}")
    public ConversationMessage show(@PathVariable Long id) {
        return messages.findByIdAndUserId(id, CurrentUser.id()).orElseThrow(() -> new NotFoundException("Mensagem não encontrada."));
    }

    @DeleteMapping("/{id}")
    public Map<String, String> destroy(@PathVariable Long id) {
        messages.delete(show(id));
        return Map.of("message", "Mensagem removida.");
    }

    @PostMapping("/clear")
    @Transactional
    public Map<String, Integer> clearSession(@RequestBody ClearRequest req) {
        if (req.sessionId() == null || req.sessionId().isEmpty() || req.sessionId().length() > 64) {
            throw ValidationException.of("session_id", "Informe o session_id (até 64 caracteres).");
        }
        return Map.of("deleted", messages.deleteBySession(CurrentUser.id(), req.sessionId()));
    }
}
