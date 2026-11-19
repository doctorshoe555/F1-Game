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
      const ok = a.kind === 'text' ? matchesText(d, a.text) : a.kind === 'choice' && a.index === d.correctIndex;
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

// ---------- Freitext (Jeopardy) ----------
/** Vereinheitlicht Text für den Vergleich: klein, ohne Akzente/Satzzeichen/Klammerzusätze, ohne Frageform. */
export function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^(wer|was|wo|wann|wie)( oder was)? (ist|sind|war|waren) /, '')
    .replace(/^(der|die|das|den|dem|ein|eine|einen|the) /, '').trim();
}
/** Ist die Antwort als Frage formuliert („Wer ist …?“)? Nur für den Gag-Schalter. */
export const isPhrasedAsQuestion = (text: string): boolean => /^\s*(wer|was|wo|wann|wie)\b/i.test(text) && /\?\s*$/.test(text);

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Lösungstexte, die als Freitext durchgehen: richtige Option plus `accept`. */
function acceptedTexts(d: Dealt): string[] {
  const q = d.q;
  const right = q.type === 'mc' || q.type === 'image' ? q.options?.[q.answer as number] ?? d.shown[d.correctIndex] : undefined;
  return [right, ...(q.accept ?? [])].filter((t): t is string => !!t);
}

/** Lohnt sich Freitext? Nur bei kurzen Lösungen (Namen, Orte) – lange Sätze errät niemand wortgleich. */
export function textAnswerable(d: Dealt): boolean {
  if (d.q.type !== 'mc' && d.q.type !== 'image') return false;
  const main = acceptedTexts(d)[0];
  return !!main && normalizeText(main).split(' ').length <= 3 && normalizeText(main).length >= 2;
}

/** Freitext großzügig prüfen: Tippfehler, fehlender Vorname und Frageform werden verziehen. */
export function matchesText(d: Dealt, text: string): boolean {
  const given = normalizeText(text);
  if (!given) return false;
  return acceptedTexts(d).some((t) => {
    const want = normalizeText(t);
    const tolerance = want.length <= 4 ? 0 : want.length <= 8 ? 1 : 2;
    if (levenshtein(given, want) <= tolerance) return true;
    // Nachname allein genügt („Hamilton“ für „Lewis Hamilton“), sofern er nicht zu kurz ist
    const last = want.split(' ').at(-1)!;
    return want.includes(' ') && last.length >= 4 && levenshtein(given, last) <= (last.length <= 5 ? 0 : 1);
  });
}
