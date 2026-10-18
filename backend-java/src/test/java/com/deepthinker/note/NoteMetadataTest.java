package com.deepthinker.note;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.deepthinker.common.ValidationException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Leitura e escrita do cabeçalho YAML e das #tags (sem Spring: roda em milissegundos). */
class NoteMetadataTest {

    @Test
    void readsTypedPropertiesLikeObsidian() {
        String content = """
                ---
                status: em andamento
                prioridade: 3
                nota: 7.5
                feito: false
                prazo: 2026-10-20
                resposta: no
                hora: 10:30
                codigo: 0123
                tags: [Ideia, "#negocio"]
                ---
                Texto da nota.
                """;
        NoteMetadata.Parsed p = NoteMetadata.parse(content);

        assertThat(p.frontmatter()).isTrue();
        assertThat(p.broken()).isFalse();
        assertThat(p.properties())
                .containsEntry("status", "em andamento")
                .containsEntry("prioridade", 3)
                .containsEntry("nota", 7.5)
                .containsEntry("feito", false)
                // YAML 1.2, como no Obsidian: datas, "no", horas e números com zero na frente continuam texto.
                .containsEntry("prazo", "2026-10-20")
                .containsEntry("resposta", "no")
                .containsEntry("hora", "10:30")
                .containsEntry("codigo", "0123")
                .containsEntry("tags", List.of("ideia", "negocio"));
        assertThat(p.tags()).containsExactly("ideia", "negocio");
        assertThat(p.body()).isEqualTo("Texto da nota.\n");
    }

    @Test
    void inlineTagsFollowObsidianRules() {
        String body = """
                # Título não é tag
                Pensando em #ideia e #Projeto/Loja, e de novo #ideia.
                Link [ver](#secao), site https://exemplo.com/#parte e #2026 não contam.
                Mas #decisão com acento conta.
                `#codigo` e
                ```
                #include <stdio.h>
                ```
                """;
        assertThat(NoteMetadata.parse(body).tags()).containsExactly("ideia", "projeto/loja", "decisão");
    }

    @Test
    void brokenHeaderKeepsTheTextAndIsFlagged() {
        NoteMetadata.Parsed p = NoteMetadata.parse("---\nisto: [não fecha\n---\nCorpo");
        assertThat(p.broken()).isTrue();
        assertThat(p.properties()).isEmpty();
        assertThat(p.body()).isEqualTo("Corpo");

        // Sem a linha --- de fechamento não é cabeçalho, é só uma linha horizontal.
        NoteMetadata.Parsed rule = NoteMetadata.parse("---\nSó um separador");
        assertThat(rule.frontmatter()).isFalse();
        assertThat(rule.body()).isEqualTo("---\nSó um separador");
    }

    @Test
    void writesObsidianStyleHeaderAndKeepsTheText() {
        String written = NoteMetadata.withProperties("Meu texto #ideia", props("status", "a fazer", "prioridade", 2));
        assertThat(written).isEqualTo("---\nstatus: a fazer\nprioridade: 2\n---\nMeu texto #ideia");

        // Trocar mantém a ordem; null apaga; lista de tags vira lista em blocos (como o Obsidian grava).
        String changed = NoteMetadata.withProperties(written,
                props("status", "feito", "prioridade", null, "tags", List.of("Ideia", "#Leitura")));
        assertThat(changed).isEqualTo("---\nstatus: feito\ntags:\n  - ideia\n  - leitura\n---\nMeu texto #ideia");

        // Sem nenhuma propriedade, o cabeçalho some.
        assertThat(NoteMetadata.withProperties(changed, props("status", null, "tags", List.of())))
                .isEqualTo("Meu texto #ideia");
    }

    @Test
    void textThatLooksLikeANumberStaysText() {
        String written = NoteMetadata.withProperties("", props("ano", "2026", "ativo", "true", "quando", "2026-10-20"));
        Map<String, Object> back = NoteMetadata.parse(written).properties();
        assertThat(back).containsEntry("ano", "2026").containsEntry("ativo", "true").containsEntry("quando", "2026-10-20");
    }

    @Test
    void oldTagKeyIsRenamedInPlace() {
        String content = "---\nTags: ideia\nstatus: a fazer\n---\nx";
        assertThat(NoteMetadata.withProperties(content, props("tags", List.of("ideia", "nova"))))
                .isEqualTo("---\ntags:\n  - ideia\n  - nova\nstatus: a fazer\n---\nx");
    }

    @Test
    void refusesToRewriteABrokenHeader() {
        assertThatThrownBy(() -> NoteMetadata.withProperties("---\na: [x\n---\ny", props("b", 1)))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void unsafeYamlIsNotExecuted() {
        // O YAML "completo" criaria um objeto Java aqui; o modo seguro recusa e a nota só fica sem propriedades.
        NoteMetadata.Parsed p = NoteMetadata.parse("---\nx: !!java.net.URL [\"http://exemplo.com\"]\n---\nok");
        assertThat(p.broken()).isTrue();
        assertThat(p.body()).isEqualTo("ok");
    }

    private static Map<String, Object> props(Object... kv) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], kv[i + 1]);
        }
        return map;
    }
}
