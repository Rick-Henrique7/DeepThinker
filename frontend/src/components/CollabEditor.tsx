import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { applyDiff, transformIndex, type CollabSession, type Peer } from '../lib/collab';

/**
 * Editor de texto ligado a um Y.Text: o que a pessoa digita vira atualização do Yjs,
 * e o que os outros digitam aparece aqui sem pular o cursor. Os cursores dos outros
 * aparecem como uma barrinha colorida com o nome.
 */
export function CollabEditor({ session, peers, onLocalChange }: {
  session: CollabSession;
  peers: Peer[];
  onLocalChange: () => void;
}) {
  const [value, setValue] = useState(() => session.text.toString());
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  /** Seleção a restaurar depois que o React trocar o texto (edição de outra pessoa). */
  const pendingSel = useRef<[number, number] | null>(null);
  const [scroll, setScroll] = useState(0);

  // Edição de outra pessoa: troca o texto e anda o cursor junto com a mudança
  useEffect(() => {
    const onChange = (event: Y.YTextEvent, tr: Y.Transaction) => {
      const next = session.text.toString();
      if (tr.origin !== 'local') {
        const area = areaRef.current;
        if (area && document.activeElement === area) {
          const delta = event.delta as { retain?: number; insert?: unknown; delete?: number }[];
          pendingSel.current = [transformIndex(area.selectionStart, delta), transformIndex(area.selectionEnd, delta)];
        }
        setValue(next);
      }
      session.refreshPeers();
    };
    session.text.observe(onChange);
    setValue(session.text.toString());
    return () => session.text.unobserve(onChange);
  }, [session]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area && pendingSel.current) {
      area.setSelectionRange(pendingSel.current[0], pendingSel.current[1]);
      pendingSel.current = null;
    }
  }, [value]);

  const reportCursor = () => {
    const area = areaRef.current;
    if (area) session.setCursor(area.selectionStart, area.selectionEnd);
  };

  return (
    <div className="relative">
      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          applyDiff(session.text, valueRef.current, next);
          setValue(next);
          onLocalChange();
          reportCursor();
        }}
        onSelect={reportCursor}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
        spellCheck
        aria-label="Texto da nota (edição em conjunto)"
        data-collab-editor
        className="block w-full min-h-[55vh] resize-y rounded-xl border border-neutral-800 bg-neutral-950 p-3 font-mono text-sm leading-relaxed text-neutral-200 focus:border-accent focus:outline-none"
      />
      <RemoteCursors area={areaRef.current} value={value} peers={peers} scroll={scroll} />
    </div>
  );
}

/** Onde fica (em pixels) um ponto do texto dentro do textarea: mede com uma cópia invisível. */
function caretAt(area: HTMLTextAreaElement, index: number): { top: number; left: number; height: number } {
  const cs = getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const p of [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth',
    'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight',
    'lineHeight', 'letterSpacing', 'tabSize', 'textTransform', 'wordSpacing',
  ] as const) {
    mirror.style[p] = cs[p];
  }
  Object.assign(mirror.style, {
    position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word', borderStyle: 'solid', overflow: 'hidden',
  });
  mirror.style.width = `${area.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)}px`;
  mirror.textContent = area.value.slice(0, index);
  const mark = document.createElement('span');
  mark.textContent = area.value.slice(index, index + 1) || '.';
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const out = { top: mark.offsetTop, left: mark.offsetLeft, height: parseFloat(cs.lineHeight) || 20 };
  mirror.remove();
  return out;
}

function RemoteCursors({ area, value, peers, scroll }: {
  area: HTMLTextAreaElement | null;
  value: string;
  peers: Peer[];
  scroll: number;
}) {
  if (!area) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {peers
        .filter((p) => p.head !== null && p.head <= value.length)
        .map((p) => {
          const c = caretAt(area, p.head!);
          const top = c.top - scroll;
          if (top < -c.height || top > area.clientHeight) return null;
          return (
            <div key={p.clientId} className="absolute" style={{ top, left: c.left }} data-remote-cursor={p.name}>
              <div className="w-0.5 rounded-full" style={{ height: c.height, background: p.color }} />
              <span
                className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[10px] font-medium leading-4 text-white"
                style={{ background: p.color }}
              >
                {p.name}
              </span>
            </div>
          );
        })}
    </div>
  );
}
