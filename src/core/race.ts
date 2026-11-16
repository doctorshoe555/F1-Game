// „Quiz-Rennen“: Alle Spieler beantworten dieselbe Frage gleichzeitig auf ihren Handys.
// Der Host hält diesen Zustand als alleinige Wahrheit; die Handys bekommen nur Ansichten (playerView).
import type { ClassicSettings } from './classic';
import { deal } from './questions';
import { rankPlayers, type NetPlayer } from './roster';
import { judge, points, solutionText, type Verdict } from './scoring';
import type { Answer, Dealt, Question } from './types';

export const CLOSEST_BONUS = 250;
/** Antworten, die bis zu so viele ms nach Ablauf eintreffen, zählen noch (Netzlaufzeit). */
export const LATE_GRACE_MS = 400;

export interface RaceResult { answer: Answer; verdict: Verdict; gained: number; timeMs: number | null; fastest: boolean; closest: boolean }

export interface RaceState {
  v: 1;
  kind: 'race';
  settings: ClassicSettings;
  players: NetPlayer[];
  deck: Dealt[];
  index: number;
  phase: 'lobby' | 'question' | 'reveal' | 'done';
  startedAt: number;
  /** eingegangene Antworten der laufenden Frage je Spieler-id */
  answers: Record<string, { answer: Answer; timeMs: number }>;
  /** Auswertung der letzten Frage je Spieler-id (nur in der Auflösung) */
  results: Record<string, RaceResult> | null;
  /** schnellste richtige Antwort des ganzen Rennens */
  best: { id: string; timeMs: number } | null;
}

export const DEFAULT_RACE_SETTINGS: ClassicSettings = { length: 10, level: 'stammgast', categories: null, era: 'alle', seconds: 20 };

export const createRace = (): RaceState => ({
  v: 1, kind: 'race', settings: DEFAULT_RACE_SETTINGS, players: [], deck: [], index: 0, phase: 'lobby', startedAt: 0, answers: {}, results: null, best: null,
});

export function startRace(s: RaceState, settings: ClassicSettings, questions: Question[], now: number, rnd: () => number = Math.random): RaceState {
  if (s.phase !== 'lobby' || !questions.length || !s.players.length) return s;
  return {
    ...s, settings: { ...settings, length: questions.length },
    players: s.players.map((p) => ({ ...p, score: 0, correct: 0, streak: 0 })),
    deck: questions.map((q) => deal(q, rnd)), index: 0, phase: 'question', startedAt: now, answers: {}, results: null, best: null,
  };
}

export const raceDeadline = (s: RaceState): number | null => (s.settings.seconds > 0 ? s.startedAt + s.settings.seconds * 1000 : null);

/** Antwort eines Spielers festhalten. Nur die erste Antwort je Frage zählt; veraltete und zu späte werden verworfen. */
export function submitAnswer(s: RaceState, id: string, index: number, answer: Answer, timeMs: number): RaceState {
  if (s.phase !== 'question' || index !== s.index || answer === null || s.answers[id] || !s.players.some((p) => p.id === id)) return s;
  const total = s.settings.seconds * 1000;
  if (total > 0 && timeMs > total + LATE_GRACE_MS) return s;
  return { ...s, answers: { ...s.answers, [id]: { answer, timeMs: Math.max(0, Math.min(timeMs, total || timeMs)) } } };
}

/** Haben alle verbundenen Spieler geantwortet? (Getrennte Spieler halten das Rennen nicht auf.) */
export function everyoneAnswered(s: RaceState): boolean {
  const online = s.players.filter((p) => p.connected);
  return s.phase === 'question' && online.length > 0 && online.every((p) => s.answers[p.id]);
}

/** Frage auswerten: Punkte mit Zeitbonus, bei Schätzfragen Bonus für die beste Schätzung, schnellste richtige Antwort. */
export function resolveQuestion(s: RaceState): RaceState {
  if (s.phase !== 'question') return s;
  const d = s.deck[s.index];
  const total = s.settings.seconds * 1000;
  const results: Record<string, RaceResult> = {};
  for (const p of s.players) {
    const a = s.answers[p.id];
    const verdict = judge(d, a ? a.answer : null);
    results[p.id] = { answer: a?.answer ?? null, verdict, gained: points(verdict, a && total > 0 ? 1 - a.timeMs / total : 0), timeMs: a?.timeMs ?? null, fastest: false, closest: false };
  }
  const entries = Object.entries(results);
  if (d.q.type === 'estimate') {
    const offs = entries.filter(([, r]) => r.verdict.off !== undefined).map(([, r]) => r.verdict.off!);
    if (offs.length) {
      const min = Math.min(...offs);
      for (const [, r] of entries) if (r.verdict.off === min) { r.closest = true; r.gained += CLOSEST_BONUS; }
    }
  }
  const right = entries.filter(([, r]) => r.verdict.correct && r.timeMs !== null).sort((a, b) => a[1].timeMs! - b[1].timeMs!);
  let best = s.best;
  if (right.length) {
    right[0][1].fastest = true;
    if (!best || right[0][1].timeMs! < best.timeMs) best = { id: right[0][0], timeMs: right[0][1].timeMs! };
  }
  const players = s.players.map((p) => {
    const r = results[p.id];
    return { ...p, score: p.score + r.gained, correct: p.correct + (r.verdict.correct ? 1 : 0), streak: r.verdict.correct ? p.streak + 1 : 0 };
  });
  return { ...s, players, results, best, phase: 'reveal' };
}

export function nextQuestion(s: RaceState, now: number): RaceState {
  if (s.phase !== 'reveal') return s;
  const index = s.index + 1;
  return index >= s.deck.length ? { ...s, index, phase: 'done', answers: {}, results: null } : { ...s, index, phase: 'question', startedAt: now, answers: {}, results: null };
}

/** Uhr des Hosts: wertet aus, sobald alle geantwortet haben oder die Zeit (plus Kulanz) um ist. */
export function tickRace(s: RaceState, now: number): RaceState {
  if (s.phase !== 'question') return s;
  const end = raceDeadline(s);
  return everyoneAnswered(s) || (end !== null && now >= end + LATE_GRACE_MS) ? resolveQuestion(s) : s;
}

/** Zurück in die Lobby (gleiche Spieler, Punkte auf null). */
export const backToLobby = (s: RaceState): RaceState => ({ ...createRace(), settings: s.settings, players: s.players.map((p) => ({ ...p, score: 0, correct: 0, streak: 0 })) });

// ---------- Ansicht fürs Handy: enthält nie die Lösung der laufenden Frage ----------
export interface PublicQuestion { id: string; type: Question['type']; category: string; difficulty: number; question: string; image?: Question['image']; unit?: string; shown: string[] }
export type Screen =
  | { k: 'lobby' }
  | { k: 'question'; index: number; total: number; q: PublicQuestion; deadline: number | null; totalMs: number; answered: boolean }
  | { k: 'reveal'; index: number; total: number; status: 'right' | 'partial' | 'wrong' | 'none'; gained: number; solution: string; explanation: string; fastest: boolean; closest: boolean; last: boolean }
  | { k: 'done'; winners: string[] };
export interface PlayerView { you: { id: string; name: string; color: string; avatar: string; score: number; place: number; streak: number }; players: number; screen: Screen }

export function publicQuestion(d: Dealt): PublicQuestion {
  const q = d.q;
  return { id: q.id, type: q.type, category: q.category, difficulty: q.difficulty, question: q.question, image: q.image, unit: q.unit, shown: d.shown };
}

export function playerView(s: RaceState, id: string): PlayerView | null {
  const ranked = rankPlayers(s.players);
  const me = ranked.find((r) => r.player.id === id);
  if (!me) return null;
  const p = me.player;
  const you = { id: p.id, name: p.name, color: p.color, avatar: p.avatar, score: p.score, place: me.place, streak: p.streak };
  const base = { you, players: s.players.length };
  if (s.phase === 'lobby') return { ...base, screen: { k: 'lobby' } };
  if (s.phase === 'done') return { ...base, screen: { k: 'done', winners: ranked.filter((r) => r.place === 1).map((r) => r.player.name) } };
  const d = s.deck[s.index];
  if (s.phase === 'question') {
    return { ...base, screen: { k: 'question', index: s.index, total: s.deck.length, q: publicQuestion(d), deadline: raceDeadline(s), totalMs: s.settings.seconds * 1000, answered: !!s.answers[id] } };
  }
  const r = s.results?.[id];
  const status = !r || r.answer === null ? 'none' : r.verdict.correct ? 'right' : r.verdict.accuracy > 0 ? 'partial' : 'wrong';
  return { ...base, screen: { k: 'reveal', index: s.index, total: s.deck.length, status, gained: r?.gained ?? 0, solution: solutionText(d), explanation: d.q.explanation, fastest: !!r?.fastest, closest: !!r?.closest, last: s.index + 1 >= s.deck.length } };
}

export function isRaceState(x: unknown): x is RaceState {
  const s = x as RaceState;
  return typeof s === 'object' && s !== null && s.v === 1 && s.kind === 'race' && Array.isArray(s.players) && Array.isArray(s.deck)
    && ['lobby', 'question', 'reveal', 'done'].includes(s.phase) && Number.isInteger(s.index) && typeof s.answers === 'object' && s.answers !== null
    && (s.phase === 'lobby' || s.phase === 'done' || s.index < s.deck.length) && (s.phase !== 'reveal' || (typeof s.results === 'object' && s.results !== null));
}
