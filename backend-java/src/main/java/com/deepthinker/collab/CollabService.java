package com.deepthinker.collab;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.auth.User;
import com.deepthinker.auth.UserRepository;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import com.deepthinker.note.Note;
import com.deepthinker.note.NoteRepository;
import com.deepthinker.note.NoteService;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Edição de nota em conjunto: convites e quem pode entrar.
 *
 * A nota continua sendo do dono (as ligações [[...]] e a memória são as do dono). A pessoa
 * convidada pode ler e editar o TEXTO daquela nota, e só dela. A conversa ao vivo
 * (WebSocket) fica em CollabHub; aqui ficam as regras.
 */
@Service
public class CollabService {

    private static final int MAX_SHARES = 20;
    private static final int MAX_CONTENT = 1_000_000;

    private final NoteRepository notes;
    private final NoteShareRepository shares;
    private final UserRepository users;
    private final NoteService noteService;
    private final CollabHub hub;

    public CollabService(NoteRepository notes, NoteShareRepository shares, UserRepository users,
                         NoteService noteService, CollabHub hub) {
        this.notes = notes;
        this.shares = shares;
        this.users = users;
        this.noteService = noteService;
        this.hub = hub;
    }

    public record CollabNote(Long id, String title, String content, String ownerName, boolean isOwner,
                             int collaborators, Instant updatedAt) {
    }

    public record ShareInfo(Long id, Long userId, String name, String email, Instant createdAt) {
    }

    public record SharedNote(Long id, String title, String ownerName, Instant updatedAt) {
    }

    /** A nota, se a pessoa for a dona ou convidada. Sem acesso: vazio (quem chama decide o erro). */
    @Transactional(readOnly = true)
    public Optional<Note> accessible(Long noteId, Long userId) {
        return notes.findById(noteId)
                .filter(n -> n.getUserId().equals(userId) || shares.existsByNoteIdAndUserId(noteId, userId));
    }

    @Transactional(readOnly = true)
    public CollabNote show(Long noteId) {
        Long me = CurrentUser.id();
        Note n = require(noteId, me);
        return new CollabNote(n.getId(), n.getTitle(), n.getContent(), nameOf(n.getUserId()), n.getUserId().equals(me),
                shares.findByNoteIdOrderByIdAsc(noteId).size(), n.getUpdatedAt());
    }

    @Transactional
    public CollabNote saveContent(Long noteId, String content) {
        String text = content == null ? "" : content;
        if (text.length() > MAX_CONTENT) {
            throw ValidationException.of("content", "A nota passou do limite de 1 milhão de caracteres.");
        }
        Note n = require(noteId, CurrentUser.id());
        noteService.saveCollaborative(n, text);
        return show(noteId);
    }

    @Transactional(readOnly = true)
    public List<ShareInfo> list(Long noteId) {
        owned(noteId);
        return shares.findByNoteIdOrderByIdAsc(noteId).stream().map(s -> {
            User u = users.findById(s.getUserId()).orElse(null);
            return new ShareInfo(s.getId(), s.getUserId(), u == null ? "?" : u.getName(), u == null ? null : u.getEmail(),
                    s.getCreatedAt());
        }).toList();
    }

    @Transactional
    public ShareInfo invite(Long noteId, String email) {
        Note n = owned(noteId);
        String clean = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (clean.isEmpty()) {
            throw ValidationException.of("email", "Informe o e-mail da pessoa.");
        }
        // Só o dono de uma nota chega aqui (owned acima), e convidar exige saber o e-mail exato
        User u = users.findByEmail(clean)
                .orElseThrow(() -> ValidationException.of("email", "Não há conta no Deep thinker com este e-mail."));
        if (u.getId().equals(n.getUserId())) {
            throw ValidationException.of("email", "Esta nota já é sua.");
        }
        if (shares.existsByNoteIdAndUserId(noteId, u.getId())) {
            throw ValidationException.of("email", "Esta pessoa já foi convidada.");
        }
        if (shares.findByNoteIdOrderByIdAsc(noteId).size() >= MAX_SHARES) {
            throw ValidationException.of("email", "Limite de " + MAX_SHARES + " pessoas por nota.");
        }
        NoteShare s = shares.save(new NoteShare(noteId, n.getUserId(), u.getId()));
        return new ShareInfo(s.getId(), u.getId(), u.getName(), u.getEmail(), s.getCreatedAt());
    }

    @Transactional
    public void revoke(Long noteId, Long shareId) {
        owned(noteId);
        NoteShare s = shares.findByIdAndNoteId(shareId, noteId)
                .orElseThrow(() -> new NotFoundException("Convite não encontrado."));
        shares.delete(s);
        hub.kick(noteId, s.getUserId()); // quem estava editando sai na hora
    }

    @Transactional(readOnly = true)
    public List<SharedNote> sharedWithMe() {
        return shares.findByUserIdOrderByIdDesc(CurrentUser.id()).stream()
                .map(s -> notes.findById(s.getNoteId()).orElse(null))
                .filter(java.util.Objects::nonNull)
                .map(n -> new SharedNote(n.getId(), n.getTitle(), nameOf(n.getUserId()), n.getUpdatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public String nameOf(Long userId) {
        return users.findById(userId).map(User::getName).orElse("?");
    }

    private Note require(Long noteId, Long userId) {
        // Sem acesso responde 404, como se a nota não existisse
        return accessible(noteId, userId).orElseThrow(() -> new NotFoundException("Nota não encontrada."));
    }

    private Note owned(Long noteId) {
        return notes.findById(noteId)
                .filter(n -> n.getUserId().equals(CurrentUser.id()))
                .orElseThrow(() -> new NotFoundException("Nota não encontrada."));
    }
}
