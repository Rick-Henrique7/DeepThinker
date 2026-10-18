import React, { useEffect, useState } from 'react';
import { Puzzle, X } from 'lucide-react';
import {
  onPluginNotice,
  pluginsApi,
  PLUGINS_CHANGED_EVENT,
  stopAllPlugins,
  syncPlugins,
  type PluginNotice,
} from '../lib/plugins';

/**
 * Liga os plugins instalados pela pessoa (cada um no seu iframe isolado, ver lib/plugins.ts)
 * e mostra os avisos que eles mandam com deepthinker.notify().
 */
export function PluginHost() {
  const [notices, setNotices] = useState<PluginNotice[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      pluginsApi
        .list()
        .then((list) => alive && syncPlugins(Array.isArray(list) ? list : []))
        .catch(() => undefined); // sem plugins (ou backend fora): o app segue normal
    load();
    window.addEventListener(PLUGINS_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(PLUGINS_CHANGED_EVENT, load);
      stopAllPlugins();
    };
  }, []);

  useEffect(
    () =>
      onPluginNotice((n) => {
        setNotices((list) => [...list.slice(-2), n]);
        setTimeout(() => setNotices((list) => list.filter((x) => x.id !== n.id)), 6000);
      }),
    []
  );

  if (notices.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-24 lg:bottom-6 z-[65] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg backdrop-blur-md ${
            n.kind === 'error' ? 'border-rose-500/40 bg-rose-950/80 text-rose-100' : 'border-neutral-700 bg-neutral-900/90 text-neutral-100'
          }`}
        >
          <Puzzle className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-neutral-500">{n.plugin}</p>
            <p className="break-words">{n.message}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setNotices((list) => list.filter((x) => x.id !== n.id))}
            className="rounded-md p-1 text-neutral-500 hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
