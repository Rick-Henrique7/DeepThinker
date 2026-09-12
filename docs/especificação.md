---
title: DeepThinker — Sistema de Segundo Cérebro (PKM)
subtitle: Especificação de Requisitos de Software (SRS)
date: Setembro 2026
---

# Especificação de Requisitos de Software (SRS)

## Projeto: DeepThinker — Segundo Cérebro Visual

> **Histórico:** Este documento foi herdado do projeto VectorLink (gestão de
> crédito agrícola). O projeto evoluiu para um sistema de **Gestão do
> Conhecimento Pessoal (PKM)** com grafo de notas interconectadas e
> assistente de IA. Esta versão descreve o estado real do software.

---

## 1. Introdução

### 1.1 Propósito

Este documento especifica os requisitos de software para o sistema **DeepThinker**. O objetivo é definir formalmente as funcionalidades, restrições e interações de dados para uma aplicação web que ajuda o usuário a capturar, conectar e refletir sobre suas ideias através de um grafo de conhecimento e de um assistente de IA local.

### 1.2 Escopo do Sistema

O DeepThinker consiste em duas aplicações operando de forma desacoplada:

- **DeepThinker API (Backend):** Engine construída em Laravel (PHP 8.3+) que processa regras de negócio, gerencia o estado no banco SQLite local e expõe endpoints REST. Integra-se com um servidor de LLM local via API compatível com OpenAI (LM Studio).

- **DeepThinker Web (Frontend):** Interface SPA construída em React + TypeScript + Vite + TailwindCSS, com visualização de grafo via D3.js.

```
┌────────────────────────┐                 ┌─────────────────────────┐
│   DeepThinker Web      │   HTTP/JSON     │    DeepThinker API      │
│   (React + TSX)        │◄──────────────►│       (Laravel)         │
│   - mobile-first       │                 │   - SQLite local        │
│   - D3.js knowledge    │                 │   - LLM local via HTTP  │
│     graph              │                 └───────────┬─────────────┘
└────────────────────────┘                             │
                                                      │ HTTP
                                                      ▼
                                          ┌───────────────────────────┐
                                          │  LM Studio (OpenAI-compat)│
                                          │  http://localhost:1234/v1 │
                                          └───────────────────────────┘
```

### 1.3 Restrições de Design e Implementação

- **Mobile-first:** O frontend deve funcionar primariamente em navegadores mobile (PWA-style responsivo), e em desktop como melhoria.
- **Sem dependências cloud:** O backend roda localmente com PHP 8.3+ e SQLite. O LLM roda localmente via LM Studio. Nenhum serviço externo é necessário.
- **Tipagem estrita:** TypeScript com `strict: true` no frontend. Backend com tipos PHPdoc quando aplicável.

---

## 2. Requisitos de Sistema

### 2.1 Requisitos Funcionais (RF)

#### [RF-001] Notas (CRUD)

| Campo | Detalhe |
|---|---|
| **Descrição** | O sistema deve persistir e gerenciar notas (ideias, pensamentos, links, documentos). |
| **Campos** | `id`, `title` (único), `content`, `summary`, `embedding` (reservado p/ futuro), `created_at`, `updated_at` |
| **Endpoints** | `GET/POST /api/notes`, `GET/PUT/DELETE /api/notes/{id}` |

#### [RF-002] Conexões via Wiki-Links

| Campo | Detalhe |
|---|---|
| **Descrição** | O usuário pode referenciar outras notas dentro do `content` usando a sintaxe `[[Título da Nota]]`. Ao salvar, o backend cria automaticamente uma `Connection` da nota atual para a nota referenciada. |
| **Algoritmo** | Observer dispara em `saved`. Regex captura `[[...]]`. Lookup via `whereIn('title', ...)` em batch. |
| **Comportamento** | Remover o link do conteúdo também remove a conexão (sincronização). |

#### [RF-003] Grafo de Conhecimento

| Campo | Detalhe |
|---|---|
| **Descrição** | Endpoint `GET /api/graph` retorna `{nodes, links}` para renderização D3.js no frontend. |
| **Render** | Visualização interativa com física (force-directed), zoom, drag, clique para abrir drawer. |

#### [RF-004] Assistente "Advogado do Diabo" (IA)

| Campo | Detalhe |
|---|---|
| **Descrição** | Sidebar lateral retrátil com chat que conversa com o usuário usando um LLM local. |
| **Modos** | Três modos: **Socrático** (faz perguntas), **Crítico** (encontra falhas), **Brainstorm** (gera alternativas). Selecionável via UI. |
| **Streaming** | Resposta do LLM é streama via SSE em `POST /api/chat/stream`. |
| **Histórico** | Mensagens podem ser persistidas via `POST /api/conversations` para consulta futura. |
| **Contexto** | Estimativa de tokens do lado do cliente. Quando a janela é excedida, mensagens antigas são truncadas e um modal avisa o usuário. |

#### [RF-005] "Criar Resumo" da Conversa

| Campo | Detalhe |
|---|---|
| **Descrição** | Botão no rodapé do chat dispara modal de confirmação. Ao confirmar, o backend envia a conversa ao LLM com prompt estruturado para extrair JSON com `title`, `summary` e `key_points[]`. |
| **Algoritmo de reuso** | Antes de criar novas notas, o backend consulta todas as notas existentes e monta um **hashmap de títulos normalizados** (lowercase + remoção de acentos). O prompt instrui o LLM a usar títulos exatos quando um ponto-chave coincide com uma chave existente. **Complexidade O(N)** em vez de O(N²). |
| **Linkagem** | Cada `key_point` vira uma nota (nova ou reusada), com `Connection` automática da nota-resumo para cada uma. |

#### [RF-006] Upload de Documentos

| Campo | Detalhe |
|---|---|
| **Descrição** | Usuário pode anexar PDF, TXT ou MD pela sidebar. Backend extrai texto (smalot/pdfparser), gera resumo via LLM e cria nota linkada ao grafo seguindo o mesmo algoritmo de reuso de chaves. |
| **Endpoint** | `POST /api/documents/upload` (multipart). Limite: 10 MB. |
| **Fallback** | Se o JSON estruturado falhar, salva o conteúdo bruto como nota sem parsing. |

### 2.2 Requisitos Não Funcionais (RNF)

#### [RNF-001] Mobile-First Responsivo

- Layout fluido (`min-h-screen` em vez de `h-screen`)
- Breakpoints `sm:` e `md:` do Tailwind
- Drawer full-screen em mobile, side-panel em desktop
- Touch/pinch-zoom no grafo (futuro)

#### [RNF-002] CORS

- Origem do frontend (Vite :5173) deve poder acessar a API (:8000) sem bloqueio de preflight
- Configurado via `config/cors.php` + middleware `AllowCorsFromFrontend`

#### [RNF-003] Sem Dependências Externas

- Banco SQLite local
- LLM via LM Studio (OpenAI-compat)
- Nenhum Docker, nenhuma API na cloud

#### [RNF-004] Cobertura de Testes

- Feature tests no backend via PHPUnit
- Cobertura mínima: rotas principais + algoritmo de reuso de chaves

#### [RNF-005] Performance

- Operação de reuso de chaves: O(N) garantido via hashmap normalizado
- Estimativa de tokens do lado do cliente antes de cada chamada
- Truncamento de conversa antes do envio se passar de 12k caracteres

---

## 3. Dicionário de Dados

### Tabela: `notes`

| Campo | Tipo | Restrição | Descrição |
|---|---|---|---|
| `id` | BigInt | PK, AutoIncrement | Identificador único |
| `title` | VARCHAR(255) | NOT NULL, UNIQUE | Título da nota |
| `content` | TEXT | NULL | Conteúdo em markdown |
| `summary` | TEXT | NULL | Resumo gerado por IA |
| `embedding` | TEXT | NULL | Reservado (JSON ou pgvector) |
| `created_at` | TIMESTAMP | | |
| `updated_at` | TIMESTAMP | | |

### Tabela: `connections`

| Campo | Tipo | Restrição | Descrição |
|---|---|---|---|
| `id` | BigInt | PK | |
| `source_note_id` | BigInt | FK → notes.id, CASCADE | Origem |
| `target_note_id` | BigInt | FK → notes.id, CASCADE | Destino |
| `weight` | FLOAT | DEFAULT 1.0 | Peso |
| UNIQUE | | (source, target) | Impede duplicatas |

### Tabela: `conversation_messages`

| Campo | Tipo | Restrição | Descrição |
|---|---|---|---|
| `id` | BigInt | PK | |
| `note_id` | BigInt | FK → notes.id, SET NULL | Nota associada (opcional) |
| `role` | ENUM | user, assistant, system | Quem falou |
| `content` | TEXT | NOT NULL | Conteúdo da mensagem |
| `audio_url` | VARCHAR | NULL | OU session:<uuid> para agrupar conversas sem nota |
| `created_at` | TIMESTAMP | | |

---

## 4. Stack

| Camada | Tecnologia |
|---|---|
| Backend | Laravel 13 + PHP 8.3+ + SQLite |
| Frontend | React 18 + TypeScript + Vite 5 + TailwindCSS 3 |
| Grafo | D3.js (force simulation) |
| LLM | LM Studio local (OpenAI-compatible) |
| PDF | smalot/pdfparser |
| Testes | PHPUnit 12 |
| CI | GitHub Actions (PHP 8.4 + SQLite) |

---

> **Histórico de Revisões**
>
> | Versão | Data | Autor | Descrição |
> |---|---|---|---|
> | 1.0 | Julho 2026 | VectorLink Team | Spec original (crédito agrícola) |
> | 2.0 | Setembro 2026 | Mavis + Henrique | Pivot para PKM (Segundo Cérebro) com LLM local |
