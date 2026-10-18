/**
 * Diferença linha a linha entre dois textos (usada no histórico de versões).
 *
 * O jeito clássico é a "maior subsequência comum" (LCS): achar as linhas que aparecem nos dois
 * textos, na mesma ordem; o que sobra de um lado foi removido e do outro, adicionado.
 * A tabela do LCS custa linhas_a × linhas_b, então antes cortamos o começo e o fim iguais
 * (quase toda edição mexe só num pedaço do meio) e só o meio entra na conta.
 */
export type DiffLine = { kind: 'same' | 'removed' | 'added'; text: string };

/** Acima disso (≈ 2.000 × 2.000 linhas diferentes) a comparação desiste: ficaria lenta demais. */
const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) return null;

  // lcs[i][j] = tamanho da maior subsequência comum entre midA[i..] e midB[j..]
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] = midA[i] === midB[j] ? lcs[at(i + 1, j + 1)] + 1 : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }
  const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ kind: 'same', text: midA[i] });
      i++;
      j++;
    } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) {
      out.push({ kind: 'removed', text: midA[i++] });
    } else {
      out.push({ kind: 'added', text: midB[j++] });
    }
  }
  while (i < n) out.push({ kind: 'removed', text: midA[i++] });
  while (j < m) out.push({ kind: 'added', text: midB[j++] });
  a.slice(endA).forEach((text) => out.push({ kind: 'same', text }));
  return out;
}

export type DiffChunk = DiffLine | { kind: 'skip'; count: number };

/** Esconde trechos iguais longos, deixando `context` linhas de cada lado de cada mudança. */
export function collapse(lines: DiffLine[], context = 2): DiffChunk[] {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.kind === 'same') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });
  const out: DiffChunk[] = [];
  let skipped = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) out.push({ kind: 'skip', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ kind: 'skip', count: skipped });
  return out;
}
