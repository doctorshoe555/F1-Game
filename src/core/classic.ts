// Klassische Fragerunde (Solo; ab Etappe c auch Pass-and-Play): reiner, serialisierbarer Zustand.
import { deal } from './questions';
import { judge, points, type Verdict } from './scoring';
import type { Answer, Dealt, EraId, LevelId, Question } from './types';

export interface ClassicSettings {
  length: number;
  level: LevelId;
  categories: string[] | null;
  era: EraId;
  /** Sekunden pro Frage; 0 = ohne Timer (dann auch kein Zeitbonus) */
  seconds: number;
}

export interface ClassicPlayer { name: string; score: number; correct: number; answered: number; bestStreak: number; streak: number }

export interface Outcome { player: number; answer: Answer; verdict: Verdict; gained: number; timeMs: number; timedOut: boolean }

export interface ClassicState {
  v: 1;
  settings: ClassicSettings;
  players: ClassicPlayer[];
  deck: Dealt[];
  /** Index der aktuellen Frage in deck */
  index: number;
  /** question = wartet auf Antwort · reveal = Auflösung · done = fertig */
  phase: 'question' | 'reveal' | 'done';
  /** Zeitstempel (ms), seit dem die aktuelle Frage läuft */
  startedAt: number;
  last: Outcome | null;
}

export function createClassic(settings: ClassicSettings, questions: Question[], names: string[], now: number, rnd: () => number = Math.random): ClassicState {
  return {
    v: 1, settings,
    players: names.map((name) => ({ name, score: 0, correct: 0, answered: 0, bestStreak: 0, streak: 0 })),
    deck: questions.map((q) => deal(q, rnd)),
    index: 0, phase: questions.length ? 'question' : 'done', startedAt: now, last: null,
  };
}

export const currentPlayer = (s: ClassicState): number => s.index % s.players.length;
export const currentDealt = (s: ClassicState): Dealt | undefined => s.deck[s.index];
export const deadline = (s: ClassicState): number | null => (s.settings.seconds > 0 ? s.startedAt + s.settings.seconds * 1000 : null);

/** Wertet die Antwort (null = Zeit abgelaufen) und wechselt in die Auflösung. */
export function answerClassic(s: ClassicState, answer: Answer, now: number): ClassicState {
  if (s.phase !== 'question') return s;
  const d = s.deck[s.index];
  const total = s.settings.seconds * 1000;
  const timeMs = Math.max(0, now - s.startedAt);
  // 300 ms Kulanz, damit ein Tipp „auf der Linie“ noch zählt
  const timedOut = answer === null || (total > 0 && timeMs > total + 300);
  const verdict = judge(d, timedOut ? null : answer);
  const gained = points(verdict, total > 0 ? 1 - timeMs / total : 0);
  const pi = currentPlayer(s);
  const players = s.players.map((p, i) => {
    if (i !== pi) return p;
    const streak = verdict.correct ? p.streak + 1 : 0;
    return { ...p, score: p.score + gained, correct: p.correct + (verdict.correct ? 1 : 0), answered: p.answered + 1, streak, bestStreak: Math.max(p.bestStreak, streak) };
  });
  return { ...s, players, phase: 'reveal', last: { player: pi, answer: timedOut ? null : answer, verdict, gained, timeMs, timedOut } };
}

/** Weiter zur nächsten Frage bzw. zum Endstand. */
export function nextClassic(s: ClassicState, now: number): ClassicState {
  if (s.phase !== 'reveal') return s;
  const index = s.index + 1;
  return index >= s.deck.length ? { ...s, index, phase: 'done', last: null } : { ...s, index, phase: 'question', startedAt: now, last: null };
}
