// Eigene Icons als Inline-SVG (keine fremden Logos oder Marken).
import type { LevelId } from '../core/types';

function svg(markup: string, cls = 'ico'): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" aria-hidden="true" focusable="false" ${markup}</svg>`;
  return t.content.firstElementChild as SVGElement;
}

/** Reifen mit farbigem Ring und Buchstabe – Farbe ist nie der einzige Hinweis. */
export function tyre(letter: string, color: string): SVGElement {
  return svg(`viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#111"/><circle cx="20" cy="20" r="14.5" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="15 7.8"/><circle cx="20" cy="20" r="8.5" fill="#2a2a33"/><text x="20" y="24.5" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="13" fill="${color}">${letter}</text>`, 'ico tyre');
}
const LEVEL_TYRE: Record<LevelId, [string, string]> = {
  sonntagsfahrer: ['S', '#ff3b3b'], stammgast: ['M', '#ffd800'], profi: ['H', '#f4f4f6'], bwoah: ['I', '#43d262'],
};
export const levelTyre = (id: LevelId): SVGElement => tyre(...LEVEL_TYRE[id]);

export const flagIcon = (): SVGElement => svg('viewBox="0 0 24 24"><path d="M5 2v20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 3h14v10H6z" fill="#fff"/><path d="M6 3h3.5v3.3H6zM13 3h3.5v3.3H13zM9.5 6.3H13v3.4H9.5zM16.5 6.3H20v3.4h-3.5zM6 9.7h3.5V13H6zM13 9.7h3.5V13H13z" fill="#111"/>');
export const stopwatch = (): SVGElement => svg('viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="14" r="7.5"/><path d="M12 14V9.5M9.5 2.5h5M12 2.5v4M18.5 7.5l1.5-1.5"/>');
export const speaker = (on: boolean): SVGElement => svg(`viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>${on ? '<path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>' : '<path d="M16 9.5l5 5M21 9.5l-5 5"/>'}`);
export const helmet = (): SVGElement => svg('viewBox="0 0 24 24"><path d="M3 14a9 9 0 0 1 18-1.5V17a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4z" fill="currentColor"/><path d="M12 11h9v3.5h-7.5a1.5 1.5 0 0 1-1.5-1.5z" fill="#0a0a0d"/>');
export const phones = (): SVGElement => svg('viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="9" height="16" rx="2"/><rect x="14" y="7" width="7" height="13" rx="1.5"/>');
export const group = (): SVGElement => svg('viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M1.5 20a6.5 6.5 0 0 1 13 0zM15.5 20a8 8 0 0 0-1.6-4.8A5.3 5.3 0 0 1 22.5 20z"/>');
export const grid = (): SVGElement => svg('viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="3" width="6" height="4"/><rect x="9" y="3" width="6" height="4"/><rect x="16" y="3" width="6" height="4"/><rect x="2" y="9" width="6" height="5" opacity=".7"/><rect x="9" y="9" width="6" height="5" opacity=".7"/><rect x="16" y="9" width="6" height="5" opacity=".7"/><rect x="2" y="16" width="6" height="5" opacity=".45"/><rect x="9" y="16" width="6" height="5" opacity=".45"/><rect x="16" y="16" width="6" height="5" opacity=".45"/>');
