/**
 * Os aparelhos do menu "Dimensões" do Chrome DevTools (modo dispositivo, Ctrl+Shift+M).
 * Medidas em pixels CSS, em pé. Cada um também é testado deitado (botão de girar do DevTools).
 */
export type Device = { name: string; width: number; height: number; mobile: boolean };
export const DEVICES: Device[] = [
  { name: 'iPhone SE', width: 375, height: 667, mobile: true },
  { name: 'iPhone XR', width: 414, height: 896, mobile: true },
  { name: 'iPhone 12 Pro', width: 390, height: 844, mobile: true },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932, mobile: true },
  { name: 'Pixel 7', width: 412, height: 915, mobile: true },
  { name: 'Samsung Galaxy S8+', width: 360, height: 740, mobile: true },
  { name: 'Samsung Galaxy S20 Ultra', width: 412, height: 915, mobile: true },
  { name: 'iPad Mini', width: 768, height: 1024, mobile: true },
  { name: 'iPad Air', width: 820, height: 1180, mobile: true },
  { name: 'iPad Pro', width: 1024, height: 1366, mobile: true },
  { name: 'Surface Pro 7', width: 912, height: 1368, mobile: true },
  { name: 'Surface Duo', width: 540, height: 720, mobile: true },
  { name: 'Galaxy Z Fold 5', width: 344, height: 882, mobile: true },
  { name: 'Asus Zenbook Fold', width: 853, height: 1280, mobile: true },
  { name: 'Samsung Galaxy A51/71', width: 412, height: 914, mobile: true },
  { name: 'Nest Hub', width: 1024, height: 600, mobile: true },
  { name: 'Nest Hub Max', width: 1280, height: 800, mobile: true },
];

/** Em pé e deitado. Nest Hub já é deitado de fábrica, então "girado" vira em pé. */
export function orientations(): (Device & { label: string })[] {
  return DEVICES.flatMap((d) => [
    { ...d, label: `${d.name} ${d.width}×${d.height}` },
    { ...d, width: d.height, height: d.width, label: `${d.name} girado ${d.height}×${d.width}` },
  ]);
}

/** Roda no navegador: elementos visíveis que saem pelas laterais da tela (cortados). */
export function clippedElements(): string[] {
  const vw = window.innerWidth;
  const out: string[] = [];
  const scrollsX = (el: Element | null): boolean => {
    for (let p = el?.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, h1, h2, h3, p, label, [role="tab"]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
    if (el.closest('canvas, svg, [aria-hidden="true"]')) continue;
    if ((r.left < -1 || r.right > vw + 1) && !scrollsX(el)) {
      const name = (el.getAttribute('aria-label') || el.title || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
      out.push(`${name} (${Math.round(r.left)}→${Math.round(r.right)})`);
    }
  }
  return [...new Set(out)].slice(0, 8);
}

/** Roda no navegador: botões e links menores que o mínimo de toque. */
export function smallTouchTargets(min: number): string[] {
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('button, a[href], [role="tab"], select')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.width < min || r.height < min) {
      const name = (el.getAttribute('aria-label') || el.title || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
      out.push(`${name} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
  }
  return [...new Set(out)];
}
