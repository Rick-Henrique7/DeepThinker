package com.deepthinker.mcp;

/** Erro de uso de uma ferramenta MCP: volta para a IA como resultado com isError, não como falha do servidor. */
public class McpToolException extends RuntimeException {

    public McpToolException(String message) {
        super(message);
    }
}
