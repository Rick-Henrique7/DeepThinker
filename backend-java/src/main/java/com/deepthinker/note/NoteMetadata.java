package com.deepthinker.note;

import com.deepthinker.common.ValidationException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;
import org.yaml.snakeyaml.error.YAMLException;
import org.yaml.snakeyaml.nodes.Tag;
import org.yaml.snakeyaml.representer.Representer;
import org.yaml.snakeyaml.resolver.Resolver;

/**
 * Tags e propriedades, como no Obsidian.
 *
 * As propriedades ficam num cabeçalho em YAML (o "frontmatter") no topo da nota:
 *
 *   ---
 *   status: em andamento
 *   prioridade: 3
 *   tags: [ideia, negocio]
 *   ---
 *   O texto começa aqui. Também vale escrever tags no meio do texto: #ideia
 *
 * Não existe tabela de tags no banco: tudo é lido do próprio texto na hora em que precisa
 * (1000 notas levam poucos milissegundos). O texto continua sendo a única fonte da verdade,
 * e uma nota copiada do Obsidian chega com as propriedades funcionando.
 */
final class NoteMetadata {

    /**
     * O resultado da leitura de uma nota.
     *
     * @param body        o texto sem o cabeçalho
     * @param frontmatter a nota tem cabeçalho ---
     * @param broken      o cabeçalho existe mas não é YAML válido (as propriedades vêm vazias)
     */
    record Parsed(Map<String, Object> properties, List<String> tags, String body, boolean frontmatter, boolean broken) {
    }

    /**
     * #tag: começa no início da linha ou depois de um espaço (assim "site.com/#parte" e "[x](#titulo)"
     * não contam) e aceita letras com acento, números, _, - e / (tags aninhadas, como #projeto/loja).
     * "# Título" não é tag porque tem espaço depois do #.
     */
    static final Pattern TAG = Pattern.compile("(?<!\\S)#([\\p{L}\\p{N}_/-]+)");

    /** Código não tem tags: um "#include" dentro de ``` ou de `crases` fica de fora. */
    private static final Pattern CODE = Pattern.compile("```.*?(?:```|\\z)|`[^`\\n]*`", Pattern.DOTALL);

    private static final int MAX_KEY = 64;
    private static final int MAX_VALUE = 2000;

    private NoteMetadata() {
    }

    // ---------------------------------------------------------------- leitura

    static Parsed parse(String content) {
        Split split = split(content == null ? "" : content);
        Map<String, Object> properties = new LinkedHashMap<>();
        boolean broken = false;
        if (split.yaml() != null) {
            try {
                properties = load(split.yaml());
            } catch (YAMLException | IllegalArgumentException e) {
                broken = true;
            }
        }

        // A propriedade "tags" fica limpa (lista em minúsculas, sempre com esse nome) e o campo tags
        // junta as do cabeçalho com as #tags escritas no texto.
        Set<String> tags = new LinkedHashSet<>();
        Map<String, Object> clean = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : properties.entrySet()) {
            if (isTagsKey(e.getKey())) {
                List<String> header = cleanTags(e.getValue());
                tags.addAll(header);
                if (!header.isEmpty()) {
                    clean.put("tags", header);
                }
            } else {
                clean.put(e.getKey(), e.getValue());
            }
        }
        tags.addAll(inlineTags(split.body()));
        return new Parsed(clean, List.copyOf(tags), split.body(), split.yaml() != null, broken);
    }

    /** As #tags escritas no texto, em minúsculas e sem repetir. */
    static List<String> inlineTags(String body) {
        if (body == null || body.indexOf('#') < 0) {
            return List.of();
        }
        String withoutCode = CODE.matcher(body).replaceAll(" ");
        Set<String> found = new LinkedHashSet<>();
        Matcher m = TAG.matcher(withoutCode);
        while (m.find()) {
            String tag = cleanTag(m.group(1));
            if (tag != null) {
                found.add(tag);
            }
        }
        return List.copyOf(found);
    }

    /** "#Projeto/Loja-" vira "projeto/loja". Só número ("#2026") não é tag, igual ao Obsidian. */
    static String cleanTag(String raw) {
        if (raw == null) {
            return null;
        }
        String tag = raw.strip();
        while (tag.startsWith("#")) {
            tag = tag.substring(1);
        }
        tag = tag.replaceAll("[/-]+$", "").toLowerCase(Locale.ROOT);
        if (tag.isEmpty() || tag.chars().allMatch(Character::isDigit)) {
            return null;
        }
        return tag;
    }

    /** A propriedade tags pode vir como lista ([a, b]) ou como texto ("a, b" ou "a b"). */
    private static List<String> cleanTags(Object value) {
        List<String> raw = new ArrayList<>();
        if (value instanceof List<?> list) {
            list.forEach(v -> {
                if (v != null) {
                    raw.add(String.valueOf(v));
                }
            });
        } else if (value != null) {
            raw.addAll(List.of(String.valueOf(value).split("[,\\s]+")));
        }
        Set<String> clean = new LinkedHashSet<>();
        for (String r : raw) {
            String tag = cleanTag(r);
            if (tag != null) {
                clean.add(tag);
            }
        }
        return List.copyOf(clean);
    }

    /** O Obsidian aceitava "tag" e "Tags"; hoje grava sempre "tags". */
    private static boolean isTagsKey(String key) {
        return key.equalsIgnoreCase("tags") || key.equalsIgnoreCase("tag");
    }

    // ---------------------------------------------------------------- escrita

    /**
     * Muda propriedades no estilo "JSON Merge Patch" (RFC 7396): cada chave do patch troca ou
     * acrescenta aquela propriedade, e valor null apaga. O resto do cabeçalho e o texto ficam como estão.
     * Devolve o novo conteúdo da nota.
     */
    static String withProperties(String content, Map<String, Object> patch) {
        Split split = split(content == null ? "" : content);
        Map<String, Object> props;
        try {
            props = split.yaml() == null ? new LinkedHashMap<>() : load(split.yaml());
        } catch (YAMLException | IllegalArgumentException e) {
            // Melhor recusar do que reescrever um cabeçalho que não entendemos e perder o que a pessoa escreveu.
            throw ValidationException.of("properties",
                    "O cabeçalho (entre as linhas ---) desta nota não é YAML válido. Corrija no modo Editar.");
        }

        for (Map.Entry<String, Object> e : patch.entrySet()) {
            String key = e.getKey() == null ? "" : e.getKey().strip();
            if (key.isEmpty() || key.length() > MAX_KEY || key.contains("\n")) {
                throw ValidationException.of("properties", "Nome de propriedade inválido: '" + key + "'.");
            }
            Object value = normalizeValue(e.getValue());
            if (isTagsKey(key)) {
                List<String> tags = cleanTags(value);
                value = tags.isEmpty() ? null : tags;
                String existing = props.keySet().stream().filter(NoteMetadata::isTagsKey).findFirst().orElse(null);
                props = renameKey(props, existing, "tags");
                key = "tags";
            }
            if (value == null) {
                props.remove(key);
            } else {
                props.put(key, value);
            }
        }

        if (props.isEmpty()) {
            return split.body(); // sem propriedades, sem cabeçalho
        }
        return "---\n" + yaml().dump(props) + "---\n" + split.body();
    }

    /** Troca o nome de uma chave mantendo a posição dela (LinkedHashMap guarda a ordem de inserção). */
    private static Map<String, Object> renameKey(Map<String, Object> props, String from, String to) {
        if (from == null || from.equals(to)) {
            return props;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        props.forEach((k, v) -> out.put(k.equals(from) ? to : k, v));
        return out;
    }

    /** O JSON chega com tipos do Jackson; o YAML só precisa de texto, número, sim/não e listas. */
    private static Object normalizeValue(Object value) {
        if (value == null || value instanceof Boolean) {
            return value;
        }
        if (value instanceof BigDecimal || value instanceof Float) {
            return ((Number) value).doubleValue();
        }
        if (value instanceof BigInteger || value instanceof Integer || value instanceof Short) {
            return ((Number) value).longValue();
        }
        if (value instanceof Number) {
            return value;
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object v : list) {
                Object n = normalizeValue(v);
                if (n instanceof List || n instanceof Map) {
                    throw ValidationException.of("properties", "Listas dentro de listas não são aceitas.");
                }
                if (n != null) {
                    out.add(n);
                }
            }
            return out;
        }
        if (value instanceof Map) {
            throw ValidationException.of("properties", "Use texto, número, sim/não ou lista como valor.");
        }
        String text = String.valueOf(value);
        if (text.length() > MAX_VALUE) {
            throw ValidationException.of("properties", "O valor pode ter no máximo " + MAX_VALUE + " caracteres.");
        }
        return text;
    }

    // ---------------------------------------------------------------- YAML

    /** O cabeçalho (sem as linhas ---) e o resto do texto. yaml = null quando não há cabeçalho. */
    record Split(String yaml, String body) {
    }

    /**
     * Igual ao Obsidian: só é cabeçalho se a PRIMEIRA linha for exatamente --- e existir outra
     * linha --- fechando. Sem a de fechamento, é só uma linha horizontal do Markdown.
     */
    static Split split(String content) {
        if (!content.startsWith("---")) {
            return new Split(null, content);
        }
        int firstEnd = content.indexOf('\n');
        if (firstEnd < 0 || !content.substring(0, firstEnd).strip().equals("---")) {
            return new Split(null, content);
        }
        int pos = firstEnd + 1;
        while (pos <= content.length()) {
            int end = content.indexOf('\n', pos);
            String line = end < 0 ? content.substring(pos) : content.substring(pos, end);
            if (line.strip().equals("---")) {
                return new Split(content.substring(firstEnd + 1, pos), end < 0 ? "" : content.substring(end + 1));
            }
            if (end < 0) {
                break;
            }
            pos = end + 1;
        }
        return new Split(null, content);
    }

    private static Map<String, Object> load(String yamlText) {
        Object root = yaml().load(yamlText);
        Map<String, Object> out = new LinkedHashMap<>();
        if (root == null) {
            return out;
        }
        if (!(root instanceof Map<?, ?> map)) {
            throw new IllegalArgumentException("O cabeçalho não é uma lista de propriedades.");
        }
        map.forEach((k, v) -> out.put(String.valueOf(k), v));
        return out;
    }

    /**
     * Um leitor/escritor de YAML seguro e previsível. A biblioteca é a SnakeYAML, a mesma que o
     * Spring usa para ler o application.yml. Três cuidados:
     *
     * 1. SafeConstructor: o YAML "completo" pode mandar criar qualquer classe Java (!!java.net.URL...),
     *    um ataque conhecido. O modo seguro só cria texto, número, lista e mapa.
     * 2. Limites de tamanho e de "aliases" (&a / *a), contra o ataque "billion laughs".
     * 3. O YAML 1.1 (o padrão da SnakeYAML) entende "no" como false e "10:30" como o número 630.
     *    O Obsidian segue o YAML 1.2, então ensinamos só true/false e números decimais comuns,
     *    e datas como 2026-10-16 continuam texto (o frontend sabe mostrar como data).
     *
     * Um objeto Yaml não pode ser usado por duas threads ao mesmo tempo, então criamos um por uso (é barato).
     */
    private static Yaml yaml() {
        LoaderOptions loader = new LoaderOptions();
        loader.setCodePointLimit(64 * 1024);
        loader.setMaxAliasesForCollections(20);
        loader.setNestingDepthLimit(10);
        loader.setAllowDuplicateKeys(true);

        DumperOptions dumper = new DumperOptions();
        dumper.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        dumper.setIndent(2);
        dumper.setIndicatorIndent(2);
        dumper.setIndentWithIndicator(true);
        dumper.setSplitLines(false);
        dumper.setAllowUnicode(true);

        return new Yaml(new SafeConstructor(loader), new Representer(dumper), dumper, loader, new Yaml12Resolver());
    }

    /** Só os tipos do YAML 1.2 "core", que é o que o Obsidian entende. */
    private static final class Yaml12Resolver extends Resolver {
        private static final Pattern BOOL = Pattern.compile("^(?:true|True|TRUE|false|False|FALSE)$");
        private static final Pattern INT = Pattern.compile("^[-+]?(?:0|[1-9][0-9]*)$");
        private static final Pattern FLOAT = Pattern.compile("^[-+]?(?:[0-9]+\\.[0-9]*|\\.[0-9]+)(?:[eE][-+]?[0-9]+)?$");
        private static final Pattern NULL = Pattern.compile("^(?:~|null|Null|NULL| )$");

        @Override
        protected void addImplicitResolvers() {
            addImplicitResolver(Tag.BOOL, BOOL, "tTfF");
            addImplicitResolver(Tag.INT, INT, "-+0123456789");
            addImplicitResolver(Tag.FLOAT, FLOAT, "-+0123456789.");
            addImplicitResolver(Tag.NULL, NULL, "~nN\0");
            addImplicitResolver(Tag.NULL, Resolver.EMPTY, null);
        }
    }
}
