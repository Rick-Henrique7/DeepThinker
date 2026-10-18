import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * API falsa para os testes de tela: responde o que cada tela pede ao backend
 * com dados de exemplo. Assim o teste mede só o layout, sem depender do servidor ou da IA.
 */
const TITLES = ['Plano de negócio', 'Medo de falhar', 'Reserva financeira', 'Hábitos', 'Memória', 'Cortisol', 'Sono', 'Leitura', 'Lisboa', 'Conversa com a Ana'];
const nodes = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, title: TITLES[i % 10] + (i >= 10 ? ` ${i}` : '') }));
const links = nodes.slice(1).flatMap((n, i) => [{ source: n.id, target: 1 + ((i * 7) % n.id) }]);

const provider = (label: string, model: string, ready: boolean) => ({
  model, has_api_key: ready, api_key_masked: ready ? 'gsk_****1234' : null, base_url: null, organization: null,
  label, description: `Modelos ${label}`, requires_api_key: true, configured: ready,
});
const settings = {
  active_provider: 'groq',
  plugins: ['openai', 'anthropic', 'groq'],
  providers: { openai: provider('OpenAI', 'gpt-4o-mini', false), anthropic: provider('Anthropic', 'claude', false), groq: provider('Groq', 'openai/gpt-oss-120b', true) },
  catalog: { openai: ['gpt-4o-mini'], anthropic: ['claude'], groq: ['openai/gpt-oss-120b'] },
};
const memoryStatus = { enabled: true, embedding: 'local', model: 'e5-small', semantic: true, state: 'ready', detail: 'Pronto', indexed: 120, total: 120 };
const memory = {
  embedding: 'local', model: 'e5-small', base_url: null, status: memoryStatus,
  options: [{ id: 'local', label: 'Local', description: 'Roda no servidor', plugin: null, default_model: 'e5-small', models: ['e5-small'], base_url_editable: false, default_base_url: null, local: true, guide: ['Nada a fazer'] }],
};
const conversation = [
  { role: 'user', content: 'Quero largar o emprego para abrir minha empresa ainda este ano.' },
  { role: 'assistant', content: 'O que você perderia se esperasse seis meses? Na sua nota sobre reserva financeira você calculou 4 meses de despesas. Isso mudou?' },
  { role: 'user', content: 'Acho que não mudou, mas a oportunidade pode passar.' },
  { role: 'assistant', content: 'Que sinais concretos indicam que a oportunidade some em seis meses? E quais deles você conseguiria testar ainda empregado?' },
];

// Painel: as mesmas notas do grafo, com tags e propriedades.
const TAGS = ['negocio', 'saude', 'leitura', 'viagem'];
const index = nodes.map((n, i) => ({
  ...n,
  tags: [TAGS[i % 4]],
  properties: i % 3 === 0 ? { status: ['ideia', 'fazendo', 'feito'][i % 3], prioridade: 1 + (i % 3) } : {},
  source_type: i % 9 === 0 ? 'document' : null,
  created_at: new Date(Date.UTC(2026, 6 + (i % 4), 1 + (i % 27))).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 1 + (i % 15))).toISOString(),
  links_out: i % 5,
  links_in: (i * 3) % 7,
  words: 40 + i * 13,
}));
const tags = TAGS.map((tag, i) => ({ tag, count: 15 - i * 3 }));
const canvases = [
  { id: 1, title: 'Plano da cafeteria', cards: 12, updated_at: '2026-10-15T14:00:00Z' },
  { id: 2, title: 'Rotina de sono', cards: 5, updated_at: '2026-10-10T09:30:00Z' },
];
const documents = [
  { id: 72, title: 'Plano da cafeteria Raiz', filename: 'plano-cafeteria-raiz.pdf', kind: 'pdf', size: 37_000, highlights: 3, created_at: '2026-10-16T12:00:00Z' },
  { id: 68, title: 'Hábitos atômicos (resumo)', filename: 'habitos.md', kind: null, size: null, highlights: 1, created_at: '2026-10-12T08:00:00Z' },
];

// Leitor: um PDF (o arquivo vem de e2e/fixtures) e um documento antigo, só com o texto.
const DOC_TEXT = 'Hábitos atômicos, em poucas linhas.\n\nPequenas melhoras diárias somam muito com o tempo. Um hábito fica fácil quando é óbvio, atraente, fácil e satisfatório.\n\nO ambiente pesa mais do que a força de vontade: deixe à vista o que você quer fazer e esconda o que quer evitar.';
const AMBIENTE = 'O ambiente pesa mais do que a força de vontade';
const docNotes: Record<number, unknown> = {
  72: { id: 72, title: 'Plano da cafeteria Raiz', content: 'Resumo do plano.', source_type: 'document', source_meta: { filename: 'plano-cafeteria-raiz.pdf' }, tags: [], properties: {} },
  68: { id: 68, title: 'Hábitos atômicos (resumo)', content: DOC_TEXT, source_type: 'document', source_meta: { filename: 'habitos.md' }, tags: [], properties: {} },
};
const hl = (id: number, quote: string, color: string, extra: object) => ({
  id, title: `“${quote.slice(0, 40)}”`, quote, note: '', page: null, rects: [], start: null, end: null, color, created_at: '2026-10-16T12:00:00Z', ...extra,
});
const docHighlights: Record<number, unknown[]> = {
  72: [
    hl(101, 'O custo fixo é o maior risco de uma cafeteria pequena.', 'amarelo', { page: 1, rects: [{ x: 0.1, y: 0.3, w: 0.8, h: 0.018 }] }),
    hl(102, 'reduzir o horário de funcionamento', 'verde', { page: 2, rects: [{ x: 0.3, y: 0.4, w: 0.4, h: 0.018 }], note: 'Plano B se o movimento demorar.' }),
  ],
  68: [hl(103, AMBIENTE, 'azul', { start: DOC_TEXT.indexOf(AMBIENTE), end: DOC_TEXT.indexOf(AMBIENTE) + AMBIENTE.length })],
};

function answer(path: string): unknown {
  const doc = /^\/(?:notes|documents)\/(\d+)(\/highlights)?$/.exec(path);
  if (doc && docNotes[Number(doc[1])]) {
    const id = Number(doc[1]);
    if (doc[2]) return docHighlights[id];
    return path.startsWith('/notes') ? docNotes[id] : documents.find((d) => d.id === id);
  }
  // Nota comum aberta (gaveta da nota) e o Canvas aberto.
  const note = /^\/notes\/(\d+)(\/[a-z]+)?$/.exec(path);
  if (note) {
    const n = nodes.find((x) => x.id === Number(note[1])) ?? nodes[0];
    if (note[2] === '/backlinks') return { linked: [{ id: 2, title: nodes[1].title, snippet: `Ligada a [[${n.title}]] numa conversa longa sobre planos.` }], unlinked: [] };
    if (note[2] === '/versions') return [{ id: 1, title: n.title, reason: 'edit', created_at: '2026-10-15T10:00:00Z', size: 900 }];
    if (note[2]) return [];
    return {
      id: n.id, title: n.title, tags: ['negocio'], properties: { status: 'fazendo', prioridade: 2 }, source_type: null,
      created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-15T10:00:00Z',
      content: `# ${n.title}\n\nUma ideia comprida para ver a quebra de linha no celular: ligar [[Reserva financeira]] com [[Medo de falhar]] e [[Plano de negócio]].\n\n- primeiro ponto da lista\n- segundo ponto, um pouco maior para ocupar duas linhas em telas estreitas\n\n#negocio #saude`,
    };
  }
  if (/^\/canvases\/\d+$/.test(path)) {
    const card = (id: string, x: number, y: number, text: string) => ({ id, type: 'text', x, y, width: 260, height: 120, text });
    return {
      id: 1, title: 'Plano da cafeteria', revision: 1, created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-15T14:00:00Z',
      data: {
        nodes: [card('a', 0, 0, '# Ideia\nCafé de bairro'), card('b', 340, 0, 'Custos fixos'), card('c', 0, 200, 'Clientes do bairro'), { id: 'd', type: 'file', x: 340, y: 200, width: 260, height: 120, file: 'Plano de negócio.md' }],
        edges: [{ id: 'e1', fromNode: 'a', toNode: 'b' }, { id: 'e2', fromNode: 'a', toNode: 'c' }],
      },
    };
  }
  if (path.startsWith('/graph')) return { nodes, links };
  // Quadro: colunas do servidor; só as notas que foram mandadas para lá (ver lib/board.ts)
  if (path === '/board') {
    const card = (n: { id: number; title: string }, only = false) => ({ id: n.id, title: n.title, tags: ['negocio'], board_only: only });
    return {
      property: 'status',
      columns: [
        { id: 1, name: 'a fazer', position: 0, cards: [card(nodes[0]), card(nodes[3]), { id: 900, title: 'Ligar para o fornecedor', tags: [], board_only: true }] },
        { id: 2, name: 'fazendo', position: 1, cards: [card(nodes[1]), card(nodes[4])] },
        { id: 3, name: 'feito', position: 2, cards: [card(nodes[2])] },
      ],
    };
  }
  if (path === '/notes/titles') return nodes;
  if (path === '/notes/index') return index;
  if (path === '/tags') return tags;
  if (path === '/canvases') return canvases;
  if (path === '/documents') return documents;
  if (path.startsWith('/chat/providers')) return { default: 'groq', providers: { groq: { available: true, models: ['openai/gpt-oss-120b'], label: 'Groq' } } };
  if (path.startsWith('/settings/llm')) return settings;
  if (path.startsWith('/memory/settings')) return memory;
  if (path.startsWith('/memory/status')) return memoryStatus;
  if (path.startsWith('/conversations')) return conversation;
  return {};
}

/** Entra como usuário de teste, escolhe o tema e liga a API falsa. */
export async function prepare(page: Page, opts: { theme?: string; loggedIn?: boolean } = {}) {
  await page.addInitScript(({ theme, loggedIn }) => {
    localStorage.setItem('deepthinker.theme', theme);
    if (loggedIn) {
      localStorage.setItem('deepthinker.token', 'teste');
      localStorage.setItem('deepthinker.user', JSON.stringify({ id: 1, name: 'Rick', email: 'rick@teste.com' }));
    }
  }, { theme: opts.theme ?? 'abismo', loggedIn: opts.loggedIn ?? true });
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api/, '');
    if (path === '/documents/72/file') {
      return route.fulfill({ status: 200, contentType: 'application/pdf', path: fileURLToPath(new URL('./fixtures/plano-cafeteria-raiz.pdf', import.meta.url)) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(path)) });
  });
}
