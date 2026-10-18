package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Testes de unidade: rodam sem subir o Spring, por isso são instantâneos. */
class KnowledgeExtractorTest {

    private final KnowledgeExtractor service =
            new KnowledgeExtractor(null, null, null, null, JsonMapper.builder().build(), null);

    @Test
    void normalizeRemovesAccentsCaseAndExtraSpaces() {
        assertThat(KnowledgeExtractor.normalize("  Ação   Rápida ")).isEqualTo("acao rapida");
        assertThat(KnowledgeExtractor.normalize("CORAÇÃO")).isEqualTo(KnowledgeExtractor.normalize("coracao"));
    }

    @Test
    void parsesJsonWithFencesOrSurroundingText() {
        assertThat(service.parseLenient("```json\n{\"title\":\"a\"}\n```")).containsEntry("title", "a");
        assertThat(service.parseLenient("Claro! Aqui está: {\"title\":\"b\"} espero ter ajudado"))
                .containsEntry("title", "b");
        assertThat(service.parseLenient("sem json nenhum")).isNull();
    }
}
