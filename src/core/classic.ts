// Klassische Fragerunde (Solo und Pass-and-Play): reiner, serialisierbarer Zustand.
import { deal } from './questions';
import { judge, points, type Verdict } from './scoring';
import type { Answer, Dealt, EraId, LevelId, Question } from './types';

export interface ClassicSettings {
  /** Gesamtzahl der Fragen (bei mehreren Spielern: Fragen pro Kopf × Spieler) */
  length: number;
  level: LevelId;
  categories: string[] | null;
  era: EraId;
  /** Sekunden pro Frage; 0 = ohne Timer (dann auch kein Zeitbonus) */
  seconds: number;
}

export interface ClassicPlayer { name: string; color: string; score: number; correct: number; answered: number; bestStreak: number; streak: number }

export interface Outcome {
  player: number; answer: Answer; verdict: Verdict; gained: number; timeMs: number; timedOut: boolean;
  /** schnellste richtige Antwort der bisherigen Runde („Fastest Lap“) */
  fastestLap: boolean;
}
export interface FastestLap { player: number; timeMs: number; index: number }

export interface ClassicState {
  v: 1;
  settings: ClassicSettings;
  players: ClassicPlayer[];
  deck: Dealt[];
  /** Index der aktuellen Frage in deck */
  index: number;
  /** handover = Gerät weitergeben · question = wartet auf Antwort · reveal = Auflösung · done = fertig */
  phase: 'handover' | 'question' | 'reveal' | 'done';
  /** Zeitstempel (ms), seit dem die aktuelle Frage läuft */
  startedAt: number;
  last: Outcome | null;
  fastest: FastestLap | null;
}

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 8;

export function createClassic(settings: ClassicSettings, questions: Question[], players: { name: string; color: string }[], now: number, rnd: () => number = Math.random): ClassicState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error(`Es sind ${MIN_PLAYERS} bis ${MAX_PLAYERS} Spieler möglich.`);
  return {
    v: 1, settings,
    players: players.map((p) => ({ name: p.name, color: p.color, score: 0, correct: 0, answered: 0, bestStreak: 0, streak: 0 })),
    deck: questions.map((q) => deal(q, rnd)),
    index: 0, phase: !questions.length ? 'done' : players.length > 1 ? 'handover' : 'question', startedAt: now, last: null, fastest: null,
  };
}

export const currentPlayer = (s: ClassicState): number => s.index % s.players.length;
export const currentDealt = (s: ClassicState): Dealt | undefined => s.deck[s.index];
export const deadline = (s: ClassicState): number | null => (s.settings.seconds > 0 ? s.startedAt + s.settings.seconds * 1000 : null);

/** Der nächste Spieler hat das Gerät und ist bereit – jetzt läuft die Uhr. */
export function readyClassic(s: ClassicState, now: number): ClassicState {
  return s.phase === 'handover' ? { ...s, phase: 'question', startedAt: now } : s;
}

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
  const fastestLap = verdict.correct && (!s.fastest || timeMs < s.fastest.timeMs);
  return {
    ...s, players, phase: 'reveal',
    fastest: fastestLap ? { player: pi, timeMs, index: s.index } : s.fastest,
    last: { player: pi, answer: timedOut ? null : answer, verdict, gained, timeMs, timedOut, fastestLap },
  };
}

/** Weiter zur nächsten Frage (bei mehreren Spielern erst Gerät weitergeben) bzw. zum Endstand. */
export function nextClassic(s: ClassicState, now: number): ClassicState {
  if (s.phase !== 'reveal') return s;
  const index = s.index + 1;
  if (index >= s.deck.length) return { ...s, index, phase: 'done', last: null };
  return { ...s, index, phase: s.players.length > 1 ? 'handover' : 'question', startedAt: now, last: null };
}

/**
 * Geladenen Spielstand fortsetzen: Eine laufende Frage bekommt wieder die volle Zeit;
 * bei mehreren Spielern wird zuerst das Gerät übergeben.
 */
export function resumeClassic(s: ClassicState, now: number): ClassicState {
  if (s.phase !== 'question') return s;
  return { ...s, phase: s.players.length > 1 ? 'handover' : 'question', startedAt: now };
}

export interface Ranked { player: ClassicPlayer; index: number; place: number }
/** Rangliste; Punktgleiche teilen sich den Platz. */
export function ranking(s: ClassicState): Ranked[] {
  const sorted = s.players.map((player, index) => ({ player, index })).sort((a, b) => b.player.score - a.player.score || a.index - b.index);
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.player.score !== sorted[i - 1].player.score) place = i + 1;
    return { ...r, place };
  });
}

/** Kurzbeschreibung für die Liste der Spielstände. */
export function describeClassic(s: ClassicState): string {
  const who = s.players.length === 1 ? `Solo (${s.players[0].name})` : `${s.players.length} Spieler: ${s.players.map((p) => p.name).join(', ')}`;
  const where = s.phase === 'done' ? 'beendet' : `Frage ${Math.min(s.index + 1, s.deck.length)}/${s.deck.length}`;
  return `${who} · ${where}`;
}

/** Prüft, ob ein (importiertes) Objekt ein benutzbarer Spielstand ist. */
export function isClassicState(x: unknown): x is ClassicState {
  const s = x as ClassicState;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (!isObj(s) || s.v !== 1 || !isObj(s.settings) || !Array.isArray(s.players) || !Array.isArray(s.deck)) return false;
  if (!['handover', 'question', 'reveal', 'done'].includes(s.phase)) return false;
  if (s.players.length < MIN_PLAYERS || s.players.length > MAX_PLAYERS) return false;
  if (!s.players.every((p) => isObj(p) && typeof p.name === 'string' && Number.isFinite(p.score) && Number.isFinite(p.correct) && Number.isFinite(p.streak))) return false;
  if (!Number.isInteger(s.index) || s.index < 0 || s.index > s.deck.length) return false;
  if (s.phase !== 'done' && s.index >= s.deck.length) return false;
  if (s.phase === 'reveal' && !isObj(s.last)) return false;
  if (!Number.isFinite(s.startedAt) || !Number.isFinite(s.settings.seconds)) return false;
  const types = ['mc', 'tf', 'estimate', 'image', 'order'];
  return s.deck.every((d) => isObj(d) && isObj(d.q) && typeof d.q.question === 'string' && typeof d.q.explanation === 'string'
    && types.includes(d.q.type) && Array.isArray(d.shown) && Number.isInteger(d.correctIndex) && Array.isArray(d.q.tags));
}
