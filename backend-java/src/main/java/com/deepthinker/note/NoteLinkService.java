package com.deepthinker.note;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Backlinks, como no painel do Obsidian: quem aponta para uma nota.
 *
 * - "linked": notas que já têm [[Esta nota]] no texto (vêm da tabela connections).
 * - "unlinked": notas que escrevem o título sem colchetes. Um clique transforma a menção em link.
 */
@Service
public class NoteLinkService {

    public record Mention(Long id, String title, String snippet) {
    }

    public record Backlinks(List<Mention> linked, List<Mention> unlinked) {
    }

    private final NoteRepository notes;
    private final ConnectionRepository connections;
    private final NoteService noteService;

    public NoteLinkService(NoteRepository notes, ConnectionRepository connections, NoteService noteService) {
        this.notes = notes;
        this.connections = connections;
        this.noteService = noteService;
    }

    @Transactional(readOnly = true)
    public Backlinks backlinks(Long id) {
        Note target = find(id);
        Set<Long> linkingIds = connections.findTouching(List.of(id)).stream()
                .filter(c -> c.getTargetNoteId().equals(id))
                .map(Connection::getSourceNoteId)
                .collect(Collectors.toSet());

        List<Mention> linked = new ArrayList<>();
        List<Mention> unlinked = new ArrayList<>();
        // Um usuário tem centenas ou poucos milhares de notas: varrer em Java é rápido (milissegundos).
        for (Note other : notes.findByUserId(CurrentUser.id())) {
            if (other.getId().equals(id)) {
                continue;
            }
            if (linkingIds.contains(other.getId())) {
                linked.add(new Mention(other.getId(), other.getTitle(), linkSnippet(other.getContent(), target.getTitle())));
                continue;
            }
            // Títulos de 1 ou 2 letras casariam com quase tudo.
            if (target.getTitle().trim().length() < 3) {
                continue;
            }
            int at = WikiLinks.plainMention(other.getContent(), target.getTitle());
            if (at >= 0) {
                unlinked.add(new Mention(other.getId(), other.getTitle(),
                        WikiLinks.snippet(other.getContent(), at, target.getTitle().length())));
            }
        }
        return new Backlinks(linked, unlinked);
    }

    /**
     * Transforma a primeira menção solta do título da nota {targetId} dentro da nota {sourceId}
     * em [[link]]. Se a pessoa escreveu com outra caixa ("medo de falir"), vira
     * [[Medo de falir|medo de falir]] para o texto continuar igual.
     */
    @Transactional
    public NoteDtos.NoteDetail linkMention(Long targetId, Long sourceId) {
        Note target = find(targetId);
        Note source = find(sourceId);
        String content = source.getContent();
        int at = WikiLinks.plainMention(content, target.getTitle());
        if (at < 0) {
            throw ValidationException.of("source_id", "Essa nota não cita o título sem link.");
        }
        String written = content.substring(at, at + target.getTitle().length());
        String link = written.equals(target.getTitle()) ? "[[" + written + "]]" : "[[" + target.getTitle() + "|" + written + "]]";
        noteService.saveEdit(source, source.getTitle(),
                content.substring(0, at) + link + content.substring(at + written.length()), "link");
        return NoteDtos.NoteDetail.of(source, null);
    }

    /** Trecho em volta do primeiro [[link]] que aponta para o título. */
    private static String linkSnippet(String content, String title) {
        if (content == null) {
            return "";
        }
        Matcher m = WikiLinks.LINK.matcher(content);
        while (m.find()) {
            if (WikiLinks.targets(m.group(1)).contains(title)) {
                return WikiLinks.snippet(content, m.start(), m.end() - m.start());
            }
        }
        return WikiLinks.snippet(content, 0, 0);
    }

    private Note find(Long id) {
        return notes.findByIdAndUserId(id, CurrentUser.id())
                .orElseThrow(() -> new NotFoundException("Nota não encontrada."));
    }
}
