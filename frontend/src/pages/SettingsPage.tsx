import React, { useEffect, useState } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, TestTube2, Eye, EyeOff, RefreshCw, Cpu, Key } from 'lucide-react';
import {
  getSettings,
  saveSettings,
  testProvider,
  type LlmProvider,
  type ProviderSnapshot,
  type SettingsSnapshot,
} from '../lib/settings';

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  lmstudio: 'LM Studio (local)',
  openai: 'OpenAI Cloud',
};

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null;

/**
 * Settings / IA — edicao de provider, modelo, API key e URL.
 *
 * Persistencia no backend via PUT /api/settings/llm; o backend resolve
 * a chave lendo DB -> .env (fallback). Mudancas tem efeito imediato,
 * sem precisar restart do PHP.
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

  // Trocar provider → recarrega valores daquela aba
  const onProviderChange = (next: LlmProvider) => {
    if (!snapshot) return;
    setProvider(next);
    const p = snapshot.providers[next];
    setModel(p.model ?? '');
    setApiKey('');
    setOrganization(p.organization ? p.organization.replace(/^\*+/, '') : '');
    setBaseUrl(p.base_url ?? '');
  };

  const onSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, string> = { provider };
      if (model.trim()) payload.model = model.trim();
      if (provider === 'openai') {
        if (apiKey.trim()) payload.api_key = apiKey.trim();
        if (organization.trim()) payload.organization = organization.trim();
      } else {
        if (baseUrl.trim()) payload.base_url = baseUrl.trim();
        if (apiKey.trim()) payload.api_key = apiKey.trim();
      }
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
          message: `Conexao OK com ${PROVIDER_LABEL[r.provider]}. Resposta: "${(r.reply ?? '').slice(0, 80)}"`,
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

      {/* Provider */}
      <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Cpu className="h-4 w-4" strokeWidth={1.75} />
          Provedor ativo
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(['lmstudio', 'openai'] as LlmProvider[]).map((p) => {
            const info = snapshot?.providers[p];
            const available = info?.has_api_key ?? (p === 'lmstudio');
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
                  <span className="font-medium text-white text-sm">{PROVIDER_LABEL[p]}</span>
                  <span
                    className={[
                      'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                      available
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-neutral-800 text-neutral-500',
                    ].join(' ')}
                  >
                    {available ? 'pronto' : 'faltam dados'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {p === 'lmstudio'
                    ? 'Servidor local em http://localhost:1234/v1'
                    : 'api.openai.com (cobrado por token)'}
                </p>
                {info?.model && (
                  <p className="text-[11px] text-neutral-600 mt-1 truncate">
                    modelo padrao: {info.model}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Modelo + credenciais */}
      <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Modelo</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex: gpt-4o-mini"
            className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
          />
          {catalog.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {catalog.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={[
                    'text-xs px-2 py-1 rounded-full border transition-colors',
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

        {provider === 'openai' ? (
          <>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider flex items-center justify-between">
                <span>API key (OpenAI)</span>
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
                    placeholder={currentSnap?.has_api_key ? '•••••••••••• (manter atual)' : 'sk-proj-...'}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="px-3 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white"
                  title={showKey ? 'Ocultar' : 'Mostrar'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-600 mt-1">
                Para revogar, basta gerar uma nova no painel da OpenAI e colar aqui.
                A chave fica salva apenas no backend.
              </p>
            </div>

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
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">
                Base URL (LM Studio)
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:1234/v1"
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider">
                API key (LM Studio ignora, mas pode salvar uma)
              </label>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="lm-studio"
                className="mt-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/60"
                autoComplete="off"
              />
            </div>
          </>
        )}
      </section>

      {/* Actions */}
      <section className="flex flex-wrap gap-2 sticky bottom-20 lg:bottom-2 z-10">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-white text-black font-medium text-sm px-4 py-2.5 rounded-full hover:bg-neutral-200 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing || saving}
          className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 text-neutral-200 font-medium text-sm px-4 py-2.5 rounded-full hover:bg-neutral-800 disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
          Testar conexao
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="flex items-center gap-2 text-neutral-400 hover:text-white text-sm px-3 py-2.5 rounded-full"
          title="Recarregar"
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

      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Dica: credenciais do `.env` continuam valendo — valores salvos aqui
        sobrescrevem por provider ate serem removidos. Remover e reiniciar o
        backend restaura o `.env`.
      </p>
    </div>
  );
}
