package com.deepthinker.note;

import com.deepthinker.common.ValidationException;
import com.deepthinker.llm.LlmClient.Message;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * "Criar resumo": transforma a conversa do chat em notas ligadas.
 * O trabalho pesado (IA + gravação) fica no KnowledgeExtractor.
 */
@Service
public class SummarizeService {

    public record SummarizeRequest(
            List<Message> messages,
            String mode,
            String sessionId,
            String provider,
            String model) {
    }

    public record SummarizeResult(NoteDtos.NoteDetail note, int created, int reused) {
    }

    private final KnowledgeExtractor extractor;

    public SummarizeService(KnowledgeExtractor extractor) {
        this.extractor = extractor;
    }

    public SummarizeResult summarize(SummarizeRequest req) {
        validate(req);

        StringBuilder conversation = new StringBuilder();
        int userCount = 0;
        int assistantCount = 0;
        for (Message m : req.messages()) {
            if ("system".equals(m.role())) {
                continue;
            }
            conversation.append(m.role().toUpperCase(Locale.ROOT)).append(": ").append(m.content()).append("\n\n");
            if ("user".equals(m.role())) userCount++;
            if ("assistant".equals(m.role())) assistantCount++;
        }
        String text = KnowledgeExtractor.truncateForLlm(conversation.toString(), "conversa truncada");

        Map<String, Object> parsed = extractor.extract("a conversa", "Conversa", text, req.model());
        if (parsed == null) {
            throw ValidationException.of("messages", "A IA não retornou um JSON válido. Tente de novo.");
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("mode", req.mode() == null ? "socratic" : req.mode());
        meta.put("message_count", req.messages().size());
        meta.put("user_messages", userCount);
        meta.put("assistant_messages", assistantCount);
        meta.put("provider", req.provider());
        meta.put("model", req.model());
        meta.put("session_id", req.sessionId());
        meta.put("created_via", "summarize");

        KnowledgeExtractor.Linked linked = extractor.saveLinked(
                parsed, "Resumo Advogado do Diabo", text, "", "conversation", meta);
        return new SummarizeResult(NoteDtos.NoteDetail.of(linked.note(), null), linked.created(), linked.reused());
    }

    private static void validate(SummarizeRequest req) {
        if (req == null || req.messages() == null || req.messages().size() < 2) {
            throw ValidationException.of("messages", "Envie pelo menos 2 mensagens.");
        }
        for (Message m : req.messages()) {
            if (m.role() == null || !List.of("user", "assistant", "system").contains(m.role())) {
                throw ValidationException.of("messages", "role deve ser user, assistant ou system.");
            }
            if (m.content() == null || m.content().isEmpty()) {
                throw ValidationException.of("messages", "Toda mensagem precisa de content.");
            }
        }
        if (req.mode() != null && !List.of("socratic", "critic", "brainstorm").contains(req.mode())) {
            throw ValidationException.of("mode", "mode deve ser socratic, critic ou brainstorm.");
        }
    }
}
