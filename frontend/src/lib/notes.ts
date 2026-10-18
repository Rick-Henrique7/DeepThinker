/**
 * Tudo que várias telas precisam saber sobre notas: tipos, links [[...]] e as chamadas à API.
 *
 * Links: igual ao Obsidian, [[Título]] liga a outra nota e [[Título|texto]] mostra "texto"
 * mas liga ao "Título". O backend (WikiLinks.java) segue a mesma regra.
 */
import { api } from './api';

export interface NoteRef {
  id: number;
  title: string;
}

/** Valor de uma propriedade do cabeçalho YAML: texto, número, sim/não, lista (ou vazio). */
export type PropertyValue = string | number | boolean | null | PropertyValue[] | { [key: string]: PropertyValue };
export type Properties = Record<string, PropertyValue>;

export interface NoteDetail extends NoteRef {
  content: string;
  summary?: string | null;
  source_type?: string | null;
  source_meta?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  /** Tags do cabeçalho + #tags do texto (o backend lê do conteúdo). */
  tags?: string[];
  /** Propriedades do cabeçalho ---. A chave "tags" traz só as tags do cabeçalho. */
  properties?: Properties;
  /** O cabeçalho existe, mas não é YAML válido. */
  frontmatter_error?: boolean;
}

/** Uma linha de GET /notes/index (Tabela, Quadro e Painel). */
export interface NoteIndexItem extends NoteRef {
  tags: string[];
  properties: Properties;
  source_type: string | null;
  created_at: string;
  updated_at: string;
  links_out: number;
  links_in: number;
  words: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Mention extends NoteRef {
  snippet: string;
}

export interface Backlinks {
  linked: Mention[];
  unlinked: Mention[];
}

/** Disparado quando uma nota é criada/alterada fora da tela do grafo (ex.: pela paleta Ctrl+K). */
export const NOTES_CHANGED_EVENT = 'deepthinker:notes-changed';
export const notifyNotesChanged = () => window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));

/**
 * "Medo de falir#Prós|medo" -> target "Medo de falir#Prós", note "Medo de falir", heading "Prós", label "medo".
 * O # aponta para uma seção da nota, como no Obsidian. Um título com # de verdade ("C# na prática")
 * também funciona: quem abre o link tenta primeiro o target inteiro e depois só a parte antes do #.
 */
export function parseWikiLink(inner: string): { target: string; label: string; note: string; heading: string | null } {
  const bar = inner.indexOf('|');
  const target = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
  const hash = target.indexOf('#');
  const note = hash > 0 ? target.slice(0, hash).trim() : target;
  const heading = hash > 0 ? target.slice(hash + 1).trim() || null : null;
  const alias = bar >= 0 ? inner.slice(bar + 1).trim() : '';
  const label = alias || (heading ? `${note} › ${heading}` : target);
  return { target, label, note, heading };
}

/** Acha a nota de um [[link]]: o título inteiro primeiro, depois só a parte antes do # (a seção). */
export function findLinkedNote<T extends NoteRef>(titles: T[], target: string): T | undefined {
  const { note } = parseWikiLink(target);
  const full = normalize(target);
  const short = normalize(note);
  return titles.find((t) => normalize(t.title) === full) ?? titles.find((t) => normalize(t.title) === short);
}

/** Prefixos dos links internos depois de convertidos para Markdown comum. */
export const WIKI_HREF = '#wiki:';
export const TAG_HREF = '#tag:';

/**
 * #tag: no início da linha ou depois de espaço; letras com acento, números, _, - e /.
 * As mesmas regras do backend (NoteMetadata.java).
 */
const WIKI_OR_TAG = /!?\[\[(.*?)\]\]|(^|\s)#([\p{L}\p{N}_/-]+)/gu;

/** ![[Nota]] sozinho numa linha: a outra nota aparece inteira aqui dentro (ver NoteEmbed). */
const EMBED_LINE = /^[ \t]*!\[\[([^\]\n]+)\]\][ \t]*$/gm;

/** Bloco que o wikiToMarkdown gera para cada ![[Nota]]; o NoteMarkdown desenha com o NoteEmbed. */
export const EMBED_LANG = 'nota-embutida';

/** "#Projeto/Loja-" -> "projeto/loja". Só número (#2026) não é tag. */
export function cleanTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').replace(/[/-]+$/, '').toLowerCase();
  return tag && !/^\d+$/.test(tag) ? tag : null;
}

/** A tag do filtro vale para ela mesma e para as filhas: "projeto" pega "projeto/loja". */
export const matchesTag = (tags: string[] | undefined, filter: string) =>
  !!tags?.some((t) => t === filter || t.startsWith(`${filter}/`));

/** Separa o texto em pedaços de código (``` e `crases`) e o resto, para não mexer dentro do código. */
function splitCode(text: string): { code: boolean; part: string }[] {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .filter((part) => part !== '')
    .map((part) => ({ code: part.startsWith('`'), part }));
}

/**
 * O Markdown padrão não conhece [[ ]] nem #tags. Antes de renderizar, trocamos cada [[Título|texto]]
 * por um link Markdown comum, [texto](#wiki:Título), e cada #tag por [#tag](#tag:tag);
 * o componente de link reconhece os prefixos. Código (``` e `crases`) fica intacto,
 * para não estragar um diagrama que tenha [[ ]] ou um "#include".
 */
export function wikiToMarkdown(text: string): string {
  const links = (part: string) =>
    part.replace(WIKI_OR_TAG, (match, inner: string | undefined, before: string, rawTag: string) => {
      if (inner !== undefined) {
        const { target, label } = parseWikiLink(inner);
        const safeLabel = label.replace(/([[\]\\])/g, '\\$1');
        return `[${safeLabel}](<${WIKI_HREF}${encodeURIComponent(target)}>)`;
      }
      const tag = cleanTag(rawTag);
      return tag ? `${before}[#${rawTag}](<${TAG_HREF}${encodeURIComponent(tag)}>)` : match;
    });
  return splitCode(text)
    .map(({ code, part }) =>
      code
        ? part
        : // ![[Nota]] numa linha só vira um bloco especial (a nota embutida). No meio de uma frase,
          // um quadro dentro do texto ficaria estranho: lá ele vira um link comum (o "!" é ignorado).
          // O split com grupo devolve [texto, alvo, texto, alvo...]: os ímpares são os alvos.
          part
            .split(EMBED_LINE)
            .map((piece, i) => (i % 2 === 1 ? `\n\`\`\`${EMBED_LANG}\n${parseWikiLink(piece).target}\n\`\`\`\n` : links(piece)))
            .join('')
    )
    .join('');
}

/**
 * Separa o cabeçalho YAML (entre as linhas ---) do texto. Mesmas regras do backend:
 * a primeira linha precisa ser --- e precisa existir outra linha --- fechando.
 */
export function splitFrontmatter(content: string): { yaml: string | null; body: string } {
  if (!content.startsWith('---')) return { yaml: null, body: content };
  const firstEnd = content.indexOf('\n');
  if (firstEnd < 0 || content.slice(0, firstEnd).trim() !== '---') return { yaml: null, body: content };
  let pos = firstEnd + 1;
  while (pos <= content.length) {
    const end = content.indexOf('\n', pos);
    const line = end < 0 ? content.slice(pos) : content.slice(pos, end);
    if (line.trim() === '---') {
      return { yaml: content.slice(firstEnd + 1, pos), body: end < 0 ? '' : content.slice(end + 1) };
    }
    if (end < 0) break;
    pos = end + 1;
  }
  return { yaml: null, body: content };
}

/**
 * Só a seção de um título: de "## Prós" até o próximo título do mesmo nível (ou maior).
 * Usado por ![[Nota#Prós]]. Títulos dentro de blocos de código não contam.
 */
export function extractSection(body: string, heading: string): string | null {
  const lines = body.split('\n');
  const want = normalize(heading);
  let start = -1;
  let level = 0;
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('```')) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0) {
      if (normalize(m[2]) === want) {
        start = i;
        level = m[1].length;
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start < 0 ? null : lines.slice(start).join('\n');
}

/** 2026-10-16 (ou com hora): o YAML guarda datas como texto e a tela mostra como data. */
export const isDateString = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(v);

/** Como mostrar um valor de propriedade para quem lê. */
export function formatPropertyValue(v: PropertyValue | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (Array.isArray(v)) return v.map((x) => formatPropertyValue(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (isDateString(v)) {
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
  }
  return v;
}

/**
 * O que a pessoa digitou vira o tipo certo no YAML: "3" e "7,5" viram número, true/false viram
 * sim/não, e para listas (como tags) "a, b" vira [a, b]. Zero na frente ("0123") continua texto.
 */
export function parsePropertyInput(text: string, asList = false): PropertyValue {
  const t = text.trim();
  if (asList) return t ? t.split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (/^-?(?:0|[1-9]\d*)$/.test(t) && Number.isSafeInteger(Number(t))) return Number(t);
  if (/^-?\d+[.,]\d+$/.test(t)) return Number(t.replace(',', '.'));
  if (t === 'true' || t === 'false') return t === 'true';
  return t;
}

/** Tira acento e caixa, para "decisao" achar "Decisão". */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Data local no formato AAAA-MM-DD (a nota do dia é a do fuso de quem usa). */
export function localIsoDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Uma fala do "Resumo em áudio": quem fala (Narrador, Ana ou Bruno) e o que diz. */
export interface AudioLine {
  speaker: string;
  text: string;
}

export type AudioStyle = 'resumo' | 'conversa';

export interface AudioSummary {
  title: string;
  style: AudioStyle;
  days: number;
  notes: NoteRef[];
  lines: AudioLine[];
}

/** Uma versão antiga (o estado da nota antes de uma mudança). reason = o que mudou depois. */
export interface NoteVersionItem {
  id: number;
  title: string;
  reason: string;
  created_at: string;
  size: number;
}

export interface NoteVersionDetail extends Omit<NoteVersionItem, 'size'> {
  content: string | null;
}

export const notesApi = {
  titles: () => api.get<NoteRef[]>('/notes/titles'),
  get: (id: number) => api.get<NoteDetail>(`/notes/${id}`),
  create: (title: string, content: string) => api.post<NoteDetail>('/notes', { title, content }),
  update: (id: number, title: string, content: string) => api.put<NoteDetail>(`/notes/${id}`, { title, content }),
  backlinks: (id: number) => api.get<Backlinks>(`/notes/${id}/backlinks`),
  linkMention: (targetId: number, sourceId: number) =>
    api.post<NoteDetail>(`/notes/${targetId}/mentions/${sourceId}/link`),
  daily: () => api.post<NoteDetail>(`/notes/daily?date=${localIsoDate()}`),
  index: () => api.get<NoteIndexItem[]>('/notes/index'),
  tags: () => api.get<TagCount[]>('/tags'),
  /** Merge patch: cada chave troca ou cria a propriedade; null apaga. */
  setProperties: (id: number, properties: Properties) =>
    api.patch<NoteDetail>(`/notes/${id}/properties`, { properties }),
  diagram: (body: { note_id?: number; text?: string; kind?: 'mindmap' | 'flowchart' }) =>
    api.post<{ mermaid: string }>('/notes/diagram', body),
  /** Desenha o mapa mental e grava na seção "## Mapa mental" da nota (troca o antigo, se houver). */
  mindmap: (id: number) => api.post<NoteDetail>(`/notes/${id}/mindmap`),
  versions: (id: number) => api.get<NoteVersionItem[]>(`/notes/${id}/versions`),
  version: (id: number, versionId: number) => api.get<NoteVersionDetail>(`/notes/${id}/versions/${versionId}`),
  restoreVersion: (id: number, versionId: number) =>
    api.post<{ note: NoteDetail; title_restored: boolean }>(`/notes/${id}/versions/${versionId}/restore`),
  /** A IA escreve um roteiro sobre as notas dos últimos `days` dias; quem fala é o navegador. */
  audioSummary: (days: number, style: AudioStyle) => api.post<AudioSummary>('/notes/audio-summary', { days, style }),
};

/** Trecho de texto sem a "sujeira" do Markdown: [[A|b]] vira b, tira #, *, - [ ] etc. */
export function plainSnippet(text: string): string {
  return text
    .replace(/!?\[\[(.*?)\]\]/g, (_m, inner: string) => parseWikiLink(inner).label)
    .replace(/\[[ x]\]/g, '')
    .replace(/[[\]]/g, '')
    .replace(/[#*`>|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
