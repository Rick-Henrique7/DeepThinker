package com.deepthinker.note;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * DTOs ("Data Transfer Objects"): o formato exato do JSON que entra e sai da API.
 * Separar isso da entidade evita expor colunas internas por acidente.
 * Os nomes em camelCase viram snake_case no JSON (ver application.yml),
 * para o frontend React continuar recebendo created_at, source_meta etc.
 */
public final class NoteDtos {

    private NoteDtos() {
    }

    /** Corpo de POST /api/notes e PUT /api/notes/{id}. */
    public record NoteRequest(
            @NotBlank(message = "O título é obrigatório.")
            @Size(max = 255, message = "O título pode ter no máximo 255 caracteres.")
            String title,
            String content,
            String summary) {
    }

    /** Item de GET /api/notes. */
    public record NoteListItem(Long id, String title, String summary, Instant createdAt) {
        static NoteListItem of(Note n) {
            return new NoteListItem(n.getId(), n.getTitle(), n.getSummary(), n.getCreatedAt());
        }
    }

    /** Item de GET /api/notes/titles e dos nós do grafo. */
    public record NoteRef(Long id, String title) {
        static NoteRef of(Note n) {
            return new NoteRef(n.getId(), n.getTitle());
        }
    }

    /**
     * Nota completa (GET/POST/PUT). connectedNotes só vem preenchido no GET.
     * tags e properties são lidas do texto na hora (ver NoteMetadata); frontmatterError avisa
     * quando o cabeçalho --- existe mas não é YAML válido.
     */
    public record NoteDetail(
            Long id,
            String title,
            String content,
            String summary,
            String sourceType,
            Map<String, Object> sourceMeta,
            Instant createdAt,
            Instant updatedAt,
            List<NoteRef> connectedNotes,
            List<String> tags,
            Map<String, Object> properties,
            boolean frontmatterError) {
        public static NoteDetail of(Note n, List<NoteRef> connected) {
            NoteMetadata.Parsed meta = NoteMetadata.parse(n.getContent());
            return new NoteDetail(n.getId(), n.getTitle(), n.getContent(), n.getSummary(),
                    n.getSourceType(), n.getSourceMeta(), n.getCreatedAt(), n.getUpdatedAt(), connected,
                    meta.tags(), meta.properties(), meta.broken());
        }
    }

    /** Corpo de PATCH /api/notes/{id}/properties: {"properties": {"status": "feito", "prazo": null}}. */
    public record PropertiesRequest(Map<String, Object> properties) {
    }

    /**
     * Uma linha de GET /api/notes/index: o que a Tabela, o Quadro e o Painel precisam de cada nota,
     * sem o texto inteiro (bem mais leve que baixar todas as notas).
     */
    public record NoteIndexItem(
            Long id,
            String title,
            List<String> tags,
            Map<String, Object> properties,
            String sourceType,
            Instant createdAt,
            Instant updatedAt,
            int linksOut,
            int linksIn,
            int words) {
    }

    /** Item de GET /api/tags. */
    public record TagCount(String tag, long count) {
    }

    /** Nó do grafo: a nota e as tags dela (para filtrar o grafo por tag). */
    public record GraphNode(Long id, String title, List<String> tags) {
    }

    public record GraphLink(Long source, Long target, double weight) {
    }

    /** Resposta de GET /api/graph, no formato que o D3 espera. */
    public record Graph(List<GraphNode> nodes, List<GraphLink> links) {
    }
}
