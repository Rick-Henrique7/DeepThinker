/**
 * Modelos de nota (como os "Templates" do Obsidian e do Notion): esqueletos prontos
 * para não começar da página em branco. Cada um termina com uma pergunta do Advogado do Diabo.
 *
 * O cabeçalho entre as linhas --- são as propriedades da nota (tipo, status...). É com elas
 * que a Tabela e o Quadro organizam as notas: uma Decisão nasce "em aberto" e vai para "decidida".
 */
export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  content: string;
}

export const TEMPLATES: NoteTemplate[] = [
  {
    id: 'decisao',
    label: 'Decisão',
    description: 'Opções, prós e contras, e o que faria você mudar de ideia',
    content: `---
tipo: decisão
status: em aberto
confiança: 3
---
## A decisão

## Opções
1. 
2. 

## Prós e contras
| Opção | Prós | Contras |
| --- | --- | --- |
|  |  |  |

## O que me faria mudar de ideia

> Advogado do Diabo: qual é o melhor argumento contra a opção que você prefere?
`,
  },
  {
    id: 'livro',
    label: 'Livro lido',
    description: 'Ideia central, trechos e onde isso se liga ao que você já sabe',
    content: `---
tipo: livro
autor:
status: lendo
nota:
---
## Ideia central em uma frase

## Trechos que me marcaram
- 

## Onde isso se liga
- (digite [[ para ligar a outra nota)

> Advogado do Diabo: em que ponto você discorda do autor?
`,
  },
  {
    id: 'reuniao',
    label: 'Reunião',
    description: 'Pauta, decisões e próximos passos',
    content: `---
tipo: reunião
quem:
quando:
---
## Pauta
- 

## Decisões
- 

## Próximos passos
- [ ] 

> Advogado do Diabo: qual decisão de hoje vai parecer errada daqui a um mês?
`,
  },
  {
    id: 'negocio',
    label: 'Ideia de negócio',
    description: 'Problema, cliente, como ganha dinheiro e o maior risco',
    content: `---
tipo: ideia de negócio
status: ideia
confiança: 2
---
## Problema

## Para quem

## Como ganha dinheiro

## Maior risco

## Primeiro teste barato

> Advogado do Diabo: por que ninguém fez isso ainda?
`,
  },
];
