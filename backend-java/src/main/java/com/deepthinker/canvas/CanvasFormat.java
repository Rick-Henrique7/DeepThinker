package com.deepthinker.canvas;

import com.deepthinker.common.ValidationException;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Confere e "limpa" um desenho no formato JSON Canvas (https://jsoncanvas.org), o formato
 * aberto do Obsidian:
 *
 *   { "nodes": [ { "id": "a1", "type": "text", "x": 0, "y": 0, "width": 250, "height": 60, "text": "Oi" } ],
 *     "edges": [ { "id": "e1", "fromNode": "a1", "toNode": "b2", "toEnd": "arrow" } ] }
 *
 * Por que limpar no servidor, se quem desenha é o navegador? Porque o desenho também pode vir
 * de um arquivo .canvas importado, e o que fica guardado precisa ser seguro de mostrar.
 * Exemplo: um link "javascript:..." num cartão viraria um clique perigoso. Então:
 * - só ficam os campos que o formato conhece (o resto é jogado fora);
 * - link só com http:// ou https://;
 * - cor só "1" a "6" (as 6 cores do Obsidian) ou #rrggbb;
 * - seta apontando para um cartão que não existe é removida;
 * - números absurdos são limitados, e há um teto de cartões e de tamanho.
 */
final class CanvasFormat {

    static final int MAX_NODES = 2000;
    static final int MAX_EDGES = 5000;
    static final int MAX_TEXT = 100_000;
    static final int MAX_BYTES = 2_000_000;
    private static final double MAX_COORD = 1_000_000;
    private static final double MAX_SIZE = 100_000;

    private static final Set<String> TYPES = Set.of("text", "file", "link", "group");
    private static final Set<String> SIDES = Set.of("top", "right", "bottom", "left");
    private static final Set<String> ENDS = Set.of("none", "arrow");
    private static final Set<String> BACKGROUND_STYLES = Set.of("cover", "ratio", "repeat");
    private static final Pattern COLOR = Pattern.compile("^(?:[1-6]|#[0-9a-fA-F]{6})$");
    private static final Pattern URL = Pattern.compile("^https?://\\S+$", Pattern.CASE_INSENSITIVE);

    private static final JsonNodeFactory F = JsonNodeFactory.instance;

    private CanvasFormat() {
    }

    /** Um canvas vazio. */
    static ObjectNode empty() {
        ObjectNode root = F.objectNode();
        root.putArray("nodes");
        root.putArray("edges");
        return root;
    }

    /** Devolve uma cópia limpa do desenho, ou 422 se não der para aproveitar. */
    static ObjectNode clean(JsonNode data) {
        if (data == null || data.isNull()) {
            return empty();
        }
        if (!data.isObject()) {
            throw ValidationException.of("data", "O canvas precisa ser um objeto com \"nodes\" e \"edges\".");
        }
        JsonNode nodes = data.path("nodes");
        JsonNode edges = data.path("edges");
        if ((!nodes.isMissingNode() && !nodes.isArray()) || (!edges.isMissingNode() && !edges.isArray())) {
            throw ValidationException.of("data", "\"nodes\" e \"edges\" precisam ser listas.");
        }
        if (nodes.size() > MAX_NODES) {
            throw ValidationException.of("data", "Canvas grande demais: no máximo " + MAX_NODES + " cartões.");
        }
        if (edges.size() > MAX_EDGES) {
            throw ValidationException.of("data", "Canvas grande demais: no máximo " + MAX_EDGES + " setas.");
        }

        ObjectNode out = empty();
        ArrayNode outNodes = (ArrayNode) out.get("nodes");
        Set<String> ids = new HashSet<>();
        for (JsonNode n : nodes) {
            ObjectNode node = cleanNode(n);
            if (node == null) {
                continue;
            }
            if (!ids.add(node.get("id").asString())) {
                throw ValidationException.of("data", "Dois cartões com o mesmo id: " + node.get("id").asString());
            }
            outNodes.add(node);
        }

        ArrayNode outEdges = (ArrayNode) out.get("edges");
        Set<String> edgeIds = new HashSet<>();
        for (JsonNode e : edges) {
            ObjectNode edge = cleanEdge(e, ids);
            if (edge != null && edgeIds.add(edge.get("id").asString())) {
                outEdges.add(edge);
            }
        }
        return out;
    }

    static int cardCount(JsonNode cleaned) {
        return cleaned.path("nodes").size();
    }

    private static ObjectNode cleanNode(JsonNode n) {
        if (!n.isObject()) {
            return null;
        }
        String id = text(n, "id", 128);
        String type = text(n, "type", 16);
        if (id == null || id.isBlank() || type == null || !TYPES.contains(type)) {
            return null; // cartão sem id ou de um tipo desconhecido: não dá para desenhar
        }
        ObjectNode node = F.objectNode();
        node.put("id", id);
        node.put("type", type);
        node.put("x", number(n, "x", -MAX_COORD, MAX_COORD, 0));
        node.put("y", number(n, "y", -MAX_COORD, MAX_COORD, 0));
        node.put("width", number(n, "width", 1, MAX_SIZE, 250));
        node.put("height", number(n, "height", 1, MAX_SIZE, 60));
        color(n, node);
        switch (type) {
            case "text" -> node.put("text", orEmpty(text(n, "text", MAX_TEXT)));
            case "file" -> {
                String file = text(n, "file", 1024);
                if (file == null || file.isBlank()) {
                    return null;
                }
                node.put("file", file);
                putIfPresent(node, "subpath", text(n, "subpath", 512));
            }
            case "link" -> {
                String url = text(n, "url", 2048);
                if (url == null || !URL.matcher(url.strip()).matches()) {
                    return null; // só http(s): nada de javascript: ou data:
                }
                node.put("url", url.strip());
            }
            case "group" -> {
                putIfPresent(node, "label", text(n, "label", 512));
                String bg = text(n, "background", 1024);
                if (bg != null && URL.matcher(bg).matches()) {
                    node.put("background", bg);
                }
                String style = text(n, "backgroundStyle", 16);
                if (style != null && BACKGROUND_STYLES.contains(style)) {
                    node.put("backgroundStyle", style);
                }
            }
            default -> {
                return null;
            }
        }
        return node;
    }

    private static ObjectNode cleanEdge(JsonNode e, Set<String> nodeIds) {
        if (!e.isObject()) {
            return null;
        }
        String id = text(e, "id", 128);
        String from = text(e, "fromNode", 128);
        String to = text(e, "toNode", 128);
        if (id == null || id.isBlank() || !nodeIds.contains(from) || !nodeIds.contains(to)) {
            return null; // seta solta (o cartão de uma das pontas não existe)
        }
        ObjectNode edge = F.objectNode();
        edge.put("id", id);
        edge.put("fromNode", from);
        putIfIn(edge, "fromSide", text(e, "fromSide", 8), SIDES);
        putIfIn(edge, "fromEnd", text(e, "fromEnd", 8), ENDS);
        edge.put("toNode", to);
        putIfIn(edge, "toSide", text(e, "toSide", 8), SIDES);
        putIfIn(edge, "toEnd", text(e, "toEnd", 8), ENDS);
        color(e, edge);
        putIfPresent(edge, "label", text(e, "label", 512));
        return edge;
    }

    private static String text(JsonNode n, String field, int max) {
        JsonNode v = n.get(field);
        if (v == null || !v.isString()) {
            return null;
        }
        String s = v.asString();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** JSON Canvas usa números inteiros (pixels); arredonda e prende entre min e max. */
    private static long number(JsonNode n, String field, double min, double max, long fallback) {
        JsonNode v = n.get(field);
        if (v == null || !v.isNumber() || Double.isNaN(v.asDouble()) || Double.isInfinite(v.asDouble())) {
            return fallback;
        }
        return Math.round(Math.max(min, Math.min(max, v.asDouble())));
    }

    private static void color(JsonNode from, ObjectNode to) {
        String c = text(from, "color", 16);
        if (c != null && COLOR.matcher(c).matches()) {
            to.put("color", c);
        }
    }

    private static void putIfPresent(ObjectNode node, String field, String value) {
        if (value != null && !value.isEmpty()) {
            node.put(field, value);
        }
    }

    private static void putIfIn(ObjectNode node, String field, String value, Set<String> allowed) {
        if (value != null && allowed.contains(value)) {
            node.put(field, value);
        }
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
