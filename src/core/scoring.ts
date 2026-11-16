// Bewertung von Antworten und Punkteberechnung. Reine Funktionen.
import type { Answer, Dealt } from './types';

export const BASE_POINTS = 500;
export const MAX_TIME_BONUS = 500;

export interface Verdict {
  /** 0 = falsch, 1 = voll richtig; dazwischen: Schätz- und Sortierfragen */
  accuracy: number;
  correct: boolean;
  /** Schätzfrage: absolute Abweichung */
  off?: number;
}

export function judge(d: Dealt, a: Answer): Verdict {
  const q = d.q;
  if (a === null) return { accuracy: 0, correct: false };
  switch (q.type) {
    case 'mc':
    case 'image': {
      const ok = a.kind === 'choice' && a.index === d.correctIndex;
      return { accuracy: ok ? 1 : 0, correct: ok };
    }
    case 'tf': {
      const ok = a.kind === 'bool' && a.value === q.answer;
      return { accuracy: ok ? 1 : 0, correct: ok };
    }
    case 'estimate': {
      if (a.kind !== 'number' || !Number.isFinite(a.value)) return { accuracy: 0, correct: false };
      const off = Math.abs(a.value - (q.answer as number));
      const accuracy = Math.max(0, 1 - off / q.tolerance!);
      return { accuracy, correct: accuracy >= 0.5, off };
    }
    case 'order': {
      if (a.kind !== 'order') return { accuracy: 0, correct: false };
      const items = q.items!;
      const hits = items.filter((it, i) => a.items[i] === it).length;
      const all = hits === items.length;
      // Teilpunkte nur moderat: halbe Wertung pro richtiger Position
      return { accuracy: all ? 1 : (hits / items.length) * 0.5, correct: all };
    }
  }
}

/**
 * Punkte = Grundpunkte × Genauigkeit + Zeitbonus.
 * timeLeft: Anteil der Restzeit (0…1); ohne Timer 0 → kein Bonus.
 * Den Zeitbonus gibt es nur für (mindestens halb) richtige Antworten, gewichtet mit der Genauigkeit.
 */
export function points(v: Verdict, timeLeft: number): number {
  if (v.accuracy <= 0) return 0;
  const t = Math.max(0, Math.min(1, timeLeft));
  const bonus = v.correct ? MAX_TIME_BONUS * t * v.accuracy : 0;
  return Math.round(BASE_POINTS * v.accuracy + bonus);
}

/** Zahl einer Schätzfrage für die Anzeige; Jahreszahlen ohne Tausenderpunkt. */
export function fmtEstimate(q: { answer?: number | boolean; unit?: string }, n: number): string {
  const isYear = !q.unit && Number.isInteger(q.answer) && (q.answer as number) >= 1000 && (q.answer as number) <= 2100;
  return isYear && Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** Text der richtigen Lösung für die Auflösung. */
export function solutionText(d: Dealt): string {
  const q = d.q;
  switch (q.type) {
    case 'mc':
    case 'image': return d.shown[d.correctIndex];
    case 'tf': return q.answer ? 'Wahr' : 'Falsch';
    case 'estimate': return `${fmtEstimate(q, q.answer as number)}${q.unit ? ' ' + q.unit : ''}`;
    case 'order': return q.items!.join(' → ');
  }
}
