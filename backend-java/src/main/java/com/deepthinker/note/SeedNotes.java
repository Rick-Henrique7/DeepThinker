package com.deepthinker.note;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Gera um "segundo cérebro" de mentira, em português, para testar o app com muitos dados.
 * Não toca no banco: só devolve a lista de notas. Quem grava é o {@link NoteSeeder}.
 *
 * O formato imita como as pessoas usam o app de verdade, para o grafo ficar realista:
 * - "Mapa: Área" lista os temas daquela área (12 mapas);
 * - uma nota central por tema, ligada ao mapa, a temas vizinhos e às notas do tema (144);
 * - notas de diário que citam o que foi estudado no dia (60);
 * - o resto são notas sobre um aspecto de um tema ("Estoicismo: erros comuns"),
 *   que citam a nota central, um tema vizinho e às vezes um tema de outra área.
 *
 * As ligações são escritas como [[Título]] no conteúdo; o NoteService transforma
 * isso em conexões, exatamente como acontece quando você digita uma nota.
 *
 * O Random tem semente fixa: rodar duas vezes gera exatamente as mesmas notas.
 */
final class SeedNotes {

    /** Uma nota a criar. daysAgo diz há quantos dias ela "foi escrita". */
    record Item(String title, String content, String summary, int daysAgo) {
    }

    private record Area(String name, String about, List<String> concepts) {
    }

    private static final List<Area> AREAS = List.of(
            new Area("Filosofia", "ajuda a pensar sobre como viver, o que podemos saber e o que vale a pena",
                    List.of("Estoicismo", "Existencialismo", "Ética", "Epistemologia", "Lógica", "Metafísica",
                            "Fenomenologia", "Utilitarismo", "Racionalismo", "Empirismo", "Niilismo", "Livre-arbítrio")),
            new Area("Psicologia", "explica como a mente funciona no dia a dia, com seus atalhos e limites",
                    List.of("Memória de trabalho", "Viés de confirmação", "Hábitos", "Motivação intrínseca", "Atenção",
                            "Ansiedade", "Flow", "Inteligência emocional", "Dissonância cognitiva",
                            "Aprendizagem espaçada", "Sono e cognição", "Resiliência")),
            new Area("Programação", "reúne o que aprendo construindo software, em especial o próprio DeepThinker",
                    List.of("Java", "Spring Boot", "Orientação a objetos", "Programação funcional", "Testes automatizados",
                            "Injeção de dependência", "Estruturas de dados", "Algoritmos de ordenação", "Git",
                            "Refatoração", "Concorrência", "APIs REST")),
            new Area("Dados e IA", "trata de como máquinas aprendem com dados e de como organizar informação",
                    List.of("Aprendizado de máquina", "Redes neurais", "Modelos de linguagem", "Embeddings",
                            "Regressão linear", "Overfitting", "Engenharia de prompts", "Bancos de dados relacionais",
                            "SQL", "Grafos de conhecimento", "Estatística descritiva", "Visualização de dados")),
            new Area("Biologia", "estuda a vida, das células aos ecossistemas",
                    List.of("Fotossíntese", "Evolução", "DNA", "Célula", "Ecossistemas", "Sistema imunológico",
                            "Neurônios", "Microbioma", "Genética mendeliana", "Biodiversidade", "Metabolismo", "Homeostase")),
            new Area("Física", "descreve as regras que o universo segue, do átomo às galáxias",
                    List.of("Leis de Newton", "Termodinâmica", "Entropia", "Relatividade", "Mecânica quântica",
                            "Eletromagnetismo", "Ondas", "Energia", "Gravidade", "Óptica", "Física nuclear", "Teoria do caos")),
            new Area("História", "conta como chegamos até aqui e por que as coisas são como são",
                    List.of("Revolução Industrial", "Renascimento", "Iluminismo", "Império Romano", "Grécia Antiga",
                            "Revolução Francesa", "Guerra Fria", "Brasil Colônia", "Independência do Brasil",
                            "Idade Média", "Grandes Navegações", "Era Vargas")),
            new Area("Economia", "ajuda a entender escolhas, preços e dinheiro, no país e em casa",
                    List.of("Inflação", "Juros compostos", "Oferta e demanda", "Custo de oportunidade", "PIB",
                            "Política monetária", "Teoria dos jogos", "Economia comportamental", "Mercado de ações",
                            "Diversificação", "Orçamento pessoal", "Reserva de emergência")),
            new Area("Produtividade", "guarda os métodos que testo para estudar e trabalhar melhor",
                    List.of("Método Zettelkasten", "GTD", "Técnica Pomodoro", "Segundo cérebro", "Revisão semanal",
                            "Matriz de Eisenhower", "Trabalho focado", "Anotações atômicas", "Mapas mentais",
                            "Leitura ativa", "Metas SMART", "Diário de bordo")),
            new Area("Literatura", "junta autores, movimentos e técnicas narrativas que me marcaram",
                    List.of("Machado de Assis", "Clarice Lispector", "Guimarães Rosa", "Realismo", "Modernismo",
                            "Romantismo", "Narrador não confiável", "Poesia concreta", "Fernando Pessoa", "Distopias",
                            "Jornada do herói", "Crônica")),
            new Area("Saúde", "cuida do corpo e da mente que sustentam todo o resto",
                    List.of("Exercício aeróbico", "Musculação", "Nutrição", "Hidratação", "Meditação", "Postura",
                            "Jejum intermitente", "Higiene do sono", "Saúde mental", "Microbiota intestinal",
                            "Alongamento", "Estresse crônico")),
            new Area("Matemática", "é a linguagem por trás de quase tudo nas outras áreas",
                    List.of("Probabilidade", "Cálculo diferencial", "Álgebra linear", "Teoria dos grafos",
                            "Números primos", "Geometria euclidiana", "Funções exponenciais", "Logaritmos",
                            "Estatística bayesiana", "Combinatória", "Limites", "Matrizes")));

    /** Pontes conhecidas entre áreas diferentes: deixam o grafo com "atalhos" como um real. */
    private static final String[][] BRIDGES = {
            {"Neurônios", "Redes neurais"}, {"Teoria dos grafos", "Grafos de conhecimento"},
            {"Estatística bayesiana", "Aprendizado de máquina"}, {"Juros compostos", "Funções exponenciais"},
            {"Estoicismo", "Resiliência"}, {"Meditação", "Atenção"}, {"Método Zettelkasten", "Grafos de conhecimento"},
            {"Aprendizagem espaçada", "Anotações atômicas"}, {"Economia comportamental", "Viés de confirmação"},
            {"Utilitarismo", "Economia comportamental"}, {"Teoria dos jogos", "Probabilidade"},
            {"Sono e cognição", "Higiene do sono"}, {"Hábitos", "Técnica Pomodoro"}, {"Flow", "Trabalho focado"},
            {"Existencialismo", "Clarice Lispector"}, {"Fenomenologia", "Clarice Lispector"},
            {"Iluminismo", "Racionalismo"}, {"Revolução Industrial", "Termodinâmica"},
            {"Microbioma", "Microbiota intestinal"}, {"Estresse crônico", "Ansiedade"},
            {"Embeddings", "Álgebra linear"}, {"Lógica", "Estruturas de dados"}, {"Evolução", "Teoria dos jogos"},
            {"Entropia", "Teoria do caos"}, {"Saúde mental", "Inteligência emocional"},
            {"Grécia Antiga", "Estoicismo"}, {"Renascimento", "Geometria euclidiana"}, {"Distopias", "Guerra Fria"},
            {"Segundo cérebro", "Modelos de linguagem"}, {"Regressão linear", "Cálculo diferencial"},
    };

    /** Aspectos de um tema. Cada um vira uma nota "Tema: aspecto". */
    private static final List<String> FACETS = List.of(
            "conceitos básicos", "exemplos práticos", "dúvidas em aberto", "erros comuns", "resumo de leitura",
            "como explicar para alguém", "conexões inesperadas", "aplicações no dia a dia",
            "perguntas para revisar", "história e origem");

    private static final int DIARY_NOTES = 60;
    private static final DateTimeFormatter DIARY_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private SeedNotes() {
    }

    static String mapTitle(String area) {
        return "Mapa: " + area;
    }

    static String facetTitle(String concept, String facet) {
        return concept + ": " + facet;
    }

    /**
     * Monta {@code count} notas (no máximo 12 + 144 + 60 + 1440 = 1656).
     * A ordem é: mapas, temas, diário e aspectos; se count for menor, corta do fim.
     */
    static List<Item> generate(int count, long seed, LocalDate today) {
        Random rnd = new Random(seed);
        Plan plan = new Plan(rnd);

        // 1) Decide QUAIS títulos existem. Só depois escreve o conteúdo,
        //    para que cada nota cite apenas notas que de fato vão existir.
        List<String[]> facetPairs = new ArrayList<>();
        for (Area area : AREAS) {
            for (String concept : area.concepts()) {
                for (String facet : FACETS) {
                    facetPairs.add(new String[] {concept, facet});
                }
            }
        }
        Collections.shuffle(facetPairs, rnd);

        int fixed = AREAS.size() + plan.allConcepts.size() + DIARY_NOTES;
        int facetCount = Math.max(0, Math.min(facetPairs.size(), count - fixed));
        Map<String, List<String>> facetsByConcept = new HashMap<>();
        for (String[] pair : facetPairs.subList(0, facetCount)) {
            facetsByConcept.computeIfAbsent(pair[0], k -> new ArrayList<>()).add(pair[1]);
        }

        // 2) Escreve as notas.
        List<Item> items = new ArrayList<>();
        for (Area area : AREAS) {
            items.add(mapNote(area, rnd));
        }
        for (Area area : AREAS) {
            for (String concept : area.concepts()) {
                items.add(hubNote(area, concept, plan, facetsByConcept.getOrDefault(concept, List.of()), rnd));
            }
        }
        Set<String> diaryTitles = new HashSet<>();
        for (int i = 0; i < DIARY_NOTES; i++) {
            items.add(diaryNote(today, plan, facetsByConcept, diaryTitles, rnd));
        }
        for (String[] pair : facetPairs.subList(0, facetCount)) {
            items.add(facetNote(pair[0], pair[1], plan, facetsByConcept.get(pair[0]), rnd));
        }
        return items.size() > count ? items.subList(0, count) : items;
    }

    /** Índices de apoio: área de cada tema, vizinhos e pontes. */
    private static final class Plan {
        final List<String> allConcepts = new ArrayList<>();
        final Map<String, Area> areaOf = new HashMap<>();
        final Map<String, List<String>> neighbors = new LinkedHashMap<>();
        final Map<String, List<String>> bridges = new HashMap<>();

        Plan(Random rnd) {
            for (Area area : AREAS) {
                for (String concept : area.concepts()) {
                    allConcepts.add(concept);
                    areaOf.put(concept, area);
                }
            }
            // Cada tema ganha 3 vizinhos sorteados dentro da mesma área.
            for (Area area : AREAS) {
                for (String concept : area.concepts()) {
                    List<String> others = new ArrayList<>(area.concepts());
                    others.remove(concept);
                    Collections.shuffle(others, rnd);
                    neighbors.put(concept, List.copyOf(others.subList(0, 3)));
                }
            }
            for (String[] b : BRIDGES) {
                bridges.computeIfAbsent(b[0], k -> new ArrayList<>()).add(b[1]);
                bridges.computeIfAbsent(b[1], k -> new ArrayList<>()).add(b[0]);
            }
        }

        String neighbor(String concept, Random rnd) {
            return pick(neighbors.get(concept), rnd);
        }

        /** Um tema de outra área: uma ponte conhecida, se houver, ou um sorteado. */
        String farConcept(String concept, Random rnd) {
            List<String> known = bridges.get(concept);
            if (known != null && rnd.nextBoolean()) {
                return pick(known, rnd);
            }
            String other;
            do {
                other = pick(allConcepts, rnd);
            } while (areaOf.get(other) == areaOf.get(concept));
            return other;
        }
    }

    private static Item mapNote(Area area, Random rnd) {
        StringBuilder sb = new StringBuilder();
        sb.append("Mapa da área de ").append(area.name()).append(", que ").append(area.about()).append(".\n\n");
        sb.append("Uso esta nota como porta de entrada: quando não sei por onde começar, começo por aqui.\n\n");
        sb.append("## Temas\n");
        for (String concept : area.concepts()) {
            sb.append("- [[").append(concept).append("]]\n");
        }
        return new Item(mapTitle(area.name()), sb.toString(),
                "Índice dos temas de " + area.name() + ".", 330 + rnd.nextInt(35));
    }

    private static Item hubNote(Area area, String concept, Plan plan, List<String> facets, Random rnd) {
        List<String> near = plan.neighbors.get(concept);
        StringBuilder sb = new StringBuilder();
        sb.append(concept).append(" é um dos temas de [[").append(mapTitle(area.name())).append("]], área que ")
                .append(area.about()).append(".\n\n");
        sb.append(pick(List.of(
                "Comecei a estudar isso por curiosidade e virou um dos assuntos a que mais volto.",
                "É um tema que aparece em muitas conversas e livros, então vale ter uma nota central para ele.",
                "Ainda tenho mais perguntas do que respostas aqui, e as notas abaixo registram o caminho.",
                "Quanto mais leio sobre isso, mais ligações encontro com outros assuntos."), rnd)).append("\n\n");
        sb.append("Ligações principais: [[").append(near.get(0)).append("]], [[").append(near.get(1))
                .append("]] e [[").append(near.get(2)).append("]].\n");
        List<String> bridges = plan.bridges.get(concept);
        if (bridges != null) {
            sb.append("Também conversa com ");
            for (int i = 0; i < bridges.size(); i++) {
                sb.append(i == 0 ? "" : " e ").append("[[").append(bridges.get(i)).append("]]");
            }
            sb.append(", de outra área.\n");
        }
        if (!facets.isEmpty()) {
            sb.append("\n## Notas sobre o tema\n");
            for (String facet : facets) {
                sb.append("- [[").append(facetTitle(concept, facet)).append("]]\n");
            }
        }
        return new Item(concept, sb.toString(), "Nota central sobre " + concept + " (" + area.name() + ").",
                270 + rnd.nextInt(60));
    }

    private static Item diaryNote(LocalDate today, Plan plan, Map<String, List<String>> facetsByConcept,
                                  Set<String> usedTitles, Random rnd) {
        // Um diário por dia, espalhados pelos últimos ~10 meses.
        int daysAgo;
        String title;
        do {
            daysAgo = 1 + rnd.nextInt(300);
            title = "Diário de " + today.minusDays(daysAgo).format(DIARY_DATE);
        } while (!usedTitles.add(title));

        String a = pick(plan.allConcepts, rnd);
        String b = plan.neighbor(a, rnd);
        String c = plan.farConcept(a, rnd);
        StringBuilder sb = new StringBuilder();
        sb.append(pick(List.of("Dia produtivo.", "Dia corrido, mas deu para estudar um pouco.",
                "Pouca energia hoje.", "Manhã de leitura, tarde de prática."), rnd)).append(' ');
        sb.append("Estudei [[").append(a).append("]] e revisei [[").append(b).append("]]. ");
        sb.append("Fiquei pensando em como isso se liga a [[").append(c).append("]].\n\n");
        List<String> facets = facetsByConcept.get(a);
        if (facets != null) {
            sb.append("Amanhã: reler [[").append(facetTitle(a, pick(facets, rnd))).append("]].\n");
        }
        return new Item(title, sb.toString(), null, daysAgo);
    }

    private static Item facetNote(String concept, String facet, Plan plan, List<String> siblings, Random rnd) {
        String c = "[[" + concept + "]]";
        String r = "[[" + plan.neighbor(concept, rnd) + "]]";
        String area = plan.areaOf.get(concept).name();
        String text = switch (facet) {
            case "conceitos básicos" -> "Anotações iniciais sobre " + c + ". A ideia central é fácil de enunciar e "
                    + "difícil de dominar, então começo pelas definições e pelos termos que aparecem sempre. "
                    + "Para entender bem, vale revisar antes " + r + ".";
            case "exemplos práticos" -> "Três situações em que " + c + " aparece na prática: no trabalho, em casa e "
                    + "nas leituras recentes. O exemplo mais claro até agora veio quando comparei com " + r + ".";
            case "dúvidas em aberto" -> "Perguntas que ainda não sei responder sobre " + c + ":\n"
                    + "- Até onde a ideia vale fora de " + area + "?\n"
                    + "- Como ela se relaciona com " + r + "?\n"
                    + "- Quem discorda disso, e por quê?";
            case "erros comuns" -> "Confusões frequentes sobre " + c + ": tratar como regra absoluta, misturar com "
                    + r + " e esquecer o contexto em que a ideia surgiu. Anotei aqui para não repetir.";
            case "resumo de leitura" -> "Resumo de um capítulo sobre " + c + ". O autor defende que o tema só faz "
                    + "sentido quando visto dentro de " + area + " como um todo. Destaque: a comparação com " + r + ".";
            case "como explicar para alguém" -> "Tentativa de explicar " + c + " com palavras simples, como na "
                    + "técnica Feynman. Se não consigo explicar sem jargão, é sinal de que ainda não entendi. "
                    + "Uma analogia que funcionou: pensar nele a partir de " + r + ".";
            case "conexões inesperadas" -> "Percebi hoje uma ligação entre " + c + " e [["
                    + plan.farConcept(concept, rnd) + "]], que é de outra área. As duas ideias tratam, cada uma do "
                    + "seu jeito, de como sistemas mudam com o tempo.";
            case "aplicações no dia a dia" -> "Como uso " + c + " na rotina: pequenos testes, sem compromisso, para "
                    + "ver o que funciona. Funciona melhor junto com " + r + ".";
            case "perguntas para revisar" -> "Cartões de revisão sobre " + c + ":\n"
                    + "- P: Qual é a ideia central? R: ver a nota principal.\n"
                    + "- P: Qual a diferença para " + r + "? R: o foco e o contexto de uso.\n"
                    + "- P: Um exemplo concreto? R: está nos exemplos práticos.";
            case "história e origem" -> "De onde vem a ideia de " + c + ": surgiu como resposta a problemas "
                    + "concretos da época e foi refinada aos poucos. Ajuda a entender por que " + r
                    + " ganhou espaço depois.";
            default -> "Notas sobre " + c + ".";
        };

        StringBuilder sb = new StringBuilder(text);
        List<String> others = siblings.stream().filter(f -> !f.equals(facet)).toList();
        if (!others.isEmpty() && rnd.nextInt(10) < 6) {
            sb.append("\n\nVer também [[").append(facetTitle(concept, pick(others, rnd))).append("]].");
        }
        if (rnd.nextInt(10) == 0) {
            sb.append("\n\nIdeia solta: será que isso tem a ver com [[").append(plan.farConcept(concept, rnd))
                    .append("]]?");
        }
        String summary = rnd.nextInt(10) < 4
                ? Character.toUpperCase(facet.charAt(0)) + facet.substring(1) + " sobre " + concept + "."
                : null;
        return new Item(facetTitle(concept, facet), sb.toString(), summary, rnd.nextInt(270));
    }

    private static <T> T pick(List<T> list, Random rnd) {
        return list.get(rnd.nextInt(list.size()));
    }
}
