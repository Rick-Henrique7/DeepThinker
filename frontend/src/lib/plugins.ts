import { BASE_URL } from './api';
import { authFetch } from './auth';

/**
 * Plugins da comunidade, a parte que roda no navegador.
 *
 * Como o app tem várias pessoas, plugin nenhum pode ver os dados de ninguém sem pedir.
 * Por isso cada plugin roda isolado:
 *
 * 1. Num <iframe sandbox="allow-scripts"> SEM "allow-same-origin": o iframe ganha uma origem
 *    vazia ("null"). Ele não lê o localStorage do app (onde fica o login), nem cookies, nem o
 *    DOM da página, e não chama a nossa API como se fosse a pessoa.
 * 2. Com uma política de segurança (CSP) "default-src 'none'": sem rede nenhuma. O plugin não
 *    consegue mandar nada para fora (fetch, imagem, WebSocket, tudo bloqueado).
 * 3. A única conversa com o app é por postMessage, numa API pequena (window.deepthinker).
 *    Cada pedido é conferido aqui contra as permissões que o plugin declarou e a pessoa aceitou.
 *
 * API do plugin (o que o autor escreve):
 *   deepthinker.registerCommand(id, título, função)   [commands]   vira um item no Ctrl+K
 *   await deepthinker.getActiveNote()                  [note:read]  a nota aberta (ou null)
 *   await deepthinker.insertText(texto)                [note:write] põe texto no editor da nota
 *   deepthinker.notify(mensagem)                       [sempre]     aviso rápido na tela
 *
 * insertText só mexe no editor: quem salva é a pessoa, com o botão Salvar. Plugin nenhum
 * grava uma nota sozinho.
 */

export type PluginPermission = 'note:read' | 'note:write' | 'commands';

export const PERMISSION_LABELS: Record<PluginPermission, string> = {
  'note:read': 'Ler a nota que está aberta',
  'note:write': 'Inserir texto no editor da nota aberta (você ainda precisa salvar)',
  commands: 'Adicionar comandos na paleta Ctrl+K',
};

export interface InstalledPlugin {
  id: number;
  key: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  permissions: PluginPermission[];
  code: string;
  enabled: boolean;
  updated_at: string;
}

/** O arquivo .json de um plugin, como o autor distribui. */
export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  permissions?: string[];
  code: string;
}

export const PLUGINS_CHANGED_EVENT = 'deepthinker:plugins-changed';
export const notifyPluginsChanged = () => window.dispatchEvent(new Event(PLUGINS_CHANGED_EVENT));

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let message = `HTTP ${r.status}`;
    try {
      message = (await r.json()).message ?? message;
    } catch {
      // corpo sem JSON
    }
    throw new Error(message);
  }
  return (await r.json()) as T;
}

export const pluginsApi = {
  list: async () => json<InstalledPlugin[]>(await authFetch(`${BASE_URL}/plugins`)),
  install: async (m: PluginManifest) =>
    json<InstalledPlugin>(
      await authFetch(`${BASE_URL}/plugins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(m),
      })
    ),
  setEnabled: async (id: number, enabled: boolean) =>
    json<InstalledPlugin>(
      await authFetch(`${BASE_URL}/plugins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
    ),
  uninstall: async (id: number) =>
    json<{ message: string }>(await authFetch(`${BASE_URL}/plugins/${id}`, { method: 'DELETE' })),
};

/** Lê e confere o básico de um arquivo de plugin antes de mandar para o servidor. */
export function parseManifest(text: string): PluginManifest {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const o = m as Partial<PluginManifest>;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.code !== 'string') {
    throw new Error('O arquivo precisa ter "id", "name" e "code".');
  }
  return {
    id: o.id,
    name: o.name,
    version: typeof o.version === 'string' ? o.version : undefined,
    description: typeof o.description === 'string' ? o.description : undefined,
    author: typeof o.author === 'string' ? o.author : undefined,
    permissions: Array.isArray(o.permissions) ? o.permissions.filter((p): p is string => typeof p === 'string') : [],
    code: o.code,
  };
}

// ------------------------------------------------------------ nota aberta

/** O editor da nota aberta se registra aqui (NoteDrawer); os plugins leem e inserem por ele. */
export interface ActiveNoteHandle {
  get: () => { id: number; title: string; content: string; tags: string[]; properties: Record<string, unknown> };
  insert: (text: string) => void;
}

let activeNote: ActiveNoteHandle | null = null;
export function setActiveNote(handle: ActiveNoteHandle | null) {
  activeNote = handle;
}

// ------------------------------------------------------------ comandos (Ctrl+K)

export interface PluginCommand {
  pluginId: number;
  pluginName: string;
  id: string;
  title: string;
}

let commands: PluginCommand[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const pluginCommandStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => commands,
};

// ------------------------------------------------------------ avisos

export interface PluginNotice {
  id: number;
  plugin: string;
  message: string;
  kind: 'info' | 'error';
}
type NoticeListener = (n: PluginNotice) => void;
const noticeListeners = new Set<NoticeListener>();
let noticeSeq = 0;
export function onPluginNotice(l: NoticeListener) {
  noticeListeners.add(l);
  return () => {
    noticeListeners.delete(l);
  };
}
const notice = (plugin: string, message: string, kind: 'info' | 'error' = 'info') =>
  noticeListeners.forEach((l) => l({ id: ++noticeSeq, plugin, message, kind }));

// ------------------------------------------------------------ o iframe

/** Código que roda dentro do iframe antes do plugin: cria window.deepthinker. */
const SDK = `(() => {
  const pending = new Map();
  const handlers = new Map();
  let seq = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    parent.postMessage({ __dt: 1, type: 'call', id, method, params }, '*');
  });
  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const m = e.data;
    if (!m || m.__dt !== 1) return;
    if (m.type === 'result') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
    } else if (m.type === 'run') {
      const h = handlers.get(m.command);
      if (h) Promise.resolve().then(h).catch((err) => call('notify', { message: 'Erro: ' + (err && err.message || err), kind: 'error' }));
    }
  });
  window.deepthinker = Object.freeze({
    registerCommand(id, title, run) {
      if (typeof run !== 'function') throw new Error('registerCommand precisa de uma função');
      handlers.set(String(id), run);
      return call('registerCommand', { id: String(id), title: String(title) });
    },
    getActiveNote: () => call('getActiveNote'),
    insertText: (text) => call('insertText', { text: String(text) }),
    notify: (message) => call('notify', { message: String(message) }),
  });
})();`;

function srcdoc(code: string): string {
  // "</script" dentro do código fecharia a tag antes da hora
  const safe = code.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">
</head><body><script>${SDK}</script><script>
try {
${safe}
} catch (e) { deepthinker.notify('Erro ao iniciar: ' + (e && e.message || e)); }
</script></body></html>`;
}

const MAX_COMMANDS = 10;
const MAX_INSERT = 20_000;
/** Pedidos por plugin a cada 5 s: um plugin com defeito não trava o app. */
const RATE = 40;

interface Running {
  plugin: InstalledPlugin;
  frame: HTMLIFrameElement;
  calls: number[];
}

const running = new Map<number, Running>();

function reply(r: Running, id: unknown, result?: unknown, error?: string) {
  r.frame.contentWindow?.postMessage({ __dt: 1, type: 'result', id, result: result ?? null, error }, '*');
}

function handleCall(r: Running, msg: { id: unknown; method: unknown; params?: Record<string, unknown> }) {
  const { plugin } = r;
  const now = performance.now();
  r.calls = r.calls.filter((t) => now - t < 5000);
  if (r.calls.length >= RATE) return reply(r, msg.id, null, 'Pedidos demais. Espere um pouco.');
  r.calls.push(now);

  const has = (p: PluginPermission) => plugin.permissions.includes(p);
  const deny = (p: PluginPermission) => reply(r, msg.id, null, `Sem permissão: ${p}`);
  const params = msg.params ?? {};

  switch (msg.method) {
    case 'registerCommand': {
      if (!has('commands')) return deny('commands');
      const id = String(params.id ?? '').slice(0, 50);
      const title = String(params.title ?? '').trim().slice(0, 80);
      if (!id || !title) return reply(r, msg.id, null, 'Comando precisa de id e título.');
      const mine = commands.filter((c) => c.pluginId === plugin.id);
      if (!mine.some((c) => c.id === id) && mine.length >= MAX_COMMANDS) {
        return reply(r, msg.id, null, `No máximo ${MAX_COMMANDS} comandos por plugin.`);
      }
      commands = [...commands.filter((c) => !(c.pluginId === plugin.id && c.id === id)), { pluginId: plugin.id, pluginName: plugin.name, id, title }];
      emit();
      return reply(r, msg.id, true);
    }
    case 'getActiveNote': {
      if (!has('note:read')) return deny('note:read');
      return reply(r, msg.id, activeNote ? activeNote.get() : null);
    }
    case 'insertText': {
      if (!has('note:write')) return deny('note:write');
      if (!activeNote) return reply(r, msg.id, null, 'Nenhuma nota aberta.');
      const text = String(params.text ?? '');
      if (text.length > MAX_INSERT) return reply(r, msg.id, null, 'Texto grande demais.');
      activeNote.insert(text);
      return reply(r, msg.id, true);
    }
    case 'notify': {
      const message = String(params.message ?? '').slice(0, 200);
      if (message) notice(plugin.name, message, params.kind === 'error' ? 'error' : 'info');
      return reply(r, msg.id, true);
    }
    default:
      return reply(r, msg.id, null, `Função desconhecida: ${String(msg.method)}`);
  }
}

// Um único ouvinte para todos os plugins: a mensagem só vale se veio do iframe daquele plugin.
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || msg.__dt !== 1 || msg.type !== 'call') return;
    for (const r of running.values()) {
      if (e.source === r.frame.contentWindow) {
        handleCall(r, msg);
        return;
      }
    }
  });
}

function stop(id: number) {
  const r = running.get(id);
  if (!r) return;
  r.frame.remove();
  running.delete(id);
  commands = commands.filter((c) => c.pluginId !== id);
  emit();
}

/** Liga os plugins ativos e desliga os que saíram. Plugin com código novo reinicia. */
export function syncPlugins(list: InstalledPlugin[]) {
  listen();
  const wanted = new Map(list.filter((p) => p.enabled).map((p) => [p.id, p]));
  for (const [id, r] of running) {
    const next = wanted.get(id);
    if (!next || next.updated_at !== r.plugin.updated_at) stop(id);
  }
  for (const p of wanted.values()) {
    if (running.has(p.id)) continue;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.dataset.plugin = p.key;
    frame.title = `Plugin ${p.name}`;
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    frame.srcdoc = srcdoc(p.code);
    running.set(p.id, { plugin: p, frame, calls: [] });
    document.body.appendChild(frame);
  }
}

export function stopAllPlugins() {
  for (const id of [...running.keys()]) stop(id);
}

/** Ctrl+K escolheu um comando de plugin: avisa o iframe dele. */
export function runPluginCommand(c: PluginCommand) {
  const r = running.get(c.pluginId);
  r?.frame.contentWindow?.postMessage({ __dt: 1, type: 'run', command: c.id }, '*');
}
