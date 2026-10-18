package com.deepthinker.mcp;

import com.deepthinker.common.NotFoundException;
import com.deepthinker.common.ValidationException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * Servidor MCP (Model Context Protocol) do Deep thinker: POST /mcp.
 *
 * É assim que IAs de fora (Claude Desktop, Claude Code, Cursor...) usam o app. O transporte
 * é o "Streamable HTTP" do MCP na forma mais simples: cada POST traz uma mensagem JSON-RPC
 * e a resposta volta como JSON comum (sem stream, que o protocolo deixa opcional).
 * Não guardamos sessão: cada chamada se autentica com o token pessoal "dt_...".
 *
 * As ferramentas ficam em McpTools.
 */
@RestController
public class McpController {

    private static final Logger log = LoggerFactory.getLogger(McpController.class);
    /** Versões do protocolo que entendemos, da mais nova para a mais antiga. */
    private static final List<String> VERSIONS = List.of("2025-06-18", "2025-03-26");

    private final McpTools tools;
    private final JsonMapper json;
    private final List<String> allowedOrigins;

    public McpController(McpTools tools, JsonMapper json,
                         @Value("${deepthinker.frontend-origin}") String[] origins) {
        this.tools = tools;
        this.json = json;
        this.allowedOrigins = List.of(origins);
    }

    @PostMapping(value = "/mcp", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Object> handle(@RequestBody Map<String, Object> msg,
                                         @RequestHeader(value = "Origin", required = false) String origin) {
        // Proteção contra "DNS rebinding" pedida pelo MCP: página de outro site não fala com o servidor
        if (origin != null && !allowedOrigins.contains(origin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(null, -32600, "Origem não permitida."));
        }
        Object id = msg.get("id");
        String method = String.valueOf(msg.get("method"));
        if (id == null) {
            // Notificação (ex.: notifications/initialized): não tem resposta
            return ResponseEntity.accepted().build();
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> params = msg.get("params") instanceof Map<?, ?> p ? (Map<String, Object>) p : Map.of();
        return ResponseEntity.ok(switch (method) {
            case "initialize" -> result(id, initialize(params));
            case "ping" -> result(id, Map.of());
            case "tools/list" -> result(id, Map.of("tools", tools.list()));
            case "tools/call" -> result(id, call(params));
            default -> error(id, -32601, "Método não suportado: " + method);
        });
    }

    private Map<String, Object> initialize(Map<String, Object> params) {
        String asked = String.valueOf(params.get("protocolVersion"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("protocolVersion", VERSIONS.contains(asked) ? asked : VERSIONS.getFirst());
        out.put("capabilities", Map.of("tools", Map.of("listChanged", false)));
        out.put("serverInfo", Map.of("name", "deep-thinker", "title", "Deep thinker", "version", "0.1.0"));
        out.put("instructions", "Deep thinker é um app de notas em grafo, com Quadro Kanban. "
                + "Use list_notes ou get_board para achar ids. navigate, open_note e move_card acontecem "
                + "ao vivo na tela da pessoa: faça uma ação por vez e conte o que está fazendo.");
        return out;
    }

    private Map<String, Object> call(Map<String, Object> params) {
        String name = String.valueOf(params.get("name"));
        @SuppressWarnings("unchecked")
        Map<String, Object> args = params.get("arguments") instanceof Map<?, ?> a ? (Map<String, Object>) a : Map.of();
        try {
            Object out = tools.call(name, args, agentName());
            return Map.of("content", List.of(text(json.writeValueAsString(out))), "isError", false);
        } catch (McpToolException | NotFoundException | ValidationException e) {
            return Map.of("content", List.of(text(e.getMessage())), "isError", true);
        } catch (RuntimeException e) {
            log.warn("Ferramenta MCP {} falhou", name, e);
            return Map.of("content", List.of(text("Erro interno ao executar " + name + ".")), "isError", true);
        }
    }

    /** Nome que aparece no cursor e na faixa "... está controlando": o nome dado ao token. */
    private static String agentName() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken t
                && t.getToken().getClaim("pat_name") instanceof String name && !name.isBlank()) {
            return name;
        }
        return "IA";
    }

    private static Map<String, Object> text(String s) {
        return Map.of("type", "text", "text", s);
    }

    private static Map<String, Object> result(Object id, Object result) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        out.put("result", result);
        return out;
    }

    private static Map<String, Object> error(Object id, int code, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("jsonrpc", "2.0");
        out.put("id", id);
        out.put("error", Map.of("code", code, "message", message));
        return out;
    }
}
