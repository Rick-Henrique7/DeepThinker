---
title: VectorLink — Sistema de Telemetria e Concessão de Crédito
subtitle: Especificação de Requisitos de Software (SRS)
date: Julho 2026
---

# Especificação de Requisitos de Software (SRS)

## Projeto: VectorLink — Sistema de Telemetria e Concessão de Crédito

---

## 1. Introdução

### 1.1 Propósito

Este documento especifica os requisitos de software para o sistema **VectorLink**. O objetivo é definir formalmente as funcionalidades, restrições e interações de dados para a criação de um ecossistema desacoplado que gerencia frotas agrícolas e analisa solicitações de crédito financeiro com base em telemetria.

### 1.2 Escopo do Sistema

O VectorLink consiste em duas aplicações operando de forma autônoma:

- **VectorLink API (Backend):** Engine construída em Laravel que processa regras de negócio, gerencia o estado no banco de dados e expõe endpoints REST protegidos.

- **VectorLink Dashboard (Frontend):** Interface de usuário construída em React + TypeScript para consumo da API.

---

## 2. Descrição Geral

### 2.1 Perspectiva do Produto

O sistema opera sob o modelo *API-First*. O frontend não possui conhecimento direto sobre as camadas de banco de dados, comunicando-se estritamente através do protocolo HTTP/HTTPS utilizando payloads no formato JSON.

```
┌────────────────────────┐                 ┌─────────────────────────┐
│   VectorLink Dashboard │   HTTP (JSON)   │     VectorLink API      │
│      (React + TSX)     │◄──────────────►│       (Laravel)         │
└────────────────────────┘                 └───────────┬─────────────┘
                                                        │
                                                        │ SQL
                                                        ▼
                                           ┌────────────┴─────────────┐
                                           │    Banco PostgreSQL      │
                                           └──────────────────────────┘
```

### 2.2 Restrições de Design e Implementação

- **Ambiente local:** O backend e o banco de dados PostgreSQL devem obrigatoriamente rodar conteinerizados via Docker (Laravel Sail).

- **Tipagem:** O frontend deve impor tipagem estrita via TypeScript, proibindo o uso do tipo genérico `any` para respostas de rede.

---

## 3. Requisitos de Sistema

### 3.1 Requisitos Funcionais (RF)

---

#### [RF-001] Cadastro de Produtores Rurais

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | O sistema deve persistir e gerenciar os dados dos clientes  |
|                 | proponentes de crédito.                                     |
| **Campos obrigatórios** | Nome Completo, CPF ou CNPJ (único), Localização      |
|                 | (Cidade/UF) e Limite de Crédito Base (Decimal).             |
| **Regra de Validação** | O backend deve rejeitar requisições com documentos    |
|                 | (CPF/CNPJ) inválidos ou duplicados.                         |

---

#### [RF-002] Gestão de Inventário de Maquinário Agrícola

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | Permite associar equipamentos ativos ao perfil de um        |
|                 | Produtor Rural.                                             |
| **Campos obrigatórios** | ID do Proprietário (FK), Modelo, Número de Série   |
|                 | (Único), Tipo (Trator, Colheitadeira, Pulverizador) e       |
|                 | Ano de Fabricação.                                          |

---

#### [RF-003] Ingestão de Dados de Telemetria (Simulada)

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | Endpoint público/interno que recebe estados operacionais    |
|                 | periódicos das máquinas cadastradas.                        |
| **Campos obrigatórios** | ID da Máquina (FK), Horas de Motor Acumuladas,     |
|                 | Consumo de Combustível (L/h) e Nível de Alerta Mecânico     |
|                 | (Enum: `LOW`, `MEDIUM`, `CRITICAL`).                        |

---

#### [RF-004] Motor de Análise Automatizada de Crédito (Regra de Negócio)

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | O sistema deve processar pedidos de financiamento cruzando  |
|                 | dados cadastrais com dados telemétricos.                    |

**Regras de Negócio Fundamentais (RN):**

- **RN-01 (Bloqueio por Risco):** Se o maquinário do produtor possuir qualquer alerta `CRITICAL` ativo nas últimas 48 horas de telemetria, o pedido de crédito é marcado automaticamente como "Revisão Manual".

- **RN-02 (Cálculo de Capacidade):** O valor máximo do crédito pré-aprovado não pode exceder 50% do `Limite de Crédito Base` se a média de horas de uso da frota atual for inferior a 100 horas/mês (indício de subutilização do maquinário).

---

### 3.2 Requisitos Não Funcionais (RNF)

---

#### [RNF-001] Segurança e Isolamento (CORS)

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | A API deve implementar um middleware de segurança que       |
|                 | bloqueie requisições de origens que não sejam               |
|                 | explicitamente o endereço do frontend React                 |
|                 | (`localhost:5173` ou domínio de produção).                  |

---

#### [RNF-002] Autenticação Stateless (Sanctum)

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | A comunicação de endpoints administrativos (como aprovação  |
|                 | de crédito) deve ser protegida por tokens de portador       |
|                 | (Bearer Tokens) gerenciados pelo Laravel Sanctum.           |

---

#### [RNF-003] Cobertura de Testes Automatizados

| Campo           | Detalhe                                                     |
|-----------------|-------------------------------------------------------------|
| **Descrição**   | O código do backend deve possuir cobertura de testes        |
|                 | automatizados.                                              |
| **Diretrizes**  | - Testes unitários devem validar isoladamente a **RN-02**.  |
|                 | - Testes de integração devem validar o fluxo completo do    |
|                 |   endpoint de cadastro até a escrita no banco PostgreSQL.   |

---

## 4. Dicionário de Dados Inicial

### Tabela: `proprietarios`

| Campo            | Tipo           | Restrição                | Descrição                    |
|------------------|----------------|--------------------------|------------------------------|
| `id`             | `BigInt`       | PK, AutoIncrement        | Identificador único           |
| `nome`           | `VARCHAR(255)` | `NOT NULL`               | Nome do produtor              |
| `documento`      | `VARCHAR(14)`  | `NOT NULL`, `UNIQUE`     | CPF ou CNPJ                   |
| `limite_credito` | `Decimal(12,2)`| `NOT NULL`               | Crédito máximo nominal        |

### Tabela: `maquinas`

| Campo             | Tipo           | Restrição                        | Descrição                    |
|-------------------|----------------|----------------------------------|------------------------------|
| `id`              | `BigInt`       | PK, AutoIncrement                | Identificador único           |
| `proprietario_id` | `BigInt`       | FK (`proprietarios.id`)          | Dono do maquinário            |
| `modelo`          | `VARCHAR(100)` | `NOT NULL`                       | Ex: "John Deere 8R"          |
| `numero_serie`    | `VARCHAR(50)`  | `NOT NULL`, `UNIQUE`             | Chassi/Identificação          |
| `tipo`            | `VARCHAR(30)`  | `NOT NULL`                       | Trator, Colheitadeira, etc.   |

---

> **Histórico de Revisões**
>
> | Versão | Data       | Autor   | Descrição                     |
> |--------|------------|---------|-------------------------------|
> | 1.0    | Julho 2026 | VectorLink Team | Versão inicial do documento. |