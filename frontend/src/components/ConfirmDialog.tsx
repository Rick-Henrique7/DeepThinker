import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmModal } from './Modal';

/**
 * Substituto do window.confirm() no estilo do app.
 *
 * Uso em qualquer componente:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Excluir nota?', message: '...', variant: 'danger' }))) return;
 *
 * Como funciona: o ConfirmProvider guarda um unico modal no topo do app.
 * confirm() abre o modal e devolve uma Promise; clicar em Confirmar resolve
 * com true, e Cancelar / Esc / clicar fora resolve com false. Assim o codigo
 * continua lendo como o confirm() antigo, so que com await.
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    // Se havia outro aberto, ele conta como cancelado.
    resolveRef.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={options !== null}
        title={options?.title ?? ''}
        message={options?.message ?? ''}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        variant={options?.variant}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.');
  return confirm;
}
