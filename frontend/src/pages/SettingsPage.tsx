import React, { useEffect, useState } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, TestTube2, Eye, EyeOff, RefreshCw, Cpu, Key, ExternalLink } from 'lucide-react';
import {
  getSettings,
  pluginIds,
  saveSettings,
  testProvider,
  type LlmProvider,
  type ProviderSnapshot,
  type SettingsSnapshot,
} from '../lib/settings';
import { MemorySettingsCard } from '../components/MemorySettingsCard';
import { AppearanceCard } from '../components/AppearanceCard';
import { McpAccessCard } from '../components/McpAccessCard';
import { PluginsCard } from '../components/PluginsCard';
import { isDesktop } from '../lib/desktop';

/**
 * Dica curta de como usar uma IA rodando no proprio PC (gratis e offline).
 * Fechada por padrao: so abre quem quiser saber.
 */
function LocalModelHint() {
  const code = 'px-1 rounded bg-neutral-800 text-neutral-300';
  return (
    <details className="group text-xs text-neutral-500">
      <summary className="cursor-pointer select-none text-neutral-400 hover:text-white">
        Rodar a IA no seu computador, de graça e sem internet
      </summary>
      <ul className="mt-2 space-y-1.5 list-disc pl-4">
        <li>
          <span className="text-neutral-300">LM Studio:</span> instale pelo site lmstudio.ai, baixe um modelo e ligue o servidor local (aba Developer). Aqui, escolha{' '}
          <span className="text-neutral-300">LM Studio (local)</span> e digite o nome do modelo.
        </li>
        <li>
          <span className="text-neutral-300">Ollama:</span> rode <code className={code}>ollama pull llama3.2</code>. Aqui,
          escolha <span className="text-neutral-300">Personalizado</span> com o endereço{' '}
          <code className={code}>http://localhost:11434/v1</code> e o modelo <code className={code}>llama3.2</code>.
        </li>
        <li>
          {isDesktop()
            ? 'No app desktop isso já funciona direto.'
            : 'Funciona no app desktop ou rodando o Deep thinker no seu PC. Na versão publicada na internet, o servidor não alcança o seu computador.'}
        </li>
      </ul>
    </details>
  );
}

/** Nome do plugin; o backend Java manda "label", o antigo nao. */
function labelOf(snap: SettingsSnapshot | null, id: LlmProvider): string {
  return snap?.providers[id]?.label ?? id;
}

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }
  | null;

/** O plugin tem o mínimo para funcionar (chave, se exigida)? Mesmo critério do selo "pronto". */
function isReady(snap: SettingsSnapshot | null, id: LlmProvider): boolean {
  const info = snap?.providers[id];
  return info?.configured ?? (!!info?.has_api_key || id === 'lmstudio');
}

/**
 * Settings / IA — escolha do plugin de IA (OpenAI, Claude, Gemini, Groq...),
 * modelo, API key e URL.
 *
 * A tela e montada a partir da "ficha" de cada plugin que o backend manda
 * (label, se exige chave, se o endereco e editavel...). Para aparecer um
 * provedor novo aqui basta cadastra-lo no backend (PluginCatalog.java).
 */
export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [provider, setProvider] = useState<LlmProvider>('lmstudio');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [organization, setOrganization] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const s = await getSettings();
      applySnapshot(s);
    } catch (e) {
      setFeedback({ kind: 'error', message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const applySnapshot = (s: SettingsSnapshot) => {
    setSnapshot(s);
    setProvider(s.active_provider);
    const p = s.providers[s.active_provider];
    setModel(p.model ?? '');
    setApiKey(''); // nunca volta chave crua — user precisa digitar
    setOrganization(p.organization ? p.organization.replace(/^\*+/, '') : '');
    setBaseUrl(p.base_url ?? '');
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * Clique num provedor ou num modelo da lista: salva na hora, como a tela promete.
   * Antes só o botão Salvar gravava, e quem trocava de tela perdia a escolha sem aviso.
   * Atualiza só o retrato do servidor; o que a pessoa está digitando (chave, URL) fica.
   */
  const quickSave = async (payload: Record<string, string>, message: string) => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await saveSettings(payload);
      setSnapshot(res.settings);
      setFeedback({ kind: 'success', message });
    } catch (e) {
      setFeedback({ kind: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // Trocar provider → recarrega valores daquela aba e, se ele já está pronto, ativa
  const onProviderChange = (next: LlmProvider) => {
    if (!snapshot) return;
    setProvider(next);
    const p = snapshot.providers[next];
    setModel(p.model ?? '');
    setApiKey('');
    setOrganization(p.organization ? p.organization.replace(/^\*+/, '') : '');
    setBaseUrl(p.base_url ?? '');
    if (next === snapshot.active_provider) {
      setFeedback(null);
    } else if (isReady(snapshot, next)) {
      quickSave({ provider: next }, `${labelOf(snapshot, next)} agora é a IA ativa.`);
    } else {
      // Sem chave ainda: ativar agora deixaria a IA sem funcionar
      setFeedback({
        kind: 'info',
        message: `Preencha os dados de ${labelOf(snapshot, next)} e clique em Salvar para ativá-lo.`,
      });
    }
  };

  const onPickModel = (m: string) => {
    setModel(m);
    if (!snapshot) return;
    // Só salva sozinho se este provedor já é o ativo ou está pronto para ser
    if (provider === snapshot.active_provider || isReady(snapshot, provider)) {
      quickSave({ provider, model: m }, `Modelo ${m} salvo para ${labelOf(snapshot, provider)}.`);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, string> = { provider };
      const info = snapshot?.providers[provider];
      if (model.trim()) payload.model = model.trim();
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      if (info?.base_url_editable && baseUrl.trim()) payload.base_url = baseUrl.trim();
      if (provider === 'openai' && organization.trim()) payload.organization = organization.trim();
      const res = await saveSettings(payload);
      applySnapshot(res.settings);
      setApiKey('');
      setFeedback({ kind: 'success', message: 'Configuracoes salvas.' });
    } catch (e) {
      setFeedback({ kind: 'error', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const r = await testProvider();
      if (r.ok) {
        setFeedback({
          kind: 'success',
          message: `Conexao OK com ${labelOf(snapshot, r.provider)}. Resposta: "${(r.reply ?? '').slice(0, 80)}"`,
        });
      } else {
        setFeedback({ kind: 'error', message: r.error ?? 'Falha desconhecida.' });
      }
    } catch (e) {
      setFeedback({ kind: 'error', message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="max-w-xl mx-auto px-1 py-12 text-center text-neutral-500">
        <Loader2 className="h-6 w-6 mx-auto animate-spin" />
        <p className="mt-2 text-sm">Carregando configuracoes...</p>
      </div>
    );
  }

  const currentSnap: ProviderSnapshot | undefined = snapshot?.providers[provider];
  // Algo na tela ainda não foi gravado no servidor?
  const dirty =
    !!snapshot &&
    (provider !== snapshot.active_provider ||
      model.trim() !== (currentSnap?.model ?? '') ||
      apiKey.trim() !== '' ||
      (!!currentSnap?.base_url_editable && baseUrl.trim() !== (currentSnap?.base_url ?? '')));
  const catalog = snapshot?.catalog[provider] ?? [];

  return (
    <div className="max-w-xl mx-auto px-1 sm:px-2 py-4 sm:py-6 space-y-6">
      <header>
        <h1 className="text-xl sm:text-2xl font-bold text-white">IA</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Escolha qual provedor de linguagem usar e configure credenciais.
          As alteracoes entram em vigor imediatamente.
        </p>
      </header>

      <AppearanceCard />

      {/* Provider */}
      <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Cpu className="h-4 w-4" strokeWidth={1.75} />
          Provedor ativo
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(snapshot ? pluginIds(snapshot) : []).map((p) => {
            const info = snapshot?.providers[p];
            const ready = isReady(snapshot, p);
            const active = p === provider;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onProviderChange(p)}
                className={[
                  'text-left p-3 rounded-xl border transition-colors',
                  active
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white text-sm">{labelOf(snapshot, p)}</span>
                  <span
                    className={[
                      'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                      ready
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-neutral-800 text-neutral-500',
                    ].join(' ')}
                  >
                    {ready ? 'pronto' : 'faltam dados'}
                  </span>
                </div>
                {info?.description && (
                  <p className="text-xs text-neutral-500 mt-1">{info.description}</p>
                )}
                {info?.model && (
                  <p className="text-[11px] text-neutral-600 mt-1 truncate">
                    modelo padrao: {info.model}
                  </p>
                )}
              </button>
            );
          })}
        </div>
        <LocalModelHint />
      </section>

      {/* Modelo + credenciais */}
      <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Modelo</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="nome do modelo"
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
          />
          {catalog.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {catalog.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPickModel(m)}
                  className={[
                    'text-xs min-h-[44px] fino:min-h-0 px-2 py-1 rounded-full border transition-colors',
                    model === m
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                      : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wider flex items-center justify-between gap-2">
            <span>
              API key ({labelOf(snapshot, provider)})
              {currentSnap?.requires_api_key === false && ' (opcional)'}
            </span>
            {currentSnap?.has_api_key && (
              <span className="text-[10px] text-emerald-400 normal-case tracking-normal font-normal">
                ja configurada: {currentSnap.api_key_masked}
              </span>
            )}
          </label>
          <div className="mt-1 flex items-stretch gap-1">
            <div className="relative flex-1">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" strokeWidth={1.75} />
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentSnap?.has_api_key ? '•••••••••••• (manter atual)' : 'cole sua chave aqui'}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="min-w-[44px] min-h-[44px] fino:min-h-0 px-3 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white"
              title={showKey ? 'Ocultar' : 'Mostrar'}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-neutral-600 mt-1">
            A chave fica salva criptografada no servidor e nunca volta inteira para o navegador.
            {currentSnap?.key_url && (
              <>
                {' '}
                <a
                  href={currentSnap.key_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300"
                >
                  Criar uma chave <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
        </div>

        {(currentSnap?.base_url_editable ?? provider === 'lmstudio') && (
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider">
              Endereco da API (base URL)
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://.../v1'}
              className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
            />
            <p className="text-[11px] text-neutral-600 mt-1">
              Qualquer servico compativel com a API da OpenAI (termina em /v1, em geral).
            </p>
          </div>
        )}

        {provider === 'openai' && (
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wider">
              Organization ID (opcional)
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="org-..."
              className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
            />
          </div>
        )}

        {currentSnap?.local && !isDesktop() && (
          <p className="text-[11px] text-amber-400/80">
            Este plugin roda no seu computador. Com o app publicado na internet, o servidor nao alcanca
            o seu PC: use um plugin na nuvem ou o app desktop.
          </p>
        )}
      </section>

      {/* Ações do provedor: ficam no fluxo, logo abaixo da configuração (antes eram "sticky" e flutuavam sobre os cartões) */}
      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-white text-black font-medium text-sm px-4 min-h-[44px] rounded-full hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing || saving}
          className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-200 font-medium text-sm px-4 min-h-[44px] rounded-full hover:bg-neutral-800 disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
          Testar conexao
        </button>
        {dirty && !saving && (
          <span className="text-xs text-amber-400">Alterações não salvas</span>
        )}
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="flex items-center justify-center text-neutral-400 hover:text-white text-sm h-11 w-11 rounded-full"
          title="Recarregar"
          aria-label="Recarregar"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </section>

      {/* Feedback inline */}
      {feedback && (
        <div
          className={[
            'flex items-start gap-2 p-3 rounded-xl text-sm border',
            feedback.kind === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              : feedback.kind === 'info'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
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

      <MemorySettingsCard />

      <McpAccessCard />

      <PluginsCard />

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Dica: chaves definidas em variaveis de ambiente no servidor (ex.: OPENAI_API_KEY)
        continuam valendo. O que for salvo aqui tem prioridade.
      </p>
    </div>
  );
}
