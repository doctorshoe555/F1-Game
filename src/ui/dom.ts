// Winziger DOM-Baukasten: h('button.btn.primary', { onclick }, 'Text')
type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(spec: K | `${K}.${string}`, ...rest: [Attrs?, ...Child[]] | Child[]): HTMLElementTagNameMap[K];
export function h(spec: string, ...rest: unknown[]): HTMLElement {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  let kids = rest as Child[];
  const first = rest[0];
  if (first && typeof first === 'object' && !(first instanceof Node) && !Array.isArray(first)) {
    kids = rest.slice(1) as Child[];
    for (const [k, v] of Object.entries(first as Attrs)) {
      if (v === false || v == null) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = `${el.className} ${String(v)}`.trim();
      else if (k in el && !k.startsWith('aria') && k !== 'list') (el as unknown as Attrs)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  const add = (c: Child): void => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : String(c));
  };
  kids.forEach(add);
  return el;
}

export const fmt = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Eine Ansicht liefert ihr Element und optional eine Aufräumfunktion (Timer, Tastatur). */
export interface View { el: HTMLElement; dispose?: () => void }
