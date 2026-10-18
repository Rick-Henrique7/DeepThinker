<div align="center">

<img src="frontend/public/favicon.svg" alt="Logo do Deep thinker" width="88" />

# Deep thinker

**Um segundo cérebro em grafo, com uma IA que conhece o que você já pensou e discorda de você.**

Escreva notas, ligue ideias com `[[colchetes]]`, organize em grafo, quadro ou canvas, grife PDFs
e converse com um Advogado do Diabo que usa as suas próprias notas como memória.

<a href="https://deepthinker-app.vercel.app"><img src="https://img.shields.io/badge/Ver_o_site-deepthinker--app.vercel.app-8fb4ff?style=for-the-badge&logo=vercel&logoColor=white" alt="Ver o site: deepthinker-app.vercel.app" height="40" /></a>
<a href="https://github.com/Rick-Henrique7/DeepThinker/releases/latest"><img src="https://img.shields.io/badge/Baixar_para_Windows-instalador-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Baixar para Windows" height="40" /></a>

### 🌐 [deepthinker-app.vercel.app](https://deepthinker-app.vercel.app)

[![CI](https://github.com/Rick-Henrique7/DeepThinker/actions/workflows/ci.yml/badge.svg)](https://github.com/Rick-Henrique7/DeepThinker/actions/workflows/ci.yml)
[![Versão](https://img.shields.io/github/v/release/Rick-Henrique7/DeepThinker?label=vers%C3%A3o&color=8fb4ff)](https://github.com/Rick-Henrique7/DeepThinker/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Rick-Henrique7/DeepThinker/total?label=downloads&color=8fb4ff)](https://github.com/Rick-Henrique7/DeepThinker/releases)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-8fb4ff)](LICENSE)
<br />
[![Java 21](https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white)](backend-java)
[![Spring Boot 4](https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&logoColor=white)](backend-java)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](frontend)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](frontend)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](frontend)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](desktop)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pronto-4169E1?logo=postgresql&logoColor=white)](backend-java)
[![MCP](https://img.shields.io/badge/MCP-16_ferramentas-000000)](#servidor-mcp)

[**Site**](https://deepthinker-app.vercel.app) ·
[**Baixar para Windows**](https://github.com/Rick-Henrique7/DeepThinker/releases/latest) ·
[Ver o vídeo](site/public/video/deepthinker-1080.mp4) ·
[Como rodar](#como-rodar) ·
[Arquitetura](#arquitetura) ·
[Portfólio do criador](https://henrique-santos-portfolio.vercel.app/)

<a href="https://deepthinker-app.vercel.app">
  <img src="docs/imagens/capa.jpg" alt="Deep thinker: grafo de notas dentro de um notebook, com o texto Escreva. Tudo se conecta." width="100%" />
</a>

</div>

## O que ele faz

| | |
|---|---|
| <img src="docs/imagens/grafo.jpg" alt="Grafo de conhecimento com centenas de notas" /> | **Escreva, tudo se conecta.** Cada `[[Título]]` vira uma ligação. O grafo mostra como as ideias se encontram, com backlinks, menções não ligadas e grafo local de cada nota. |
| <img src="docs/imagens/advogado.jpg" alt="Chat com o Advogado do Diabo" /> | **Uma IA que discorda de você.** O Advogado do Diabo tem três modos (Socrático, Crítico, Brainstorm), responde em streaming e lembra das suas notas por busca semântica (RAG). Ela também cria notas sozinha (tool calling). |
| <img src="docs/imagens/quadro.jpg" alt="Quadro Kanban com notas" /> | **Do grafo ao quadro.** Mande notas para um Kanban, arraste cartões no mouse ou no toque, e veja tudo também em tabela, com tags e propriedades em YAML. |
| <img src="docs/imagens/leitor.jpg" alt="Leitor de PDF com grifos" /> | **Cada grifo vira nota.** Importe PDF, TXT ou Markdown. No Leitor, cada trecho grifado vira uma nota ligada ao documento, com comentário. |
| <img src="docs/imagens/canvas.jpg" alt="Canvas com cartões ligados" /> | **Ligue ideias no canvas.** Um quadro infinito no formato aberto JSON Canvas, com cartões, setas e desenho à mão livre (Excalidraw). |
| <img src="docs/imagens/painel.jpg" alt="Painel com gráficos" /> | **Veja como você pensa.** Painel com notas por semana, dias em que você escreveu e temas mais ligados. Todo gráfico tem a opção "ver como tabela". |

E mais: coedição em tempo real, histórico de versões com diff, nota do dia, paleta de comandos (`Ctrl+K`), modelos de nota,
diagramas Mermaid gerados pela IA, mapa mental de documentos, resumo em áudio, notas dentro de notas (`![[Nota]]`),
sistema de plugins, três temas (Abismo, Glaciar, Grafite) e layout pensado do celular ao monitor ultrawide.

## Baixar

| Plataforma | Como |
|---|---|
| **Windows 10/11** | Baixe o arquivo terminado em `-setup.exe` na [última versão](https://github.com/Rick-Henrique7/DeepThinker/releases/latest) e abra. Não precisa instalar Java: ele já vem dentro do app. |
| **Site** | Conheça o projeto, veja o vídeo e baixe em [deepthinker-app.vercel.app](https://deepthinker-app.vercel.app). |
| **Navegador** | Rode o app localmente (veja [Como rodar](#como-rodar)). |

> O instalador ainda não tem assinatura digital, então o Windows pode mostrar "O Windows protegeu o computador".
> Clique em **Mais informações** e depois em **Executar assim mesmo**.

No app desktop tudo fica no seu computador (banco em `%APPDATA%\com.deepthinker.desktop`). Para conversar com a IA,
escolha um provedor na aba **IA** e cole a sua chave, ou use um modelo local pelo LM Studio.

## Arquitetura

```mermaid
flowchart LR
    subgraph Cliente
        W[Navegador<br/>React + Vite]
        D[App desktop<br/>Tauri 2]
    end
    subgraph API[API Java · Spring Boot]
        A[Auth JWT]
        N[Notas, grafo,<br/>canvas, leitor]
        C[Chat SSE +<br/>tool calling]
        M[Memória RAG<br/>embeddings]
        P[Servidor MCP]
        X[Coedição<br/>WebSocket]
    end
    DB[(PostgreSQL<br/>ou H2 local)]
    LLM{{Provedor de IA<br/>OpenAI, Claude, Gemini,<br/>Groq, LM Studio...}}
    OUT[Outras IAs<br/>Claude, Cursor...]

    W -- HTTPS / SSE / WS --> API
    D -- inicia o Java embutido --> API
    API --> DB
    C --> LLM
    OUT -- MCP --> P
```

| Pasta | O que é | Tecnologia |
|---|---|---|
| [`frontend/`](frontend) | A aplicação web | React 18, TypeScript, Vite, Tailwind, D3, Yjs, Mermaid, pdf.js, Excalidraw |
| [`backend-java/`](backend-java) | A API | Java 21, Spring Boot 4, Spring Security, JPA, Flyway, LangChain4j, PDFBox |
| [`desktop/`](desktop) | O app para Windows | Tauri 2 (Rust) + o mesmo backend Java com um JRE enxuto gerado pelo `jlink` |
| [`site/`](site) | A página de apresentação | Vite, three.js, GSAP, anime.js |
| [`backend/`](backend) | Primeira versão da API, em Laravel | Mantida só como histórico da migração |

### Decisões técnicas, e por quê

- **Laravel para Java, sem quebrar o frontend.** A API foi reescrita em Spring Boot mantendo os mesmos endereços e o mesmo JSON (`snake_case`). O React não precisou mudar para trocar de backend.
- **JWT sem estado + BCrypt.** Cada requisição carrega quem é o usuário, então a API escala horizontalmente sem sessão no servidor. Cada pessoa só enxerga os próprios dados.
- **Chave de IA criptografada (AES-GCM).** Cada usuário traz a própria chave; ela é guardada cifrada no banco e nunca volta inteira para o navegador.
- **Plugins de IA.** Uma interface `LlmClient` com duas implementações (compatível com OpenAI e Anthropic) cobre 9 provedores. Adicionar outro é cadastrar um item no catálogo.
- **Memória com RAG + grafo.** As notas viram vetores (modelo `multilingual-e5-small` rodando dentro do Java via ONNX, ou embeddings do provedor). A busca pega as notas mais parecidas e soma os vizinhos no grafo (GraphRAG) antes de responder.
- **Streaming com SSE.** A resposta da IA aparece palavra por palavra, sem WebSocket só para isso.
- **Migrations com Flyway e H2 em modo PostgreSQL.** O mesmo SQL roda no H2 local (desenvolvimento e app desktop) e no Postgres em produção.
- **Desktop com Tauri em vez de Electron.** A janela usa o WebView do sistema; o Java vai junto com um runtime cortado pelo `jlink`. O app sobe o backend numa porta livre e o encerra quando a janela fecha.

### Servidor MCP

O backend também é um servidor [Model Context Protocol](https://modelcontextprotocol.io) (Streamable HTTP em `/mcp`).
Com um token gerado em **IA > Acesso por MCP**, outras IAs (Claude, Cursor e afins) podem ler e organizar as suas notas,
com 16 ferramentas: listar e abrir notas, criar notas, mover cartões no Kanban, criar e renomear colunas, criar canvas com cartões ligados e mais.
No modo ao vivo, você vê o cursor da IA navegando pelo app enquanto ela trabalha.

## Como rodar

Você precisa de **JDK 21** e **Node 20+**. O Maven vem junto pelo wrapper (`mvnw`).

```bash
# 1. API (porta 8000, banco H2 em backend-java/data)
cd backend-java
./mvnw spring-boot:run          # no Windows: .\mvnw.cmd spring-boot:run

# 2. Frontend (porta 5173), em outro terminal
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173 e crie uma conta. A primeira conta é sua; para fechar o cadastro depois, use `REGISTRATION_ENABLED=false`.

<details>
<summary><b>Variáveis de ambiente principais</b></summary>

| Variável | Para quê | Padrão |
|---|---|---|
| `DEEPTHINKER_SECRET` | Assina os tokens e cifra as chaves de IA. **Troque em produção.** | um valor de desenvolvimento |
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | Banco (use `jdbc:postgresql://...` em produção) | H2 em arquivo |
| `FRONTEND_ORIGIN` | Endereços liberados no CORS | `http://localhost:5173` |
| `REGISTRATION_ENABLED` | Permite novos cadastros | `true` |
| `LLM_PROVIDER` | Provedor de IA padrão | `openai` |
| `VITE_API_URL` (frontend) | Endereço da API | `http://localhost:8000/api` |

A lista completa está em [`backend-java/src/main/resources/application.yml`](backend-java/src/main/resources/application.yml).
</details>

<details>
<summary><b>Gerar o instalador do Windows</b></summary>

Precisa de Rust e do Visual Studio Build Tools (C++). Depois:

```bash
cd desktop
npm install
npm run build
```

O instalador sai em `desktop/src-tauri/target/release/bundle/nsis/`. Detalhes em [`desktop/README.md`](desktop/README.md).
Ao criar uma tag `v*`, o GitHub Actions gera o instalador e publica nos Releases sozinho.
</details>

## Testes

```bash
cd backend-java && ./mvnw verify     # 139 testes de API, autenticação, IA (com servidor falso), MCP e mais
cd frontend && npx playwright test   # testes de ponta a ponta no navegador, do celular ao desktop
```

O CI roda os testes do backend e o build do frontend a cada push.

## Autor

Feito por **Henrique Santos (Rick)**. [Site do projeto](https://deepthinker-app.vercel.app) · [Portfólio](https://henrique-santos-portfolio.vercel.app/) · [GitHub](https://github.com/Rick-Henrique7)

## Licença

[MIT](LICENSE). Use, modifique e distribua à vontade, mantendo o aviso de copyright.
