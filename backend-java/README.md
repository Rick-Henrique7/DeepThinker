# DeepThinker API em Java (Spring Boot)

Reescrita do backend Laravel (`../backend`) em Java 21 com Spring Boot 4.
A API responde nos mesmos endereços e com o mesmo JSON, então o frontend React funciona sem mudanças.

## O que já foi portado

| Funcionalidade | Endpoint | Status |
|---|---|---|
| Listar, criar, ver, editar e apagar notas | `/api/notes`, `/api/notes/{id}` | Pronto |
| Lista de títulos | `GET /api/notes/titles` | Pronto |
| Conexões automáticas por `[[Título]]` | ao salvar uma nota | Pronto |
| Grafo para o D3 | `GET /api/graph` | Pronto |
| Chat com o Advogado do Diabo (streaming SSE, 3 modos) | `POST /api/chat/stream` | Pronto |
| IA criando notas sozinha (tool calling) | dentro do chat, com `tools_enabled` | Pronto |
| Provedores e ferramentas disponíveis | `GET /api/chat/providers`, `GET /api/chat/tools` | Pronto |
| Resumo da conversa em notas ligadas | `POST /api/notes/summarize` | Pronto |
| Configurações de IA pela tela (chave criptografada) | `/api/settings/llm`, `/api/settings/llm/test` | Pronto |
| Plugins de IA à escolha: OpenAI, Claude, Gemini, Groq, OpenRouter, DeepSeek, Mistral, Personalizado e LM Studio | aba IA do app | Pronto |
| Histórico de conversas | `/api/conversations`, `/api/conversations/clear` | Pronto |
| Upload de documentos (PDF, TXT, MD) virando notas | `POST /api/documents/upload` | Pronto |
| Cadastro, login e dados separados por pessoa | `/api/auth/register`, `/api/auth/login`, `/api/auth/me` | Pronto |

## Como rodar no Windows

Você só precisa do **JDK 21** instalado (por exemplo o [Eclipse Temurin 21](https://adoptium.net/)). O Maven vem junto pelo "wrapper" (`mvnw.cmd`), que baixa a versão certa sozinho na primeira vez.

```powershell
cd C:\dev\projects\deepThinker\backend-java
.\mvnw.cmd test             # roda os testes
.\mvnw.cmd spring-boot:run  # sobe a API em http://localhost:8000
```

Desligue o `php artisan serve` antes, porque os dois usam a porta 8000. O frontend (`npm run dev` em `../frontend`) abre na tela de login. Crie sua conta em "Criar conta": **a primeira conta criada herda as notas, conversas e chaves de IA que já estavam no banco**.

O banco de desenvolvimento é um arquivo H2 em `./data`, criado automaticamente. Ele começa vazio: as notas do SQLite do Laravel não são copiadas.

## Popular com notas de teste

Para testar o app com volume (lista, busca, grafo), suba a API com o perfil `seed`:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=seed"
```

Ele cria **1000 notas em português com cerca de 3900 conexões** (`[[links]]`) na primeira conta do banco. As notas ficam marcadas com `source_type = seed`; rodar de novo não duplica nada, e as suas notas nunca são apagadas. O perfil é ignorado junto com `prod`.

| Variável | Padrão | Para quê |
|---|---|---|
| `DEEPTHINKER_SEED_EMAIL` | primeira conta | Conta que recebe as notas |
| `DEEPTHINKER_SEED_COUNT` | `1000` | Quantas notas criar (até 1656) |
| `DEEPTHINKER_SEED_RESET` | `false` | `true` apaga só as notas de teste e cria de novo |

Código: `note/SeedNotes.java` (gera o texto), `note/NoteSeeder.java` (grava), `note/NoteSeedRunner.java` (liga no perfil).

## Mapa Laravel → Spring

| No Laravel | No Spring | Arquivo aqui |
|---|---|---|
| `routes/api.php` + Controller | `@RestController` com `@GetMapping`, `@PostMapping`... | `note/NoteController.java` |
| Model Eloquent | Entidade JPA (`@Entity`) | `note/Note.java`, `note/Connection.java` |
| Query builder (`Note::where(...)`) | Repository do Spring Data | `note/NoteRepository.java` |
| Lógica no controller ou Observer | `@Service` | `note/NoteService.java` |
| `NoteObserver::saved` | método `syncWikiLinks` chamado ao salvar | `note/NoteService.java` |
| `$request->validate([...])` | Anotações `@NotBlank`, `@Size` + `@Valid` | `note/NoteDtos.java` |
| Resposta 422 com `errors` | `@RestControllerAdvice` | `common/ApiExceptionHandler.java` |
| `database/migrations` | Flyway (`V1__...sql`) | `src/main/resources/db/migration` |
| `.env` | `application.yml` + variáveis de ambiente | `src/main/resources` |
| `config/cors.php` | `WebMvcConfigurer` | `config/CorsConfig.java` |
| `composer.json` | `pom.xml` (Maven) | `pom.xml` |
| PHPUnit Feature tests | JUnit 5 + MockMvc | `src/test/java/.../NoteApiTest.java` |
| `LlmServiceContract` + `LmStudioService` + `OpenAiCloudService` | Interface `LlmClient` + um cliente por protocolo | `llm/LlmClient.java`, `llm/OpenAiCompatibleClient.java`, `llm/AnthropicClient.java` |
| `config/llm.php` | `@ConfigurationProperties` | `llm/LlmProperties.java` |
| `response()->stream(...)` com `echo` e `flush()` | `SseEmitter` | `chat/ChatController.java` |
| `ToolRegistry` | `@Component` | `chat/ToolRegistry.java` |
| Sanctum (instalado, mas sem uso) + `auth()->id()` | Spring Security + JWT + `CurrentUser.id()` | `config/SecurityConfig.java`, `auth/` |
| `Hash::make` / `Hash::check` | `PasswordEncoder` (BCrypt) | `auth/AuthService.java` |
| `ConversationMessageController` | `@RestController` + `Specification` para filtros opcionais | `conversation/ConversationController.java` |
| `DocumentController` + `smalot/pdfparser` | `MultipartFile` + Apache PDFBox | `document/DocumentController.java`, `document/DocumentService.java` |
| Lógica repetida em `summarize` e no upload | Uma classe só | `note/KnowledgeExtractor.java` |

Três ideias novas que vale entender:

- **Injeção de dependência.** Você nunca faz `new NoteService(...)`. O Spring cria os objetos e entrega cada um pelo construtor de quem precisa. No Laravel isso também existe (o container), só que mais escondido.
- **DTO separado da entidade.** `Note` é a tabela; `NoteDtos` é o JSON. Assim uma coluna nova no banco não vaza para a API por acidente.
- **`@Transactional`.** Tudo dentro do método é salvo junto ou nada é salvo. Se a criação das conexões falhar, a nota também não fica gravada pela metade.

Sobre o módulo de IA:

- **Plugins de IA (padrão Strategy).** `LlmClient` é uma interface; cada "língua" de API tem uma implementação. `OpenAiCompatibleClient` atende todos os provedores que copiam o formato da OpenAI (OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral, LM Studio e o Personalizado). `AnthropicClient` traduz o formato próprio do Claude. O chat e o resumo só conhecem a interface.
- **Catálogo de plugins.** Cada provedor é uma "ficha" (`LlmPlugin`) em `llm/PluginCatalog.java`: nome, endereço, se exige chave, link para criar a chave, modelos sugeridos. A tela de Configurações é montada a partir dessas fichas, então **adicionar um provedor novo é adicionar uma entrada nesse arquivo**, sem mexer no React.
- **Endereço travado nos provedores conhecidos.** Só o Personalizado e o LM Studio aceitam trocar a URL; assim ninguém consegue redirecionar a sua chave da OpenAI para outro servidor.
- **Streaming de verdade.** O Laravel esperava a IA terminar e só então mandava tudo de uma vez. Aqui cada pedaço vai para o navegador assim que chega, numa thread virtual do Java 21.
- **Chave protegida.** A API key é gravada criptografada com AES-GCM (`llm/SecretCipher.java`), usando a variável `DEEPTHINKER_SECRET`. Quem abrir o banco vê só `enc:...`.
- **A IA fora da transação.** O resumo chama a IA primeiro e só depois abre a transação para gravar as notas, para não prender o banco enquanto espera.
- **Testes sem IA real.** `FakeLlmServer` finge ser o LM Studio, então os testes rodam sem internet e sem modelo carregado.

Sobre histórico e documentos:

- **`session_id` virou coluna.** O Laravel guardava a sessão escondida no campo `audio_url` como `session:...`. Aqui é uma coluna própria, com índice, então filtrar por sessão é rápido e claro.
- **Quem salva o histórico é o frontend.** O React já grava a pergunta e a resposta em `POST /api/conversations`. Por isso o chat não grava nada sozinho (no Laravel isso duplicava as mensagens).
- **O arquivo original não é guardado.** O upload lê o texto do PDF/TXT/MD, gera as notas e descarta o arquivo. Assim o servidor na nuvem não precisa de disco permanente. Limite: 10 MB (acima disso a API responde 413).
- **`KnowledgeExtractor`.** Resumo da conversa e upload faziam quase a mesma coisa (pedir JSON para a IA e criar notas ligadas). Agora os dois usam a mesma classe. Se a IA não devolver JSON no upload, o documento vira uma nota simples "Doc: nome" em vez de dar erro.

## Como funciona o login

```
1. React  ── POST /api/auth/login {email, senha} ──▶  AuthService confere o hash BCrypt
2. React  ◀── { token: "eyJ...", user } ───────────  TokenService assina um JWT (vale 7 dias)
3. React  ── GET /api/notes  + "Authorization: Bearer eyJ..." ──▶  Spring Security valida a assinatura
4. NoteService usa CurrentUser.id() e devolve só as notas dessa pessoa
```

- **Senha nunca é gravada.** Guardamos o hash BCrypt (`$2a$10$...`). É lento de propósito, para dificultar quem tentar adivinhar senhas de um banco vazado.
- **JWT em vez de sessão.** O token carrega "sou o usuário 7, valho até tal dia" e uma assinatura feita com `DEEPTHINKER_SECRET`. O servidor não guarda sessão nenhuma, então dá para rodar várias cópias da API. Sair é só o navegador apagar o token. Trocar o `DEEPTHINKER_SECRET` desloga todo mundo.
- **Quem pode o quê** fica num lugar só: `config/SecurityConfig.java`. Cadastro e login são públicos; todo o resto exige token. Sem token, a API responde 401 e o React volta para a tela de login.
- **Cada consulta filtra pelo dono.** Notas, conversas e configurações de IA ganharam a coluna `user_id`, e os repositórios só têm métodos que recebem o `userId` (ex.: `findByIdAndUserId`). Abrir a nota de outra pessoa dá 404, como se ela não existisse.
- **Cada pessoa usa a própria chave de IA.** As chaves salvas pela tela são por usuário. As variáveis `OPENAI_API_KEY` etc. continuam valendo para todo mundo que não salvou chave própria, então **se você colocar a sua chave no servidor, feche o cadastro** (`REGISTRATION_ENABLED=false`) depois de criar a sua conta, senão qualquer pessoa que se cadastrar usa a sua conta da OpenAI.
- **Migration em Java.** O título da nota passou a ser único por pessoa. A V1 criou o `UNIQUE` sem nome, e cada banco inventa um nome diferente, então `db/migration/V5__note_titles_unique_per_user.java` pergunta o nome ao banco antes de apagar.
- **O chat roda em outra thread.** O login fica guardado na thread da requisição; `DelegatingSecurityContextRunnable` copia ele para a thread do streaming, senão a ferramenta `create_note` não saberia de quem é a nota.

## Como funciona a memória da IA (RAG)

Antes de cada resposta do Advogado do Diabo, o backend procura nas **suas** notas as que têm a ver com a conversa e coloca no prompt. A IA passa a responder sabendo o que você já escreveu, cita as notas como `[[Título]]` e aponta quando você se contradiz.

```
mensagem  ──▶ embedding da pergunta ──▶ compara com o vetor de cada nota sua (cosseno)
          ──▶ 5 mais parecidas + até 3 vizinhas pelos [[links]] ──▶ bloco "Memória do usuário" no system prompt
          ──▶ evento SSE {"memory": [...]} ──▶ React mostra "Notas que o Advogado leu"
```

- **Embedding** é um vetor de números que representa o significado de um texto: textos parecidos viram vetores próximos. Quem gera é o `multilingual-e5-small`, um modelo pequeno que entende português e roda **dentro do Java** (ONNX Runtime via LangChain4j). Não precisa de chave e funciona com qualquer provedor de chat, inclusive Groq.
- **Primeira vez:** o modelo (~120 MB) é baixado do Hugging Face para `data/models/` e reaproveitado depois. Enquanto não carrega (ou se o download falhar), a memória usa uma busca por palavras (`HashingEmbedder`). `GET /api/memory/status` mostra qual está em uso.
- **Quando o vetor é calculado:** ao criar ou editar uma nota (evento `NoteSavedEvent`, depois do commit) e, ao subir o servidor, para as notas que ainda não têm (ex.: as 1000 do seed). O hash do conteúdo evita recalcular nota que não mudou.
- **Onde fica:** tabela `note_embeddings` (migration V6), vetor em bytes. A comparação é feita em Java, nota por nota: com alguns milhares de notas leva poucos milissegundos. Com muito mais, o próximo passo é o pgvector.
- **GraphRAG:** além das notas parecidas, entram as ligadas a elas por `[[links]]`. A busca vetorial acha a porta de entrada e o grafo traz o contexto ao redor.
- **Privacidade:** com a memória ligada, trechos das notas vão junto para o provedor de IA. O botão "Memória" no chat desliga por conversa; `MEMORY_ENABLED=false` desliga no servidor.
- **Cada pessoa escolhe o modelo da memória** em Configurações: Local (padrão), OpenAI, Gemini, Mistral, Ollama ou LM Studio. As opções por API usam a chave já salva no plugin de IA correspondente e falam o mesmo protocolo (`POST /embeddings` da OpenAI), então uma única classe (`RemoteEmbedder`) atende todas. As opções ficam em `EmbeddingCatalog`, com o passo a passo que a tela mostra. Trocar de modelo recalcula os vetores em segundo plano; se faltar a chave, a memória continua com o modelo local e a tela explica o motivo.
- **Corte relativo:** o e5 dá entre 0.80 e 0.90 para quase tudo (medido com notas curtas). Por isso uma nota só entra se passar do piso (`MEMORY_MIN_SCORE`, 0.82) **e** estiver perto da melhor (`MEMORY_MARGIN`, 0.03).
- **Testar a busca sem a IA:** `GET /api/memory/search?q=medo de falir&neighbors=3`.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `8000` | Porta HTTP |
| `DATABASE_URL` | H2 em `./data` | Em produção: `jdbc:postgresql://host:5432/banco` |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `sa` / vazio | Credenciais do banco |
| `FRONTEND_ORIGIN` | `http://localhost:5173,...` | Domínios do frontend permitidos (CORS) |
| `SPRING_PROFILES_ACTIVE` | vazio | Use `prod` em produção |
| `DEEPTHINKER_SECRET` | valor de desenvolvimento | Chave que criptografa as API keys no banco e assina os tokens de login. Obrigatória em produção |
| `REGISTRATION_ENABLED` | `true` | `false` impede criar contas novas (quem já tem conta continua entrando) |
| `AUTH_TOKEN_TTL` | `7d` | Quanto tempo o login dura (`12h`, `30d`...) |
| `LLM_PROVIDER` | `openai` | Plugin ativo quando ninguém escolheu outro na tela (`openai`, `anthropic`, `gemini`, `groq`, `openrouter`, `deepseek`, `mistral`, `custom`, `lmstudio`) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY` | vazio | Chave de cada provedor, se preferir configurar no servidor em vez da tela |
| `CUSTOM_LLM_BASE_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_LLM_MODEL` | vazio | Plugin Personalizado |
| `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL` | `http://localhost:1234/v1`, `meta-llama-3.1-8b-instruct` | LM Studio local |
| `LLM_TIMEOUT` | `120` | Segundos de espera pela IA |
| `MEMORY_ENABLED` | `true` | Liga a memória da IA (busca nas suas notas antes de responder) |
| `MEMORY_MODEL_DIR` | `./data/models/multilingual-e5-small` (ou dentro de `DEEPTHINKER_DATA_DIR`, no app desktop) | Pasta do modelo de embeddings (`model.onnx` + `tokenizer.json`) |
| `MEMORY_AUTO_DOWNLOAD` | `true` | Baixa o modelo do Hugging Face se a pasta estiver vazia |
| `MEMORY_MIN_SCORE` | `0.82` | Piso de similaridade do modelo local. Suba se vierem notas sem relação; desça se vier pouca coisa |
| `MEMORY_MARGIN` | `0.03` | Só entram notas a até essa distância da melhor (modelo local) |
| `MEMORY_TOP_K` / `MEMORY_NEIGHBORS` | `5` / `3` | Quantas notas parecidas e quantas vizinhas no grafo entram no prompt |

As configurações salvas pela tela de Configurações valem mais que essas variáveis, como no Laravel. Como o banco do Java é novo, você vai precisar cadastrar a chave da OpenAI de novo pela tela, se usava.
