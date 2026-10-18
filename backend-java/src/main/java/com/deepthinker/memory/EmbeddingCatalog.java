package com.deepthinker.memory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Modelos de embeddings que o usuário pode escolher para a memória da IA.
 * Igual ao PluginCatalog do chat: a ordem aqui é a ordem na tela, e adicionar
 * uma opção nova é adicionar uma ficha aqui.
 *
 * Todas as opções remotas falam o mesmo protocolo (POST /embeddings da OpenAI),
 * então um único RemoteEmbedder atende todas.
 *
 * floor/margin: cada modelo tem a sua escala de similaridade. O e5 local dá entre
 * 0.80 e 0.90 para quase tudo (medido no PC do Rick em 15/10/2026); os outros valores
 * são pontos de partida e podem precisar de ajuste.
 */
@Component
public class EmbeddingCatalog {

    private final Map<String, EmbeddingOption> options = new LinkedHashMap<>();

    public EmbeddingCatalog(MemoryProperties props) {
        add(new EmbeddingOption(EmbeddingOption.WORDS, "Por palavras (padrão)",
                "Já vem pronta e não baixa nada: acha as notas que usam as mesmas palavras da conversa.",
                null, null, false, "hashing-v1", List.of("hashing-v1"),
                0, 0, false,
                List.of("Não precisa fazer nada: é o padrão.",
                        "Não entende sinônimos (\"falir\" e \"quebrar\" são palavras diferentes para ela).",
                        "Para buscar por significado, escolha o modelo local ou uma das opções abaixo.")));
        add(new EmbeddingOption(EmbeddingOption.LOCAL, "Modelo local (baixa ~120 MB)",
                "Busca por significado rodando dentro do app. Grátis, sem chave e sem internet depois de baixado.",
                null, null, false, props.modelName(), List.of(props.modelName()),
                props.minScore(), props.margin(), false,
                List.of("Escolha esta opção e salve: o app baixa o modelo uma vez só (~120 MB).",
                        "Enquanto baixa, a memória continua funcionando por palavras.",
                        "Usa algumas centenas de MB de RAM enquanto o app está aberto.")));
        add(new EmbeddingOption("openai", "OpenAI",
                "text-embedding-3: ótima qualidade em português. Cobrado por uso, mas muito barato.",
                "openai", null, false, "text-embedding-3-small",
                List.of("text-embedding-3-small", "text-embedding-3-large"), 0.25, 0.10, false,
                List.of("Crie uma chave em platform.openai.com/api-keys.",
                        "Salve a chave no plugin OpenAI, na seção de IA desta tela.",
                        "Escolha OpenAI aqui e clique em Testar memória.",
                        "Indexar 1000 notas custa menos de 1 centavo de dólar.")));
        add(new EmbeddingOption("gemini", "Google Gemini",
                "Embeddings do Google. Tem cota gratuita.",
                "gemini", null, false, "gemini-embedding-001",
                List.of("gemini-embedding-001", "text-embedding-004"), 0.55, 0.08, false,
                List.of("Crie uma chave grátis em aistudio.google.com/apikey.",
                        "Salve a chave no plugin Google Gemini, na seção de IA desta tela.",
                        "Escolha Google Gemini aqui e clique em Testar memória.")));
        add(new EmbeddingOption("mistral", "Mistral AI",
                "mistral-embed, da Mistral. Cobrado por uso.",
                "mistral", null, false, "mistral-embed", List.of("mistral-embed"), 0.70, 0.05, false,
                List.of("Crie uma chave em console.mistral.ai/api-keys.",
                        "Salve a chave no plugin Mistral AI, na seção de IA desta tela.",
                        "Escolha Mistral AI aqui e clique em Testar memória.")));
        add(new EmbeddingOption("ollama", "Ollama (no seu PC)",
                "Modelo de embeddings rodando no seu computador com o Ollama. Grátis.",
                null, "http://localhost:11434/v1", true, "bge-m3",
                List.of("bge-m3", "nomic-embed-text", "mxbai-embed-large"), 0.45, 0.10, true,
                List.of("Instale o Ollama em ollama.com.",
                        "No terminal, rode: ollama pull bge-m3 (entende português).",
                        "Deixe o Ollama aberto; o endereço padrão é http://localhost:11434/v1.",
                        "Escolha Ollama aqui e clique em Testar memória.")));
        add(new EmbeddingOption("lmstudio", "LM Studio (no seu PC)",
                "Modelo de embeddings carregado no LM Studio. Grátis.",
                "lmstudio", null, false, "text-embedding-nomic-embed-text-v1.5",
                List.of("text-embedding-nomic-embed-text-v1.5", "text-embedding-bge-m3"), 0.45, 0.10, true,
                List.of("No LM Studio, procure e baixe um modelo de embedding (ex.: nomic-embed-text ou bge-m3).",
                        "Na aba Developer, carregue o modelo e ligue o servidor.",
                        "O endereço é o mesmo do plugin LM Studio, na seção de IA desta tela.",
                        "Escolha LM Studio aqui, confira o nome do modelo e clique em Testar memória.")));
    }

    private void add(EmbeddingOption option) {
        options.put(option.id(), option);
    }

    public List<EmbeddingOption> all() {
        return List.copyOf(options.values());
    }

    public Optional<EmbeddingOption> find(String id) {
        return Optional.ofNullable(id).map(options::get);
    }

    public EmbeddingOption local() {
        return options.get(EmbeddingOption.LOCAL);
    }

    /** O padrão de quem nunca escolheu: busca por palavras, sem download. */
    public EmbeddingOption words() {
        return options.get(EmbeddingOption.WORDS);
    }
}
