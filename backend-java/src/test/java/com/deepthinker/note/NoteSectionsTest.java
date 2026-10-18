package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Trocar, acrescentar e apagar uma seção "## Título" sem mexer no resto da nota. */
class NoteSectionsTest {

    @Test
    void appendsWhenTheSectionDoesNotExist() {
        assertThat(NoteSections.withSection("Texto.", "Mapa mental", "desenho"))
                .isEqualTo("Texto.\n\n## Mapa mental\n\ndesenho\n");
        assertThat(NoteSections.withSection("", "Mapa mental", "desenho")).isEqualTo("## Mapa mental\n\ndesenho\n");
    }

    @Test
    void replacesInPlaceUntilTheNextHeadingOfTheSameLevel() {
        String note = "Intro\n\n## mapa MENTAL\n\nantigo\n\n### Detalhe do mapa\n\nmais antigo\n\n## Depois\n\nfica";
        assertThat(NoteSections.withSection(note, "Mapa mental", "novo"))
                .isEqualTo("Intro\n\n## Mapa mental\n\nnovo\n\n## Depois\n\nfica\n");
    }

    @Test
    void headingsInsideCodeBlocksDoNotCount() {
        String note = "## Mapa mental\n\n```mermaid\n## não é título\n```\n\n## Fim\n\nok";
        assertThat(NoteSections.withSection(note, "Mapa mental", "x")).isEqualTo("## Mapa mental\n\nx\n\n## Fim\n\nok\n");
        // Um "## Mapa mental" dentro de código não é a seção: acrescenta uma de verdade no fim.
        assertThat(NoteSections.withSection("```\n## Mapa mental\n```", "Mapa mental", "x"))
                .isEqualTo("```\n## Mapa mental\n```\n\n## Mapa mental\n\nx\n");
    }

    @Test
    void nullBodyRemovesTheSection() {
        assertThat(NoteSections.withSection("A\n\n## Mapa mental\n\nvelho\n\n## B\n\nb", "Mapa mental", null))
                .isEqualTo("A\n\n## B\n\nb\n");
        assertThat(NoteSections.withSection("só texto", "Mapa mental", null)).isEqualTo("só texto");
        assertThat(NoteSections.withSection(null, "Mapa mental", null)).isEmpty();
    }

    @Test
    void newAtTopGoesRightAfterTheProperties() {
        assertThat(NoteSections.withSection("---\ntipo: livro\n---\nTexto longo.", "Mapa mental", "x", true))
                .isEqualTo("---\ntipo: livro\n---\n## Mapa mental\n\nx\n\nTexto longo.\n");
        assertThat(NoteSections.withSection("Texto longo.", "Mapa mental", "x", true))
                .isEqualTo("## Mapa mental\n\nx\n\nTexto longo.\n");
        // Já existe: troca onde está, mesmo que seja no fim.
        assertThat(NoteSections.withSection("Texto.\n\n## Mapa mental\n\nvelho", "Mapa mental", "novo", true))
                .isEqualTo("Texto.\n\n## Mapa mental\n\nnovo\n");
    }
}
