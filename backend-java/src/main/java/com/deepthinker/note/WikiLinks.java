package com.deepthinker.note;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Regras dos links [[...]] num lugar só, para o backend e o frontend concordarem.
 *
 * Igual ao Obsidian, um link pode ter "apelido": [[Título da nota|texto que aparece]].
 * O que vale para ligar as notas é só a parte antes da barra.
 */
final class WikiLinks {

    /** Captura o texto entre [[ e ]]. O "?" deixa a busca "preguiçosa": para no primeiro ]]. */
    static final Pattern LINK = Pattern.compile("\\[\\[(.*?)]]");

    private WikiLinks() {
    }

    /** "Medo de falir|medo" vira "Medo de falir". */
    static String target(String inner) {
        int bar = inner.indexOf('|');
        return (bar >= 0 ? inner.substring(0, bar) : inner).trim();
    }

    /**
     * Para quais títulos o link pode apontar. [[Nota#Seção]] aponta para uma parte da "Nota",
     * então vale "Nota". Mas um título também pode ter # de verdade ("C# na prática"),
     * por isso devolvemos as duas opções e fica a que existir.
     */
    static List<String> targets(String inner) {
        String full = target(inner);
        int hash = full.indexOf('#');
        if (hash <= 0) {
            return List.of(full);
        }
        String note = full.substring(0, hash).trim();
        return note.isEmpty() ? List.of(full) : List.of(full, note);
    }

    /**
     * Onde o título aparece escrito "solto" no texto, sem [[ ]] em volta.
     * Ignora maiúsculas e só aceita a palavra inteira: "arte" não casa dentro de "parte".
     * Devolve a posição, ou -1 se não achar.
     */
    static int plainMention(String content, String title) {
        if (content == null || title == null || title.isBlank()) {
            return -1;
        }
        List<int[]> insideLinks = new ArrayList<>();
        Matcher m = LINK.matcher(content);
        while (m.find()) {
            insideLinks.add(new int[] {m.start(), m.end()});
        }
        String haystack = content.toLowerCase(Locale.ROOT);
        String needle = title.toLowerCase(Locale.ROOT);
        int from = 0;
        while (true) {
            int at = haystack.indexOf(needle, from);
            if (at < 0) {
                return -1;
            }
            int end = at + needle.length();
            boolean wholeWord = (at == 0 || !Character.isLetterOrDigit(content.charAt(at - 1)))
                    && (end == content.length() || !Character.isLetterOrDigit(content.charAt(end)));
            boolean linked = insideLinks.stream().anyMatch(r -> at >= r[0] && at < r[1]);
            if (wholeWord && !linked) {
                return at;
            }
            from = at + 1;
        }
    }

    /** Um pedaço do texto em volta da posição, para mostrar onde a nota foi citada. */
    static String snippet(String content, int at, int length) {
        if (content == null || content.isEmpty()) {
            return "";
        }
        int start = Math.max(0, at - 60);
        int end = Math.min(content.length(), at + length + 60);
        String cut = content.substring(start, end).replaceAll("\\s+", " ").trim();
        return (start > 0 ? "…" : "") + cut + (end < content.length() ? "…" : "");
    }
}
