import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Efeito de digitacao para respostas que chegam por streaming.
 *
 * O texto recebido vai para uma "fila" (target) e a tela mostra um pouco por
 * quadro (requestAnimationFrame, ~60x por segundo). A velocidade se adapta:
 * - fila pequena: ~baseCps caracteres por segundo (ritmo de leitura);
 * - fila grande (IA muito rapida, como o Groq): acelera para nao ficar
 *   segundos atras da resposta real. Termina em no maximo ~catchUpSeconds
 *   mais o trecho final no ritmo base.
 *
 * Quem prefere menos animacao (prefers-reduced-motion) ve o texto direto.
 */
export function useTypewriter(baseCps = 80, catchUpSeconds = 2.5) {
  const [text, setText] = useState('');
  const targetRef = useRef('');
  const shownRef = useRef(0);
  const carryRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const waitersRef = useRef<Array<() => void>>([]);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const settle = () => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    waiters.forEach((resolve) => resolve());
  };

  const tick = useCallback(
    (now: number) => {
      const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const backlog = targetRef.current.length - shownRef.current;
      const cps = Math.max(baseCps, backlog / catchUpSeconds);
      carryRef.current += cps * dt;
      const step = Math.floor(carryRef.current);
      if (step > 0) {
        carryRef.current -= step;
        shownRef.current = Math.min(targetRef.current.length, shownRef.current + step);
        setText(targetRef.current.slice(0, shownRef.current));
      }

      if (shownRef.current < targetRef.current.length) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        settle();
      }
    },
    [baseCps, catchUpSeconds],
  );

  /** Acrescenta um pedaco recebido do servidor. */
  const push = useCallback(
    (chunk: string) => {
      targetRef.current += chunk;
      if (reducedMotion) {
        shownRef.current = targetRef.current.length;
        setText(targetRef.current);
        return;
      }
      if (frameRef.current === null) {
        lastTimeRef.current = performance.now();
        frameRef.current = requestAnimationFrame(tick);
      }
    },
    [reducedMotion, tick],
  );

  /** Mostra tudo que ja chegou, sem animacao (ex.: botao Parar). */
  const finish = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    shownRef.current = targetRef.current.length;
    setText(targetRef.current);
    settle();
  }, []);

  /** Resolve quando a animacao alcancar todo o texto recebido. */
  const waitUntilDone = useCallback((): Promise<void> => {
    if (shownRef.current >= targetRef.current.length) return Promise.resolve();
    return new Promise((resolve) => waitersRef.current.push(resolve));
  }, []);

  /** Limpa para a proxima resposta. */
  const reset = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    targetRef.current = '';
    shownRef.current = 0;
    carryRef.current = 0;
    setText('');
    settle();
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  return { text, push, finish, waitUntilDone, reset };
}
