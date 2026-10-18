import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plug, Trash2 } from 'lucide-react';
import { accessTokens, mcpUrl, type AccessTokenInfo } from '../lib/pilot';
import { useConfirm } from './ConfirmDialog';

/** As ferramentas do servidor MCP (backend: mcp/McpTools.java), explicadas para quem usa. */
const MCP_TOOLS: [string, string][] = [
  ['list_notes', 'procura notas pelo título ou pela tag'],
  ['get_note', 'lê uma nota inteira'],
  ['get_board', 'vê o Quadro: colunas e cartões'],
  ['navigate', 'troca de tela (Pensar, Grafo, Quadro, Painel...)'],
  ['open_note', 'abre uma nota na sua tela'],
  ['create_note', 'cria uma nota (e abre na tela)'],
  ['move_card', 'arrasta um cartão para outra coluna'],
  ['add_to_board', 'manda uma nota para o Quadro'],
  ['remove_from_board', 'tira um cartão do Quadro (a nota continua existindo)'],
  ['create_card', 'cria um cartão que vive só no Quadro (fora do grafo)'],
  ['create_column', 'cria uma coluna'],
  ['rename_column', 'renomeia uma coluna'],
  ['delete_column', 'exclui uma coluna (os cartões saem do Quadro, nenhuma nota é apagada)'],
  ['list_canvases', 'lista os seus canvas'],
  ['create_canvas', 'cria um canvas com cartões (e setas ligando um ao outro)'],
  ['add_canvas_card', 'põe um cartão num canvas, com seta a partir de outro'],
];

/**
 * Acesso por MCP: tokens pessoais para IAs de fora (Claude Desktop, Claude Code, Cursor...)
 * usarem o Deep thinker, inclusive mexendo na tela ao vivo (modo piloto).
 */
export function McpAccessCard() {
  const confirm = useConfirm();
  const [tokens, setTokens] = useState<AccessTokenInfo[] | null>(null);
  const [name, setName] = useState('Claude Desktop');
  const [canWrite, setCanWrite] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = mcpUrl();

  const load = async () => {
    try {
      const list = await accessTokens.list();
      setTokens(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTokens([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const r = await accessTokens.create(name, canWrite);
      setCreated({ name: r.info.name, token: r.token });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (t: AccessTokenInfo) => {
    const ok = await confirm({
      title: 'Revogar token?',
      message: `"${t.name}" deixa de funcionar na hora. A IA que usa este token perde o acesso.`,
      confirmText: 'Revogar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await accessTokens.revoke(t.id);
      if (created && t.prefix && created.token.startsWith(t.prefix)) setCreated(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const token = created?.token ?? '<seu token>';
  const claudeCode = `claude mcp add --transport http deep-thinker ${url} --header "Authorization: Bearer ${token}"`;
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        'deep-thinker': {
          command: 'npx',
          args: ['-y', 'mcp-remote', url, '--header', `Authorization: Bearer ${token}`],
        },
      },
    },
    null,
    2
  );

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Plug className="h-4 w-4" strokeWidth={1.75} />
          Acesso por MCP
        </div>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Deixe outras IAs (Claude Desktop, Claude Code, Cursor...) usarem o Deep thinker: ler e criar notas, trocar
          de tela e mover cartões no Quadro. Com o app aberto, você vê a IA mexendo ao vivo e pode parar quando quiser.
        </p>
        <details className="mt-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-xs text-neutral-400">
          <summary className="cursor-pointer select-none py-1 font-medium text-neutral-300">Como usar</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
            <li>
              <b className="text-neutral-300">O que é:</b> MCP é o jeito padrão de uma IA usar outro programa. Você dá um
              token para a IA, e ela passa a ter as ferramentas do Deep thinker.
            </li>
            <li>
              <b className="text-neutral-300">Crie um token</b> aqui embaixo. O nome que você der aparece no cursor da IA.
              Deixe "pode criar notas e mover cartões" ligado se quiser que ela altere coisas.
            </li>
            <li>
              <b className="text-neutral-300">Cole na sua IA:</b> no Claude Code, rode o comando que aparece depois de
              criar o token; no Claude Desktop, cole o JSON em Configurações › Desenvolvedor; no Cursor, em Settings ›
              MCP, use o mesmo endereço e o cabeçalho <code>Authorization: Bearer &lt;token&gt;</code>.
            </li>
            <li>
              <b className="text-neutral-300">Deixe o Deep thinker aberto</b> no navegador para ver a IA mexendo. A
              faixa embaixo tem o botão Parar, e qualquer clique seu pausa a IA.
            </li>
            <li>
              <b className="text-neutral-300">Peça em português</b>, por exemplo: "No Deep thinker, crie uma coluna
              Revisão no Quadro e mova para ela os cartões que falam de orçamento."
            </li>
          </ol>
          <p className="mt-3 font-medium text-neutral-300">O que a IA pode fazer</p>
          <ul className="mt-1 space-y-1 leading-relaxed" data-mcp-tools>
            {MCP_TOOLS.map(([name, text]) => (
              <li key={name}>
                <code className="text-neutral-300">{name}</code> — {text}
              </li>
            ))}
          </ul>
          <p className="mt-2 leading-relaxed">
            Nada é apagado de vez: tirar do Quadro ou excluir uma coluna não apaga notas, e cada mudança fica no
            histórico de versões. Para revogar o acesso, apague o token.
          </p>
        </details>
      </div>

      <div>
        <label className="text-xs text-neutral-500 uppercase tracking-wider">Endereço do servidor</label>
        <CopyLine text={url} />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-neutral-500 uppercase tracking-wider">Novo token</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Claude Desktop)"
            maxLength={80}
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating || !name.trim()}
            className="flex items-center justify-center gap-2 bg-white text-black font-medium text-sm px-4 min-h-[44px] rounded-full hover:bg-neutral-200 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Criar token
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          Pode criar notas e mover cartões (sem isso, a IA só lê e navega)
        </label>
        <p className="text-[11px] text-neutral-600">O nome aparece no cursor da IA quando ela mexe na tela.</p>
      </div>

      {created && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-3">
          <p className="text-xs text-emerald-200">
            Token de <b>{created.name}</b> criado. Copie agora: ele não aparece de novo.
          </p>
          <CopyLine text={created.token} />
          <div>
            <p className="text-[11px] text-neutral-400 mb-1">Claude Code (no terminal):</p>
            <CopyBlock text={claudeCode} />
          </div>
          <div>
            <p className="text-[11px] text-neutral-400 mb-1">
              Claude Desktop (Configurações › Desenvolvedor › Editar configuração, precisa do Node.js):
            </p>
            <CopyBlock text={claudeDesktop} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="space-y-1.5">
        <label className="text-xs text-neutral-500 uppercase tracking-wider">Tokens ativos</label>
        {tokens === null ? (
          <p className="text-xs text-neutral-500">Carregando...</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-neutral-500">Nenhum token ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200 truncate">{t.name}</p>
                  <p className="text-[11px] text-neutral-500">
                    <code>{t.prefix}…</code> · {t.can_write ? 'lê e altera' : 'só leitura'} ·{' '}
                    {t.last_used_at ? `usado em ${new Date(t.last_used_at).toLocaleString()}` : 'nunca usado'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(t)}
                  aria-label={`Revogar ${t.name}`}
                  title="Revogar"
                  className="flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-full text-neutral-500 hover:text-rose-300 hover:bg-neutral-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };
  return [copied, copy];
}

function CopyLine({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="mt-1 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 pl-3 pr-1 py-1">
      <code className="flex-1 truncate text-xs text-neutral-200">{text}</code>
      <button
        type="button"
        onClick={() => copy(text)}
        aria-label="Copiar"
        className="flex items-center justify-center h-11 w-11 sm:h-9 sm:w-9 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-3 pr-11 text-[11px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-all">
        {text}
      </pre>
      <button
        type="button"
        onClick={() => copy(text)}
        aria-label="Copiar"
        className="absolute right-1 top-1 flex items-center justify-center h-11 w-11 sm:h-9 sm:w-9 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
