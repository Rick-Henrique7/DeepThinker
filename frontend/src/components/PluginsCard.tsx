import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Puzzle, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  notifyPluginsChanged,
  parseManifest,
  PERMISSION_LABELS,
  pluginsApi,
  type InstalledPlugin,
  type PluginManifest,
  type PluginPermission,
} from '../lib/plugins';
import { PLUGIN_EXAMPLES } from '../lib/pluginExamples';
import { useConfirm } from './ConfirmDialog';

const label = (p: string) => PERMISSION_LABELS[p as PluginPermission] ?? p;

/**
 * Plugins da comunidade: instalar (de um arquivo .json ou dos exemplos), ligar/desligar e remover.
 * Antes de instalar, a pessoa vê e aceita as permissões que o plugin pede.
 */
export function PluginsCard() {
  const confirm = useConfirm();
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try {
      const list = await pluginsApi.list();
      setPlugins(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlugins([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changed = async () => {
    await load();
    notifyPluginsChanged();
  };

  const install = async (m: PluginManifest) => {
    setError(null);
    const perms = m.permissions ?? [];
    const ok = await confirm({
      title: `Instalar "${m.name}"?`,
      message:
        (m.author ? `De ${m.author}. ` : '') +
        (perms.length ? `Ele poderá: ${perms.map(label).join('; ')}.` : 'Ele não pede nenhuma permissão.') +
        ' Roda isolado: não vê seu login, suas outras notas nem a internet.',
      confirmText: 'Instalar',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await pluginsApi.install(m);
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fromFile = async (file: File) => {
    setError(null);
    try {
      if (file.size > 300_000) throw new Error('Arquivo grande demais para um plugin.');
      await install(parseManifest(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = async (p: InstalledPlugin) => {
    setBusy(p.key);
    try {
      await pluginsApi.setEnabled(p.id, !p.enabled);
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: InstalledPlugin) => {
    const ok = await confirm({
      title: `Remover "${p.name}"?`,
      message: 'Os comandos dele somem da paleta Ctrl+K. Suas notas não mudam.',
      confirmText: 'Remover',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(p.key);
    try {
      await pluginsApi.uninstall(p.id);
      await changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const installedKeys = new Set((plugins ?? []).map((p) => p.key));
  const examples = PLUGIN_EXAMPLES.filter((m) => !installedKeys.has(m.id));

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <Puzzle className="h-4 w-4" strokeWidth={1.75} />
          Plugins
        </div>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Plugins adicionam comandos na paleta <kbd className="text-neutral-400">Ctrl+K</kbd>. Cada um roda isolado no seu
          navegador: só faz o que você permitir e não vê seu login, suas outras notas nem a internet. Instalar vale só
          para a sua conta.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-neutral-500 uppercase tracking-wider">Instalados</label>
        {plugins === null ? (
          <p className="text-xs text-neutral-500">Carregando...</p>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-neutral-500">Nenhum plugin ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {plugins.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200">
                    {p.name} <span className="text-[11px] text-neutral-500">v{p.version}</span>
                  </p>
                  {p.description && <p className="text-xs text-neutral-500">{p.description}</p>}
                  <p className="mt-1 flex flex-wrap gap-1">
                    {p.permissions.map((perm) => (
                      <span key={perm} title={label(perm)} className="rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                        {perm}
                      </span>
                    ))}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.enabled}
                  aria-label={`${p.enabled ? 'Desligar' : 'Ligar'} ${p.name}`}
                  disabled={busy === p.key}
                  onClick={() => toggle(p)}
                  className={`mt-0.5 flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium min-h-[44px] sm:min-h-[32px] ${
                    p.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-500'
                  }`}
                >
                  {p.enabled ? 'Ligado' : 'Desligado'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={busy === p.key}
                  aria-label={`Remover ${p.name}`}
                  title="Remover"
                  className="flex flex-shrink-0 items-center justify-center h-11 w-11 sm:h-8 sm:w-8 rounded-full text-neutral-500 hover:text-rose-300 hover:bg-neutral-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {examples.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs text-neutral-500 uppercase tracking-wider">Exemplos</label>
          <ul className="grid gap-2 sm:grid-cols-2">
            {examples.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-neutral-200">{m.name}</p>
                  <p className="text-xs text-neutral-500">{m.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => install(m)}
                  disabled={busy === m.id}
                  className="flex items-center justify-center gap-1.5 self-start rounded-full border border-neutral-700 px-3 min-h-[44px] sm:min-h-[36px] text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Instalar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) fromFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 bg-white text-black font-medium text-sm px-4 min-h-[44px] rounded-full hover:bg-neutral-200"
        >
          <Upload className="h-4 w-4" />
          Instalar de um arquivo
        </button>
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          <ShieldCheck className="h-3.5 w-3.5" /> Você vê as permissões antes de instalar.
        </span>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
