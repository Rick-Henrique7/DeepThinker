import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

/**
 * Aviso curto no topo depois do login ("Conta criada", "Bem-vindo de volta").
 * Some sozinho em 4 s; role="status" faz o leitor de tela anunciar o texto.
 */
export const WelcomeToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const hide = window.setTimeout(() => setLeaving(true), 4000);
    return () => window.clearTimeout(hide);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const done = window.setTimeout(onClose, 200);
    return () => window.clearTimeout(done);
  }, [leaving, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div
        role="status"
        className={[
          'pointer-events-auto flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-neutral-900/95 backdrop-blur-sm',
          'pl-3 pr-1 py-1 text-sm text-neutral-100 shadow-lg shadow-black/30',
          leaving ? 'animate-[toast-out_200ms_ease-in_forwards]' : 'animate-[toast-in_240ms_cubic-bezier(0.22,1,0.36,1)]',
        ].join(' ')}
      >
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
        <span>{message}</span>
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={() => setLeaving(true)}
          className="grid h-9 w-9 place-items-center rounded-xl text-neutral-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
