import { useEffect, useRef, useState } from 'react';
import { Network, Loader2, Save, TestTube2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  getMemorySettings,
  getMemoryStatus,
  saveMemorySettings,
  testMemory,
  type MemorySettings,
  type MemoryStatus,
} from '../lib/memory';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

/** Opcoes que rodam dentro do app, sem nome de modelo para digitar. */
const BUILT_IN = ['palavras', 'local'];

/** O modelo local esta sendo baixado ou carregado agora? */
const preparing = (s: MemoryStatus | null) => s?.state === 'baixando' || s?.state === 'carregando';

/**
 * Configuracoes > Memoria da IA: escolha do modelo de embeddings que transforma
 * as notas em vetores, com o passo a passo de como conectar cada opcao.
 * As opcoes (e o passo a passo) vem do backend (EmbeddingCatalog.java).
 */
export function MemorySettingsCard() {
  const [data, setData] = useState<MemorySettings | null>(null);
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [selected, setSelected] = useState('palavras');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [indexing, setIndexing] = useState(false);
  const poll = useRef<number | null>(null);

  const apply = (s: MemorySettings) => {
    setData(s);
    setStatus(s.status);
    setSelected(s.embedding);
    setModel(s.model ?? '');
    setBaseUrl(s.base_url ?? '');
  };

  useEffect(() => {
    getMemorySettings()
      .then(apply)
      .catch((e) => setFeedback({ kind: 'error', message: (e as Error).message }));
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, []);

  // Depois de trocar de modelo, os vetores sao recalculados no servidor: acompanha o progresso
  const watchProgress = () => {
    if (poll.current) window.clearInterval(poll.current);
    let rounds = 0;
    setIndexing(true);
    poll.current = window.setInterval(async () => {
      rounds++;
      try {
        const s = await getMemoryStatus();
        setStatus(s);
        // O download do modelo local (~120 MB) pode levar alguns minutos: espera ele tambem
        if ((s.indexed >= s.total && !preparing(s)) || rounds > 300) {
          window.clearInterval(poll.current!);
          poll.current = null;
          setIndexing(false);
        }
      } catch {
        window.clearInterval(poll.current!);
        poll.current = null;
        setIndexing(false);
      }
    }, 2000);
  };

  const option = data?.options.find((o) => o.id === selected);

  const choose = (id: string) => {
    setSelected(id);
    setFeedback(null);
    const o = data?.options.find((x) => x.id === id);
    // Mesma opcao que ja esta salva: mostra o que esta salvo; outra: os padroes dela
    if (data && id === data.embedding) {
      setModel(data.model ?? '');
      setBaseUrl(data.base_url ?? '');
    } else {
      setModel(o?.default_model ?? '');
      setBaseUrl(o?.default_base_url ?? '');
    }
  };

  const onSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload: { embedding: string; model?: string; base_url?: string } = { embedding: selected };
      if (option && !BUILT_IN.includes(option.id) && model.trim()) payload.model = model.trim();
      if (option?.base_url_editable && baseUrl.trim()) payload.base_url = baseUrl.trim();
      const s = await saveMemorySettings(payload);
      apply(s);
      setFeedback({
        kind: s.status.problem ? 'error' : 'success',
        message:
          s.status.problem ??
          (selected === 'local' && !s.status.semantic
            ? 'Memoria salva. Baixando o modelo local (~120 MB, so desta vez). Ate terminar, a busca segue por palavras.'
            : 'Memoria salva. Os vetores das suas notas estao sendo recalculados.'),
      });
      watchProgress();
    } catch (e) {
      setFeedback({ kind: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setFeedback(null);
    const r = await testMemory();
    setFeedback(
      r.ok
        ? { kind: 'success', message: `Memoria funcionando com ${r.model} (${r.dimensions} dimensoes, ${r.ms} ms).` }
        : { kind: 'error', message: r.error ?? 'Falha desconhecida.' },
    );
    setTesting(false);
  };

  if (!data) {
    return (
      <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 text-sm text-neutral-500">
        {feedback ? feedback.message : <Loader2 className="h-4 w-4 animate-spin" />}
      </section>
    );
  }

  const dirty = selected !== data.embedding || model !== (data.model ?? '') || baseUrl !== (data.base_url ?? '');

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Network className="h-4 w-4" strokeWidth={1.75} />
          Memoria da IA
        </div>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Antes de responder, o Advogado do Diabo busca as suas notas parecidas com a conversa. Quem encontra as
          parecidas e um modelo de embeddings, que transforma cada nota num vetor de significado. Ele e separado do
          modelo do chat: da para conversar com o Groq e usar a memoria local, por exemplo.
        </p>
      </div>

      {status && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className={[
              'px-2 py-0.5 rounded-full',
              status.problem
                ? 'bg-amber-500/15 text-amber-300'
                : status.semantic
                ? 'bg-sky-500/15 text-sky-300'
                : 'bg-neutral-800 text-neutral-400',
            ].join(' ')}
          >
            {status.problem
              ? 'atencao'
              : preparing(status)
              ? status.state === 'baixando' ? 'baixando modelo' : 'carregando modelo'
              : status.semantic
              ? 'por significado'
              : 'por palavras'}
          </span>
          {preparing(status) && <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />}
          <span className="text-neutral-400">
            {status.indexed} de {status.total} notas com vetor
            {status.indexed < status.total && indexing && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
          </span>
          <span className="text-neutral-600 truncate max-w-full">{status.model}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.options.map((o) => {
          const active = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              className={[
                'text-left p-3 rounded-xl border transition-colors',
                active ? 'border-sky-500/60 bg-sky-500/10' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white text-sm">{o.label}</span>
                {o.id === data.embedding && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                    em uso
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">{o.description}</p>
            </button>
          );
        })}
      </div>

      {option && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-3">
          <div>
            <div className="text-xs text-neutral-500 uppercase tracking-wider">Como conectar</div>
            <ol className="mt-1.5 space-y-1 text-sm text-neutral-300 list-decimal list-inside">
              {option.guide.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {!BUILT_IN.includes(option.id) && (
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">Modelo de embeddings</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={option.default_model}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500/60"
              />
              {option.models.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {option.models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModel(m)}
                      className={[
                        'text-xs px-2 py-1 rounded-full border transition-colors',
                        model === m
                          ? 'border-sky-500/60 bg-sky-500/10 text-sky-300'
                          : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900',
                      ].join(' ')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {option.base_url_editable && (
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">Endereco</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={option.default_base_url ?? 'http://localhost:11434/v1'}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-sky-500/60"
              />
            </div>
          )}

          {option.plugin && (
            <p className="text-[11px] text-neutral-500">
              A chave e a mesma do plugin de IA acima. Nao precisa digitar de novo.
            </p>
          )}
          {option.local && (
            <p className="text-[11px] text-amber-400/80">
              Roda no seu computador. Com o app publicado na internet, o servidor nao alcanca o seu PC.
            </p>
          )}
          {selected !== data.embedding && (
            <p className="text-[11px] text-neutral-500">
              Ao salvar, os vetores de todas as suas notas sao recalculados com o novo modelo.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-white text-black font-medium text-sm min-h-[44px] fino:min-h-0 px-4 py-2 rounded-full hover:bg-neutral-200 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar memoria
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing || saving}
          className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-200 font-medium text-sm min-h-[44px] fino:min-h-0 px-4 py-2 rounded-full hover:bg-neutral-800 disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
          Testar memoria
        </button>
      </div>

      {feedback && (
        <div
          className={[
            'flex items-start gap-2 p-3 rounded-xl text-sm border',
            feedback.kind === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-200',
          ].join(' ')}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <p className="break-words">{feedback.message}</p>
        </div>
      )}
    </section>
  );
}
