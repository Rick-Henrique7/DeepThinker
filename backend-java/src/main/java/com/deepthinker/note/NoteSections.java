package com.deepthinker.note;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Trocar uma seção "## Título" de uma nota sem mexer no resto. Usado pelo mapa mental do
 * documento: gerar de novo SUBSTITUI a seção "## Mapa mental" em vez de empilhar outra.
 * Uma seção vai do título até o próximo título do mesmo nível ou maior (# ou ##).
 */
final class NoteSections {

    private static final Pattern HEADING = Pattern.compile("^(#{1,6})\\s+(.*?)\\s*#*\\s*$");

    private NoteSections() {
    }

    /**
     * Devolve o texto com a seção "## heading" trocada por body (ou acrescentada no fim, se não existe).
     * body == null apaga a seção. Títulos dentro de blocos ``` não contam.
     */
    static String withSection(String content, String heading, String body) {
        return withSection(content, heading, body, false);
    }

    /**
     * Igual, mas newAtTop = true põe a seção NOVA no topo (logo depois do cabeçalho de propriedades),
     * em vez de no fim. Bom para uma visão geral, como o mapa mental de um documento longo.
     * Se a seção já existe, ela é trocada onde está.
     */
    static String withSection(String content, String heading, String body, boolean newAtTop) {
        String text = content == null ? "" : content;
        String[] lines = text.split("\n", -1);
        int start = -1;
        int end = lines.length;
        boolean inCode = false;
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].strip().startsWith("```")) {
                inCode = !inCode;
                continue;
            }
            if (inCode) {
                continue;
            }
            Matcher m = HEADING.matcher(lines[i]);
            if (!m.matches()) {
                continue;
            }
            int level = m.group(1).length();
            if (start < 0) {
                if (level == 2 && m.group(2).equalsIgnoreCase(heading)) {
                    start = i;
                }
            } else if (level <= 2) {
                end = i;
                break;
            }
        }
        if (start < 0) {
            if (body == null) {
                return text;
            }
            if (text.isBlank()) {
                return section(heading, body);
            }
            if (!newAtTop) {
                return text.stripTrailing() + "\n\n" + section(heading, body);
            }
            NoteMetadata.Split split = NoteMetadata.split(text);
            String header = text.substring(0, text.length() - split.body().length());
            String rest = split.body().strip();
            return header + section(heading, body) + (rest.isEmpty() ? "" : "\n" + rest + "\n");
        }
        // Junta o que vinha antes, a seção nova (no mesmo lugar da antiga) e o que vinha depois.
        List<String> parts = new ArrayList<>();
        String before = String.join("\n", Arrays.copyOfRange(lines, 0, start)).stripTrailing();
        String after = String.join("\n", Arrays.copyOfRange(lines, end, lines.length)).strip();
        if (!before.isEmpty()) {
            parts.add(before);
        }
        if (body != null) {
            parts.add(section(heading, body).strip());
        }
        if (!after.isEmpty()) {
            parts.add(after);
        }
        return parts.isEmpty() ? "" : String.join("\n\n", parts) + "\n";
    }

    private static String section(String heading, String body) {
        return "## " + heading + "\n\n" + body.strip() + "\n";
    }
}
