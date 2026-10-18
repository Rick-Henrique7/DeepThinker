package com.deepthinker.mcp;

import com.deepthinker.auth.CurrentUser;
import com.deepthinker.board.BoardService;
import com.deepthinker.canvas.CanvasService;
import com.deepthinker.note.Note;
import com.deepthinker.note.NoteDtos.NoteDetail;
import com.deepthinker.note.NoteDtos.NoteIndexItem;
import com.deepthinker.note.NoteService;
import com.deepthinker.pilot.NoTabException;
import com.deepthinker.pilot.PilotException;
import com.deepthinker.pilot.PilotHub;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * As ferramentas que uma IA de fora enxerga pelo MCP.
 *
 * Dois tipos:
 * - Dados (list_notes, get_note, get_board, create_note): falam direto com o NoteService.
 * - Tela (navigate, open_note, move_card): acontecem na aba aberta, na frente da pessoa,
 *   pelo modo piloto (PilotHub). move_card sem aba aberta muda a nota direto, sem animação.
 * - Quadro (create_column, rename_column, delete_column, add_to_board, remove_from_board,
 *   create_card): a mudança é feita no servidor (BoardService); com o app aberto, o cursor da
 *   IA aponta o lugar antes e o Quadro mostra o resultado destacado.
 * - Canvas (list_canvases, create_canvas, add_canvas_card): grava pelo CanvasService e, com o
 *   app aberto, abre o canvas na tela da pessoa.
 *
 * Ferramentas de escrita exigem um token com "pode criar e alterar notas" ligado.
 */
@Component
public class McpTools {

    /** Telas que navigate aceita, com o caminho no app. */
    static final Map<String, String> SCREENS = new LinkedHashMap<>();

    static {
        SCREENS.put("pensar", "/");
        SCREENS.put("grafo", "/grafo");
        SCREENS.put("tabela", "/grafo?view=tabela");
        SCREENS.put("quadro", "/grafo?view=quadro");
        SCREENS.put("advogado", "/advogado");
        SCREENS.put("painel", "/painel");
        SCREENS.put("canvas", "/canvas");
        SCREENS.put("leitor", "/leitor");
        SCREENS.put("ia", "/settings");
    }

    private static final int LIST_LIMIT = 50;

    private final NoteService notes;
    private final PilotHub pilot;
    private final BoardService board;
    private final CanvasService canvases;
    private final JsonMapper json;

    public McpTools(NoteService notes, PilotHub pilot, BoardService board, CanvasService canvases, JsonMapper json) {
        this.notes = notes;
        this.pilot = pilot;
        this.board = board;
        this.canvases = canvases;
        this.json = json;
    }

    // ------------------------------------------------------------ catálogo

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> tools = new ArrayList<>();
        tools.add(tool("list_notes",
                "Lista as notas do usuário (id, título, tags e propriedades). Filtre por parte do título "
                        + "e/ou por tag. Use para descobrir o id de uma nota antes de abrir ou mover.",
                props(
                        "query", str("Parte do título, sem diferenciar maiúsculas (opcional)."),
                        "tag", str("Só notas com esta tag, sem o # (opcional)."),
                        "limit", Map.of("type", "integer", "description", "Máximo de notas (padrão 50).")),
                List.of(), true));
        tools.add(tool("get_note",
                "Lê uma nota inteira: texto em Markdown, tags, propriedades e notas ligadas.",
                props("id", integer("Id da nota.")), List.of("id"), true));
        tools.add(tool("get_board",
                "Mostra o Quadro Kanban: as colunas na ordem, cada uma com os cartões (id e título). "
                        + "Só aparecem as notas que a pessoa pôs no Quadro. Use antes de mexer no Quadro.",
                props(), List.of(), true));
        tools.add(tool("navigate",
                "Troca a tela do Deep thinker na frente da pessoa, com o cursor da IA indo até o menu. "
                        + "Precisa do app aberto no navegador.",
                props("screen", Map.of("type", "string", "enum", List.copyOf(SCREENS.keySet()),
                        "description", "pensar (criar nota), grafo, tabela, quadro (Kanban), advogado (chat), "
                                + "painel, canvas, leitor (documentos) ou ia (configurações).")),
                List.of("screen"), true));
        tools.add(tool("open_note",
                "Abre uma nota na tela da pessoa (painel lateral da nota). Precisa do app aberto no navegador.",
                props("id", integer("Id da nota.")), List.of("id"), true));
        tools.add(tool("move_card",
                "Move um cartão do Quadro Kanban para outra coluna, arrastando na frente da pessoa. "
                        + "Sem o app aberto, a mudança é feita direto, sem animação.",
                props(
                        "id", integer("Id da nota (o cartão)."),
                        "column", str("Nome da coluna de destino, como aparece em get_board.")),
                List.of("id", "column"), false));
        tools.add(tool("add_to_board",
                "Põe uma nota no Quadro Kanban (vira um cartão). Nota fora do Quadro não aparece nele.",
                props(
                        "id", integer("Id da nota."),
                        "column", str("Coluna (opcional; sem ela, vai para a primeira). Coluna nova é criada.")),
                List.of("id"), false));
        tools.add(tool("remove_from_board",
                "Tira um cartão do Quadro Kanban. A nota NÃO é apagada: só deixa de aparecer no Quadro.",
                props("id", integer("Id da nota (o cartão).")), List.of("id"), false));
        tools.add(tool("create_card",
                "Cria um cartão direto no Quadro. Ele é uma nota que vive só no Quadro: não aparece no "
                        + "grafo, nas listas nem na memória. Para uma nota comum, use create_note e add_to_board.",
                props(
                        "title", str("Título do cartão (único entre as notas)."),
                        "content", str("Texto do cartão em Markdown (opcional)."),
                        "column", str("Coluna (opcional; sem ela, vai para a primeira).")),
                List.of("title"), false));
        tools.add(tool("create_column",
                "Cria uma coluna no fim do Quadro Kanban.",
                props("name", str("Nome da coluna (até 60 letras).")), List.of("name"), false));
        tools.add(tool("rename_column",
                "Renomeia uma coluna do Quadro; os cartões dela continuam nela.",
                props("column", str("Nome atual da coluna."), "name", str("Nome novo.")),
                List.of("column", "name"), false));
        tools.add(tool("delete_column",
                "Exclui uma coluna do Quadro. Os cartões dela saem do Quadro, mas as notas NÃO são apagadas "
                        + "(cartões criados só no Quadro continuam existindo e podem voltar com add_to_board).",
                props("column", str("Nome da coluna.")), List.of("column"), false));
        tools.add(tool("list_canvases",
                "Lista os canvas (quadros livres com cartões e setas) da pessoa: id, título e quantos cartões.",
                props(), List.of(), true));
        tools.add(tool("create_canvas",
                "Cria um canvas com cartões de texto (Markdown) arrumados lado a lado e, se pedir, ligados por "
                        + "setas na ordem. Com o app aberto, o canvas abre na tela da pessoa.",
                props(
                        "title", str("Título do canvas."),
                        "cards", Map.of("type", "array", "items", Map.of("type", "string"),
                                "description", "Texto de cada cartão, em ordem (até 50)."),
                        "connect", Map.of("type", "boolean", "description", "Ligar cada cartão ao próximo com uma seta.")),
                List.of("title"), false));
        tools.add(tool("add_canvas_card",
                "Põe um cartão de texto num canvas que já existe, ao lado dos outros. Pode ligar com uma seta "
                        + "a partir de um cartão existente (use o id que create_canvas devolveu).",
                props(
                        "canvas_id", integer("Id do canvas (veja list_canvases)."),
                        "text", str("Texto do cartão em Markdown."),
                        "from_card", str("Id de um cartão do canvas para sair uma seta até o novo (opcional).")),
                List.of("canvas_id", "text"), false));
        tools.add(tool("create_note",
                "Cria uma nota. O texto é Markdown; [[Título]] liga a outra nota e #tag marca. "
                        + "Com o app aberto, a nota nova abre na tela da pessoa.",
                props(
                        "title", str("Título curto e único."),
                        "content", str("Texto da nota em Markdown."),
                        "summary", str("Resumo em uma frase (opcional).")),
                List.of("title", "content"), false));
        return tools;
    }

    // ------------------------------------------------------------ execução

    /** Executa a ferramenta. Erros de uso (id errado, sem permissão) saem como McpToolException. */
    public Object call(String name, Map<String, Object> args, String agent) {
        Map<String, Object> a = args == null ? Map.of() : args;
        return switch (name) {
            case "list_notes" -> listNotes(a);
            case "get_note" -> getNote(a);
            case "get_board" -> getBoard(a);
            case "navigate" -> navigate(a, agent);
            case "open_note" -> openNote(a, agent);
            case "move_card" -> moveCard(a, agent);
            case "create_note" -> createNote(a, agent);
            case "add_to_board" -> addToBoard(a, agent);
            case "remove_from_board" -> removeFromBoard(a, agent);
            case "create_card" -> createCard(a, agent);
            case "create_column" -> createColumn(a, agent);
            case "rename_column" -> renameColumn(a, agent);
            case "delete_column" -> deleteColumn(a, agent);
            case "list_canvases" -> canvases.list();
            case "create_canvas" -> createCanvas(a, agent);
            case "add_canvas_card" -> addCanvasCard(a, agent);
            default -> throw new McpToolException("Ferramenta desconhecida: " + name);
        };
    }

    private Object listNotes(Map<String, Object> a) {
        String query = optString(a, "query").toLowerCase(Locale.ROOT);
        String tag = optString(a, "tag").replaceFirst("^#", "").toLowerCase(Locale.ROOT);
        int limit = Math.max(1, Math.min(200, optInt(a, "limit", LIST_LIMIT)));
        List<Map<String, Object>> out = new ArrayList<>();
        int total = 0;
        for (NoteIndexItem n : notes.index()) {
            if (!query.isEmpty() && !n.title().toLowerCase(Locale.ROOT).contains(query)) {
                continue;
            }
            if (!tag.isEmpty() && n.tags().stream().noneMatch(t -> t.equalsIgnoreCase(tag))) {
                continue;
            }
            total++;
            if (out.size() < limit) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", n.id());
                item.put("title", n.title());
                item.put("tags", n.tags());
                item.put("properties", n.properties());
                out.add(item);
            }
        }
        return Map.of("total", total, "notes", out);
    }

    private Object getNote(Map<String, Object> a) {
        NoteDetail n = notes.show(requireId(a));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", n.id());
        out.put("title", n.title());
        out.put("summary", n.summary());
        out.put("tags", n.tags());
        out.put("properties", n.properties());
        out.put("connected_notes", n.connectedNotes());
        out.put("content", n.content());
        return out;
    }

    private Object getBoard(Map<String, Object> a) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (BoardService.Column c : board.board().columns()) {
            List<Map<String, Object>> cards = c.cards().stream()
                    .map(k -> Map.<String, Object>of("id", k.id(), "title", k.title(), "only_on_board", k.boardOnly()))
                    .toList();
            out.add(Map.of("column", c.name(), "position", c.position(), "count", cards.size(),
                    "cards", cards.size() > LIST_LIMIT ? cards.subList(0, LIST_LIMIT) : cards));
        }
        return Map.of("columns", out);
    }

    // ------------------------------------------------------------ Canvas

    private static final int CARD_W = 280;
    private static final int CARD_H = 140;
    private static final int GAP = 60;

    private Object createCanvas(Map<String, Object> a, String agent) {
        requireWrite();
        String title = optString(a, "title");
        if (title.isEmpty()) {
            throw new McpToolException("Dê um título ao canvas.");
        }
        List<String> texts = new ArrayList<>();
        if (a.get("cards") instanceof List<?> list) {
            list.stream().limit(50).map(String::valueOf).forEach(texts::add);
        }
        ObjectNode data = json.createObjectNode();
        ArrayNode nodes = data.putArray("nodes");
        ArrayNode edges = data.putArray("edges");
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < texts.size(); i++) {
            String id = "ia-" + (i + 1);
            ids.add(id);
            // Três por linha, como alguém arrumaria à mão
            nodes.add(textNode(id, texts.get(i), (i % 3) * (CARD_W + GAP), (i / 3) * (CARD_H + GAP)));
        }
        if (Boolean.TRUE.equals(a.get("connect"))) {
            for (int i = 0; i + 1 < ids.size(); i++) {
                edges.add(edge("seta-" + (i + 1), ids.get(i), ids.get(i + 1)));
            }
        }
        CanvasService.CanvasDetail c = canvases.create(new CanvasService.CanvasWrite(title, data, null));
        boolean shown = showCanvas(c.id(), agent);
        return result("Canvas \"" + c.title() + "\" criado com " + texts.size() + " cartão(ões).", shown,
                "id", c.id(), "title", c.title(), "card_ids", ids);
    }

    private Object addCanvasCard(Map<String, Object> a, String agent) {
        requireWrite();
        Object raw = a.get("canvas_id");
        Long canvasId;
        try {
            canvasId = raw instanceof Number n ? n.longValue() : Long.valueOf(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            throw new McpToolException("Informe o id do canvas em \"canvas_id\".");
        }
        String text = a.get("text") == null ? "" : String.valueOf(a.get("text"));
        if (text.isBlank()) {
            throw new McpToolException("O cartão precisa de texto.");
        }
        CanvasService.CanvasDetail c = canvases.get(canvasId);
        ObjectNode data = c.data() instanceof ObjectNode o ? o.deepCopy() : json.createObjectNode();
        ArrayNode nodes = data.has("nodes") && data.get("nodes").isArray() ? (ArrayNode) data.get("nodes") : data.putArray("nodes");
        ArrayNode edges = data.has("edges") && data.get("edges").isArray() ? (ArrayNode) data.get("edges") : data.putArray("edges");
        // O novo cartão entra à direita do que estiver mais à direita, na altura do primeiro
        double right = 0;
        double top = 0;
        boolean first = true;
        java.util.Set<String> existing = new java.util.HashSet<>();
        for (JsonNode n : nodes) {
            existing.add(n.path("id").asString(""));
            right = Math.max(right, n.path("x").asDouble(0) + n.path("width").asDouble(CARD_W));
            if (first) {
                top = n.path("y").asDouble(0);
                first = false;
            }
        }
        String id = "ia-" + java.util.UUID.randomUUID().toString().substring(0, 8);
        nodes.add(textNode(id, text, nodes.isEmpty() ? 0 : (long) right + GAP, (long) top));
        String from = optString(a, "from_card");
        if (!from.isEmpty()) {
            if (!existing.contains(from)) {
                throw new McpToolException("O cartão \"" + from + "\" não está neste canvas.");
            }
            edges.add(edge("seta-" + id, from, id));
        }
        CanvasService.CanvasDetail saved = canvases.update(canvasId, new CanvasService.CanvasWrite(null, data, c.revision()));
        boolean shown = showCanvas(saved.id(), agent);
        return result("Cartão posto no canvas \"" + saved.title() + "\".", shown, "card_id", id, "canvas_id", saved.id());
    }

    private ObjectNode textNode(String id, String text, long x, long y) {
        ObjectNode n = json.createObjectNode();
        n.put("id", id);
        n.put("type", "text");
        n.put("text", text);
        n.put("x", x);
        n.put("y", y);
        n.put("width", CARD_W);
        n.put("height", CARD_H);
        return n;
    }

    private ObjectNode edge(String id, String from, String to) {
        ObjectNode e = json.createObjectNode();
        e.put("id", id);
        e.put("fromNode", from);
        e.put("fromSide", "right");
        e.put("toNode", to);
        e.put("toSide", "left");
        e.put("toEnd", "arrow");
        return e;
    }

    /** Abre o canvas na tela (passa pela lista para a página recarregar se ele já estava aberto). */
    private boolean showCanvas(Long id, String agent) {
        if (!pilot.hasTab(CurrentUser.id())) {
            return false;
        }
        try {
            pilot.run(CurrentUser.id(), "navigate", Map.of("screen", "canvas", "path", "/canvas"), agent);
            Map<String, Object> r = pilot.run(CurrentUser.id(), "navigate", Map.of("screen", "canvas", "path", "/canvas/" + id), agent);
            return Boolean.TRUE.equals(r.get("ok"));
        } catch (PilotException e) {
            return false;
        }
    }

    // ------------------------------------------------------------ Quadro

    private Object addToBoard(Map<String, Object> a, String agent) {
        requireWrite();
        Long id = requireId(a);
        String column = board.addToBoard(id, optString(a, "column"));
        boolean shown = show(Map.of("phase", "show", "card", id), agent);
        return result("Nota posta no Quadro, na coluna \"" + column + "\".", shown, "id", id, "column", column);
    }

    private Object removeFromBoard(Map<String, Object> a, String agent) {
        requireWrite();
        Long id = requireId(a);
        NoteDetail n = notes.show(id);
        boolean shown = show(Map.of("phase", "point", "card", id), agent);
        board.removeFromBoard(id);
        if (shown) {
            show(Map.of("phase", "show"), agent);
        }
        return result("\"" + n.title() + "\" saiu do Quadro (a nota continua existindo).", shown, "id", id);
    }

    private Object createCard(Map<String, Object> a, String agent) {
        requireWrite();
        String column = optString(a, "column");
        boolean shown = show(Map.of("phase", "point", "column", column), agent);
        BoardService.Card card = board.createCard(optString(a, "title"),
                a.get("content") == null ? "" : String.valueOf(a.get("content")), column);
        if (shown) {
            show(Map.of("phase", "show", "card", card.id()), agent);
        }
        return result("Cartão \"" + card.title() + "\" criado no Quadro.", shown, "id", card.id(), "title", card.title());
    }

    private Object createColumn(Map<String, Object> a, String agent) {
        requireWrite();
        boolean shown = show(Map.of("phase", "point", "add_column", true), agent);
        BoardService.Column c = board.createColumn(optString(a, "name"));
        if (shown) {
            show(Map.of("phase", "show", "column", c.name()), agent);
        }
        return result("Coluna \"" + c.name() + "\" criada.", shown, "column", c.name());
    }

    private Object renameColumn(Map<String, Object> a, String agent) {
        requireWrite();
        BoardService.Column c = column(optString(a, "column"));
        boolean shown = show(Map.of("phase", "point", "column", c.name()), agent);
        BoardService.Column renamed = board.renameColumn(c.id(), optString(a, "name"));
        if (shown) {
            show(Map.of("phase", "show", "column", renamed.name()), agent);
        }
        return result("Coluna \"" + c.name() + "\" agora se chama \"" + renamed.name() + "\".", shown, "column", renamed.name());
    }

    private Object deleteColumn(Map<String, Object> a, String agent) {
        requireWrite();
        BoardService.Column c = column(optString(a, "column"));
        boolean shown = show(Map.of("phase", "point", "column", c.name()), agent);
        int removed = board.deleteColumn(c.id());
        if (shown) {
            show(Map.of("phase", "show"), agent);
        }
        return result("Coluna \"" + c.name() + "\" excluída. " + removed
                + " cartão(ões) saíram do Quadro; nenhuma nota foi apagada.", shown, "cards_removed", removed);
    }

    private BoardService.Column column(String name) {
        List<BoardService.Column> cols = board.board().columns();
        return cols.stream().filter(c -> c.name().equalsIgnoreCase(name)).findFirst()
                .orElseThrow(() -> new McpToolException("Coluna \"" + name + "\" não existe. Colunas: "
                        + String.join(", ", cols.stream().map(BoardService.Column::name).toList()) + "."));
    }

    /** Mostra no app aberto (o cursor aponta / o Quadro recarrega destacando). Sem app aberto: nada. */
    private boolean show(Map<String, Object> args, String agent) {
        if (!pilot.hasTab(CurrentUser.id())) {
            return false;
        }
        try {
            Map<String, Object> r = pilot.run(CurrentUser.id(), "board", args, agent);
            return Boolean.TRUE.equals(r.get("ok"));
        } catch (PilotException e) {
            return false;
        }
    }

    private static Map<String, Object> result(String message, boolean shown, Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("message", message);
        out.put("on_screen", shown);
        for (int i = 0; i < kv.length; i += 2) {
            out.put((String) kv[i], kv[i + 1]);
        }
        return out;
    }

    private Object navigate(Map<String, Object> a, String agent) {
        String screen = optString(a, "screen").toLowerCase(Locale.ROOT);
        String path = SCREENS.get(screen);
        if (path == null) {
            throw new McpToolException("Tela desconhecida: \"" + screen + "\". Use uma de: " + String.join(", ", SCREENS.keySet()) + ".");
        }
        return onScreen("navigate", Map.of("screen", screen, "path", path), agent, false);
    }

    private Object openNote(Map<String, Object> a, String agent) {
        NoteDetail n = notes.show(requireId(a)); // 404 aqui se a nota não existe ou é de outra pessoa
        return onScreen("open_note", Map.of("id", n.id(), "title", n.title()), agent, false);
    }

    private Object moveCard(Map<String, Object> a, String agent) {
        requireWrite();
        Long id = requireId(a);
        if (!a.containsKey("column")) {
            throw new McpToolException("Informe a coluna de destino em \"column\".");
        }
        String column = String.valueOf(a.get("column") == null ? "" : a.get("column")).trim();
        if (column.isEmpty()) {
            throw new McpToolException("Informe a coluna de destino. Para tirar do Quadro, use remove_from_board.");
        }
        NoteDetail n = notes.show(id);
        try {
            return onScreen("move_card",
                    Map.of("id", id, "title", n.title(), "column", column, "property", BoardService.PROPERTY), agent, true);
        } catch (NoTabException e) {
            // segue abaixo, sem a tela
        }
        // Sem aba aberta: muda a nota direto (o Quadro mostra quando a pessoa abrir)
        String saved = board.addToBoard(id, column);
        return Map.of("ok", true, "on_screen", false, "id", id, "title", n.title(), "column", saved,
                "message", "Cartão movido (o app não estava aberto, então foi sem animação).");
    }

    private Object createNote(Map<String, Object> a, String agent) {
        requireWrite();
        String title = optString(a, "title");
        String content = a.get("content") == null ? "" : String.valueOf(a.get("content"));
        if (title.isEmpty() || content.isBlank()) {
            throw new McpToolException("title e content são obrigatórios.");
        }
        if (title.length() > 255) {
            throw new McpToolException("O título pode ter no máximo 255 caracteres.");
        }
        String summary = optString(a, "summary");
        Note note = notes.createWithSource(title, content, summary.isEmpty() ? null : summary, "mcp",
                Map.of("created_via", "mcp", "agent", agent, "created_at_tool", Instant.now().toString()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", note.getId());
        out.put("title", note.getTitle());
        // Mostra a nota nova para a pessoa, se o app estiver aberto (se falhar, a nota já existe)
        boolean shown = false;
        if (pilot.hasTab(CurrentUser.id())) {
            try {
                Object r = pilot.run(CurrentUser.id(), "open_note", Map.of("id", note.getId(), "title", note.getTitle()), agent);
                shown = r instanceof Map<?, ?> m && Boolean.TRUE.equals(m.get("ok"));
            } catch (PilotException e) {
                // a nota foi criada; só não deu para mostrar
            }
        }
        out.put("on_screen", shown);
        return out;
    }

    /**
     * Ação na aba aberta. O resultado é o que a aba devolveu ({ok, message} ou {ok:false, error}).
     * Com noTabFallback, a falta de aba sobe como NoTabException para quem chamou fazer sem a tela.
     */
    private Object onScreen(String action, Map<String, Object> args, String agent, boolean noTabFallback) {
        try {
            Map<String, Object> r = pilot.run(CurrentUser.id(), action, args, agent);
            if (!Boolean.TRUE.equals(r.get("ok"))) {
                throw new McpToolException(String.valueOf(r.getOrDefault("error", "A ação falhou na tela.")));
            }
            Map<String, Object> out = new LinkedHashMap<>(r);
            out.put("on_screen", true);
            return out;
        } catch (NoTabException e) {
            if (noTabFallback) {
                throw e;
            }
            throw new McpToolException(e.getMessage());
        } catch (PilotException e) {
            throw new McpToolException(e.getMessage());
        }
    }

    // ------------------------------------------------------------ ajudantes

    private static void requireWrite() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken t
                && t.getToken().hasClaim(AccessTokenService.WRITE_CLAIM)
                && !Boolean.TRUE.equals(t.getToken().getClaim(AccessTokenService.WRITE_CLAIM))) {
            throw new McpToolException("Este token é só de leitura. Crie um token com \"pode criar e alterar notas\" "
                    + "em Deep thinker > IA > Acesso por MCP.");
        }
    }

    private static Long requireId(Map<String, Object> a) {
        Object v = a.get("id");
        try {
            return v instanceof Number num ? num.longValue() : Long.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new McpToolException("Informe o id da nota (número) em \"id\".");
        }
    }

    private static String optString(Map<String, Object> a, String key) {
        Object v = a.get(key);
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static int optInt(Map<String, Object> a, String key, int fallback) {
        Object v = a.get(key);
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return v == null ? fallback : Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** Mesmo texto de coluna que o Quadro usa (valueKey em frontend/src/lib/noteViews.ts). */
    static String valueKey(Object v) {
        if (v == null || "".equals(v)) {
            return "";
        }
        if (v instanceof List<?> list) {
            return String.join(", ", list.stream().map(McpTools::valueKey).toList());
        }
        return String.valueOf(v);
    }

    private static Map<String, Object> tool(String name, String description, Map<String, Object> properties,
                                            List<String> required, boolean readOnly) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", required);
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("name", name);
        t.put("description", description);
        t.put("inputSchema", schema);
        t.put("annotations", Map.of("readOnlyHint", readOnly, "destructiveHint", false));
        return t;
    }

    private static Map<String, Object> props(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static Map<String, Object> str(String description) {
        return Map.of("type", "string", "description", description);
    }

    private static Map<String, Object> integer(String description) {
        return Map.of("type", "integer", "description", description);
    }
}
