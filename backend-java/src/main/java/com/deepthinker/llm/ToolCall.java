package com.deepthinker.llm;

/**
 * Pedido da IA para executar uma ferramenta, no formato da OpenAI:
 * { "id": "...", "type": "function", "function": { "name": "...", "arguments": "{json}" } }.
 */
public record ToolCall(String id, String type, Function function) {

    public record Function(String name, String arguments) {
    }
}
