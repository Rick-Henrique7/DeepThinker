import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES, getTheme, setTheme, type ThemeId } from '../lib/theme';

/**
 * Configurações > Aparência: escolha entre Abismo (padrão), Glaciar e Grafite.
 * A troca é na hora, sem salvar nada no servidor (fica guardada neste aparelho).
 */
export function AppearanceCard() {
  const [current, setCurrent] = useState<ThemeId>(getTheme());

  const choose = (id: ThemeId) => {
    setTheme(id);
    setCurrent(id);
  };

  return (
    <section className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
        <Palette className="h-4 w-4" strokeWidth={1.75} />
        Aparência
      </div>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {THEMES.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(t.id)}
              className={[
                'text-left p-3 rounded-xl border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]',
                active ? 'border-accent/60 bg-accent/10' : 'border-neutral-800 bg-neutral-950 hover:bg-neutral-900',
              ].join(' ')}
            >
              {/* Amostra das cores do tema: fixa, para dar para comparar antes de escolher */}
              <div className="flex h-7 overflow-hidden rounded-lg border border-neutral-800">
                {t.swatches.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-medium text-white text-sm">{t.label}</span>
                {active && <Check className="h-4 w-4 text-accent" strokeWidth={2} />}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{t.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
