// „Grand Prix Jeopardy“: Board, Buzzer, Safety-Car-Felder (Daily Double) und Finale Runde.
// Reiner, serialisierbarer Zustand. Alle Eingaben kommen als Aktionen – egal ob vom Handy oder vom Host-Gerät.
import { CATEGORIES, deal, isValidOn, shuffle, todayIso } from './questions';
import { rankPlayers, type NetPlayer } from './roster';
import { isPhrasedAsQuestion, judge, solutionText, textAnswerable } from './scoring';
import type { Answer, Dealt, Question } from './types';

export interface JeopardySettings {
  categories: 5 | 6;
  rounds: 1 | 2;
  final: boolean;
  /** mc = Auswahl auf dem Handy · text = Freitext, automatisch geprüft · gm = Spielleiter bewertet per Klick */
  judge: 'mc' | 'text' | 'gm';
  /** Gag: Antworten als Frage formulieren (nur Flair, nie Pflicht) */
  asQuestion: boolean;
  buzzSeconds: number;
  answerSeconds: number;
}
export const DEFAULT_JEOPARDY: JeopardySettings = { categories: 6, rounds: 2, final: true, judge: 'mc', asQuestion: false, buzzSeconds: 12, answerSeconds: 15 };

export const ROWS = 5;
export const BUZZ_WINDOW_MS = 250;      // so lange sammelt der Host Buzzer-Treffer, bevor er den frühesten wertet
export const EARLY_LOCK_MS = 750;       // Sperre für zu frühes Buzzern
export const ALLPLAY_MS = 30_000;
export const FINAL_MS = 45_000;
export const TEXT_ANSWER_MS = 30_000;
export const MIN_WAGER = 5;
export const MERCY_WAGER = 500;         // so viel darf im Finale setzen, wer weniger (oder Schulden) hat

export interface JCell { value: number; d: Dealt; used: boolean; safety: boolean }
export interface JCat { id: string; title: string; emoji: string; cells: JCell[] }
/** phone = Eingabe am Handy · text = Freitext · voice = laut sagen, Spielleiter wertet · allplay = alle schätzen */
export type JInput = 'phone' | 'text' | 'voice' | 'allplay';
export interface JLog { id: string; ok: boolean; delta: number; said: string; formError?: boolean }

export interface JCur {
  ci: number; ri: number; value: number; stake: number; safety: boolean; input: JInput;
  locked: string[]; buzzer: string | null;
  openAt: number; deadline: number | null;
  pending: { id: string; at: number }[]; windowEnd: number | null;
  blocked: Record<string, number>;
  estimates: Record<string, number>; closest: string[];
  log: JLog[]; prevChooser: string | null;
}
export interface JFinal {
  input: 'phone' | 'text';
  wagers: Record<string, number>; answers: Record<string, Answer>;
  verdicts: Record<string, boolean>; deltas: Record<string, number>;
  deadline: number | null;
}
export type JPhase = 'lobby' | 'board' | 'wager' | 'buzz' | 'answer' | 'allplay' | 'reveal' | 'roundEnd' | 'finalWager' | 'finalAnswer' | 'finalJudge' | 'finalReveal' | 'done';

export interface JeopardyState {
  v: 1; kind: 'jeopardy';
  /** true = alle spielen an einem Gerät (kein Netz) */
  local: boolean;
  settings: JeopardySettings;
  players: NetPlayer[];
  round: number;
  board: JCat[];
  nextBoards: JCat[][];
  finalQ: Dealt | null;
  chooser: string | null;
  phase: JPhase;
  cur: JCur | null;
  fin: JFinal | null;
}

export const createJeopardy = (local = false): JeopardyState => ({
  v: 1, kind: 'jeopardy', local, settings: DEFAULT_JEOPARDY, players: [], round: 1, board: [], nextBoards: [], finalQ: null, chooser: null, phase: 'lobby', cur: null, fin: null,
});

// ---------- Board bauen ----------
/** Fünf Fragen einer Kategorie mit möglichst gleichmäßig steigender Schwierigkeit. */
function pickLadder(qs: Question[], rnd: () => number): Question[] {
  const left = shuffle(qs, rnd);
  const out: Question[] = [];
  for (let level = 1; level <= ROWS; level++) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (Math.abs(left[i].difficulty - level) < Math.abs(left[best].difficulty - level)) best = i;
    out.push(left.splice(best, 1)[0]);
  }
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

export interface Built { boards: JCat[][]; finalQ: Dealt | null }
/** Zieht Kategorien zufällig aus dem Pool und baut ein Board je Runde (Werte 100–500, in Runde 2 doppelt). */
export function buildBoards(pool: Question[], settings: JeopardySettings, rnd: () => number = Math.random, today = todayIso()): Built {
  const valid = pool.filter((q) => isValidOn(q, today));
  const byCat = new Map<string, Question[]>();
  for (const q of valid) byCat.set(q.category, [...(byCat.get(q.category) ?? []), q]);
  const usable = shuffle([...byCat.entries()].filter(([, qs]) => qs.length >= ROWS), rnd);
  const rounds = Math.max(1, Math.min(settings.rounds, Math.floor(usable.length / settings.categories)));
  const used = new Set<string>();
  const boards: JCat[][] = [];
  for (let r = 0; r < rounds && usable.length >= settings.categories; r++) {
    const cats = usable.splice(0, settings.categories).map(([id, qs]): JCat => {
      const meta = CATEGORIES.find((c) => c.id === id) ?? { id, title: id, emoji: '❓' };
      return { ...meta, cells: pickLadder(qs, rnd).map((q, i) => { used.add(q.id); return { value: (i + 1) * 100 * (r + 1), d: deal(q, rnd), used: false, safety: false }; }) };
    });
    // Safety Car: 1 in Runde 1, 2 in Runde 2 – nie in der ersten Reihe und nie auf einer Schätzfrage (die spielen alle)
    const spots = shuffle(cats.flatMap((c, ci) => c.cells.map((cell, ri) => ({ ci, ri, cell }))).filter((x) => x.ri > 0 && x.cell.d.q.type !== 'estimate'), rnd);
    spots.slice(0, r + 1).forEach((x) => { cats[x.ci].cells[x.ri].safety = true; });
    boards.push(cats);
  }
  let finalQ: Dealt | null = null;
  if (settings.final) {
    const cand = shuffle(valid.filter((q) => !used.has(q.id) && (q.type === 'mc' || q.type === 'image') && q.difficulty >= 3), rnd).map((q) => deal(q, rnd));
    finalQ = (settings.judge === 'mc' ? cand[0] : cand.find(textAnswerable) ?? cand[0]) ?? null;
  }
  return { boards, finalQ };
}

export function startJeopardy(s: JeopardyState, settings: JeopardySettings, pool: Question[], _now: number, rnd: () => number = Math.random): JeopardyState {
  if (s.phase !== 'lobby' || !s.players.length) return s;
  const built = buildBoards(pool, settings, rnd);
  if (!built.boards.length) return s;
  const order = shuffle(s.players, rnd);
  return {
    ...s, settings: { ...settings, rounds: built.boards.length as 1 | 2, final: settings.final && !!built.finalQ },
    players: s.players.map((p) => ({ ...p, score: 0, correct: 0, streak: 0 })),
    round: 1, board: built.boards[0], nextBoards: built.boards.slice(1), finalQ: built.finalQ, chooser: order[0].id, phase: 'board', cur: null, fin: null,
  };
}

// ---------- Hilfen ----------
const player = (s: JeopardyState, id: string | null): NetPlayer | undefined => s.players.find((p) => p.id === id);
const addScore = (s: JeopardyState, id: string, delta: number, right: boolean | null = null): NetPlayer[] =>
  s.players.map((p) => (p.id === id ? { ...p, score: p.score + delta, correct: p.correct + (right ? 1 : 0), streak: right === null ? p.streak : right ? p.streak + 1 : 0 } : p));
export const cellOf = (s: JeopardyState): JCell | null => (s.cur ? s.board[s.cur.ci].cells[s.cur.ri] : null);
export const boardCleared = (s: JeopardyState): boolean => s.board.every((c) => c.cells.every((x) => x.used));
export const readDelay = (text: string): number => Math.max(1500, Math.min(5000, 1200 + text.length * 35));
export const maxSafetyWager = (s: JeopardyState, id: string): number => Math.max(player(s, id)?.score ?? 0, ROWS * 100 * s.round);
export const maxFinalWager = (s: JeopardyState, id: string): number => Math.max(player(s, id)?.score ?? 0, MERCY_WAGER);
const clampInt = (v: unknown, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(typeof v === 'number' && Number.isFinite(v) ? v : lo)));

/** Wie wird dieses Feld beantwortet? */
export function inputFor(d: Dealt, settings: JeopardySettings): JInput {
  const t = d.q.type;
  if (t === 'estimate') return 'allplay';
  if (t === 'order') return 'phone';
  if (settings.judge === 'gm') return 'voice';
  if (t === 'tf') return 'phone';
  return settings.judge === 'text' && textAnswerable(d) ? 'text' : 'phone';
}
export function saidText(d: Dealt, a: Answer): string {
  if (a === null) return '(keine Antwort)';
  if (a.kind === 'choice') return d.shown[a.index] ?? '?';
  if (a.kind === 'bool') return a.value ? 'Wahr' : 'Falsch';
  if (a.kind === 'text') return a.text.trim().slice(0, 80) || '(leer)';
  if (a.kind === 'number') return String(a.value);
  return a.items.join(' → ');
}
/** Gag-Schalter: Lösung in Frageform. */
export const phrase = (s: JeopardyState, solution: string): string => (s.settings.asQuestion ? `Wer oder was ist „${solution}“?` : solution);

const canBuzz = (s: JeopardyState, id: string): boolean => !!s.cur && !s.cur.locked.includes(id) && !!player(s, id)?.connected;
const answerDeadline = (s: JeopardyState, input: JInput, now: number): number | null =>
  (input === 'voice' ? null : now + (input === 'text' ? TEXT_ANSWER_MS : s.settings.answerSeconds * 1000));

function toReveal(s: JeopardyState): JeopardyState {
  return { ...s, phase: 'reveal', cur: { ...s.cur!, buzzer: null, deadline: null, pending: [], windowEnd: null } };
}
function right(s: JeopardyState, id: string, said: string, formError: boolean): JeopardyState {
  const c = s.cur!;
  return toReveal({ ...s, players: addScore(s, id, c.stake, true), chooser: id, cur: { ...c, log: [...c.log, { id, ok: true, delta: c.stake, said, formError }] } });
}
function wrong(s: JeopardyState, id: string, said: string, now: number): JeopardyState {
  const c = s.cur!;
  const next: JeopardyState = { ...s, players: addScore(s, id, -c.stake, false), cur: { ...c, locked: [...c.locked, id], buzzer: null, log: [...c.log, { id, ok: false, delta: -c.stake, said }] } };
  // Safety Car spielt nur einer; sonst dürfen die anderen noch einmal buzzern
  if (c.safety || !next.players.some((p) => canBuzz(next, p.id))) return toReveal(next);
  return { ...next, phase: 'buzz', cur: { ...next.cur!, openAt: now, deadline: now + s.settings.buzzSeconds * 1000, pending: [], windowEnd: null, blocked: {} } };
}

// ---------- Aktionen der Spieler ----------
export type JAction =
  | { k: 'pick'; ci: number; ri: number } | { k: 'wager'; amount: number } | { k: 'buzz'; at: number }
  | { k: 'answer'; a: Answer } | { k: 'estimate'; value: number } | { k: 'finalWager'; amount: number } | { k: 'finalAnswer'; a: Answer };
/** Kennung für Eingriffe des Host-Geräts (darf z. B. immer ein Feld wählen). */
export const HOST = '#host';

export function actJeopardy(s: JeopardyState, id: string, a: JAction, now: number): JeopardyState {
  const c = s.cur;
  switch (a.k) {
    case 'pick': {
      if (s.phase !== 'board' || (id !== HOST && id !== s.chooser)) return s;
      const cell = s.board[a.ci]?.cells[a.ri];
      if (!cell || cell.used) return s;
      const input = inputFor(cell.d, s.settings);
      const who = player(s, s.chooser)?.connected ? s.chooser : s.players.find((p) => p.connected)?.id ?? s.chooser;
      const cur: JCur = { ci: a.ci, ri: a.ri, value: cell.value, stake: cell.value, safety: cell.safety && !!who, input, locked: [], buzzer: null, openAt: now, deadline: null, pending: [], windowEnd: null, blocked: {}, estimates: {}, closest: [], log: [], prevChooser: s.chooser };
      if (cur.safety) return { ...s, phase: 'wager', chooser: who, cur: { ...cur, buzzer: who } };
      if (input === 'allplay') return { ...s, phase: 'allplay', cur: { ...cur, deadline: now + ALLPLAY_MS } };
      const openAt = now + readDelay(cell.d.q.question);
      return { ...s, phase: 'buzz', cur: { ...cur, openAt, deadline: openAt + s.settings.buzzSeconds * 1000 } };
    }
    case 'wager': {
      if (s.phase !== 'wager' || !c || id !== c.buzzer) return s;
      return { ...s, phase: 'answer', cur: { ...c, stake: clampInt(a.amount, MIN_WAGER, maxSafetyWager(s, id)), deadline: answerDeadline(s, c.input, now) } };
    }
    case 'buzz': {
      if (s.phase !== 'buzz' || !c || !canBuzz(s, id) || c.pending.some((p) => p.id === id)) return s;
      if ((c.blocked[id] ?? 0) > now) return s;
      // zu früh gedrückt: kurze Sperre (wie in der Fernsehshow)
      if (a.at < c.openAt) return { ...s, cur: { ...c, blocked: { ...c.blocked, [id]: Math.max(now, c.openAt) + EARLY_LOCK_MS } } };
      return { ...s, cur: { ...c, pending: [...c.pending, { id, at: a.at }], windowEnd: c.windowEnd ?? now + BUZZ_WINDOW_MS } };
    }
    case 'answer': {
      if (s.phase !== 'answer' || !c || id !== c.buzzer || c.input === 'voice' || a.a === null) return s;
      const d = cellOf(s)!.d;
      const v = judge(d, a.a);
      const formError = s.settings.asQuestion && a.a.kind === 'text' && !isPhrasedAsQuestion(a.a.text);
      return v.correct ? right(s, id, saidText(d, a.a), formError) : wrong(s, id, saidText(d, a.a), now);
    }
    case 'estimate': {
      if (s.phase !== 'allplay' || !c || !player(s, id) || id in c.estimates || !Number.isFinite(a.value)) return s;
      return tickJeopardy({ ...s, cur: { ...c, estimates: { ...c.estimates, [id]: a.value } } }, now);
    }
    case 'finalWager': {
      if (s.phase !== 'finalWager' || !s.fin || !player(s, id) || id in s.fin.wagers) return s;
      return tickJeopardy({ ...s, fin: { ...s.fin, wagers: { ...s.fin.wagers, [id]: clampInt(a.amount, 0, maxFinalWager(s, id)) } } }, now);
    }
    case 'finalAnswer': {
      if (s.phase !== 'finalAnswer' || !s.fin || !player(s, id) || id in s.fin.answers || a.a === null) return s;
      return tickJeopardy({ ...s, fin: { ...s.fin, answers: { ...s.fin.answers, [id]: a.a } } }, now);
    }
  }
}

// ---------- Aktionen des Hosts / Spielleiters ----------
export type JHostAction =
  | { k: 'judge'; ok: boolean } | { k: 'continue' } | { k: 'nextRound' } | { k: 'skip' }
  | { k: 'flip'; i: number } | { k: 'finalVerdict'; id: string; ok: boolean } | { k: 'finalConfirm' };

function startFinal(s: JeopardyState, now: number): JeopardyState {
  const input = s.settings.judge === 'mc' ? 'phone' : 'text';
  return { ...s, phase: 'finalWager', cur: null, fin: { input, wagers: {}, answers: {}, verdicts: {}, deltas: {}, deadline: s.local ? null : now + FINAL_MS } };
}
function resolveAllplay(s: JeopardyState): JeopardyState {
  const c = s.cur!;
  const d = cellOf(s)!.d;
  const offs = Object.entries(c.estimates).map(([id, v]) => ({ id, off: Math.abs(v - (d.q.answer as number)) }));
  if (!offs.length) return toReveal(s);
  const min = Math.min(...offs.map((o) => o.off));
  const closest = offs.filter((o) => o.off === min).map((o) => o.id);
  let players = s.players;
  for (const id of closest) players = addScore({ ...s, players }, id, c.value, true);
  const log = Object.entries(c.estimates).map(([id, v]) => ({ id, ok: closest.includes(id), delta: closest.includes(id) ? c.value : 0, said: String(v) }));
  return toReveal({ ...s, players, chooser: closest[0], cur: { ...c, closest, log } });
}
function finalToJudge(s: JeopardyState): JeopardyState {
  const f = s.fin!;
  const verdicts: Record<string, boolean> = {};
  for (const p of s.players) verdicts[p.id] = judge(s.finalQ!, f.answers[p.id] ?? null).correct;
  const next = { ...s, fin: { ...f, verdicts, deadline: null } };
  // Auswahl-Antworten sind eindeutig; Freitext schaut sich der Host vor der Wertung noch einmal an
  return f.input === 'phone' ? applyFinal(next) : { ...next, phase: 'finalJudge' };
}
function applyFinal(s: JeopardyState): JeopardyState {
  const f = s.fin!;
  const deltas: Record<string, number> = {};
  let players = s.players;
  for (const p of s.players) {
    const stake = f.wagers[p.id] ?? 0;
    deltas[p.id] = f.verdicts[p.id] ? stake : -stake;
    players = addScore({ ...s, players }, p.id, deltas[p.id], !!f.verdicts[p.id]);
  }
  return { ...s, players, phase: 'finalReveal', fin: { ...f, deltas } };
}

export function hostJeopardy(s: JeopardyState, a: JHostAction, now: number): JeopardyState {
  const c = s.cur;
  switch (a.k) {
    case 'judge': {
      if (s.phase !== 'answer' || !c || !c.buzzer) return s;
      return a.ok ? right(s, c.buzzer, '(mündlich)', false) : wrong(s, c.buzzer, '(mündlich)', now);
    }
    case 'skip': {
      if (s.phase === 'buzz' || s.phase === 'wager') return toReveal(s);
      if (s.phase === 'answer' && c?.buzzer) return wrong(s, c.buzzer, '(übersprungen)', now);
      if (s.phase === 'allplay') return resolveAllplay(s);
      if (s.phase === 'finalWager') return { ...s, phase: 'finalAnswer', fin: { ...s.fin!, deadline: s.local ? null : now + FINAL_MS } };
      if (s.phase === 'finalAnswer') return finalToJudge(s);
      return s;
    }
    case 'flip': {
      // Korrektur in der Auflösung: eine Wertung umdrehen (z. B. wenn der Freitext-Vergleich danebenlag)
      const e = c?.log[a.i];
      if (s.phase !== 'reveal' || !c || !e || c.input === 'allplay') return s;
      const log = c.log.map((x, i) => (i === a.i ? { ...x, ok: !x.ok, delta: -x.delta } : x));
      const winner = [...log].reverse().find((x) => x.ok)?.id;
      return { ...s, players: addScore(s, e.id, -2 * e.delta), chooser: winner ?? c.prevChooser, cur: { ...c, log } };
    }
    case 'continue': {
      if (s.phase === 'finalReveal') return { ...s, phase: 'done' };
      if (s.phase !== 'reveal' || !c) return s;
      const board = s.board.map((cat, ci) => (ci !== c.ci ? cat : { ...cat, cells: cat.cells.map((x, ri) => (ri === c.ri ? { ...x, used: true } : x)) }));
      const next: JeopardyState = { ...s, board, cur: null };
      if (!boardCleared(next)) return { ...next, phase: 'board' };
      if (next.nextBoards.length) return { ...next, phase: 'roundEnd' };
      return next.settings.final && next.finalQ ? startFinal(next, now) : { ...next, phase: 'done' };
    }
    case 'nextRound': {
      if (s.phase !== 'roundEnd' || !s.nextBoards.length) return s;
      // In der zweiten Runde beginnt, wer hinten liegt
      const last = [...s.players].sort((x, y) => x.score - y.score)[0];
      return { ...s, phase: 'board', round: s.round + 1, board: s.nextBoards[0], nextBoards: s.nextBoards.slice(1), chooser: last?.id ?? s.chooser };
    }
    case 'finalVerdict':
      return s.phase === 'finalJudge' && s.fin && player(s, a.id) ? { ...s, fin: { ...s.fin, verdicts: { ...s.fin.verdicts, [a.id]: a.ok } } } : s;
    case 'finalConfirm':
      return s.phase === 'finalJudge' ? applyFinal(s) : s;
  }
}

/** Uhr des Hosts: Buzzer auswerten, Fristen durchsetzen, „alle fertig“ erkennen. */
export function tickJeopardy(s: JeopardyState, now: number): JeopardyState {
  const c = s.cur;
  const online = s.players.filter((p) => p.connected);
  const allIn = (map: Record<string, unknown>): boolean => online.length > 0 && online.every((p) => p.id in map);
  if (s.phase === 'buzz' && c) {
    if (c.pending.length && c.windowEnd !== null && now >= c.windowEnd) {
      // Der früheste (ausgeglichene) Zeitstempel gewinnt; bei Gleichstand, wer zuerst beim Host ankam
      const winner = c.pending.reduce((best, p) => (p.at < best.at ? p : best));
      return { ...s, phase: 'answer', cur: { ...c, buzzer: winner.id, pending: [], windowEnd: null, deadline: answerDeadline(s, c.input, now) } };
    }
    if (!c.pending.length && c.deadline !== null && now >= c.deadline) return toReveal(s);
  } else if (s.phase === 'answer' && c?.buzzer && c.deadline !== null && now >= c.deadline + 400) {
    return wrong(s, c.buzzer, '(Zeit abgelaufen)', now);
  } else if (s.phase === 'allplay' && c && (allIn(c.estimates) || (c.deadline !== null && now >= c.deadline + 400))) {
    return resolveAllplay(s);
  } else if (s.phase === 'finalWager' && s.fin && (allIn(s.fin.wagers) || (s.fin.deadline !== null && now >= s.fin.deadline + 400))) {
    return { ...s, phase: 'finalAnswer', fin: { ...s.fin, deadline: s.local ? null : now + FINAL_MS } };
  } else if (s.phase === 'finalAnswer' && s.fin && (allIn(s.fin.answers) || (s.fin.deadline !== null && now >= s.fin.deadline + 400))) {
    return finalToJudge(s);
  }
  return s;
}

export const jeopardyToLobby = (s: JeopardyState): JeopardyState => ({ ...createJeopardy(s.local), settings: s.settings, players: s.players.map((p) => ({ ...p, score: 0, correct: 0, streak: 0 })) });

// ---------- Ansicht fürs Handy ----------
import type { PublicQuestion } from './race';
import { publicQuestion } from './race';

export type JScreen =
  | { k: 'lobby' }
  | { k: 'jboard'; round: number; you: boolean; chooser: string; cats: { title: string; emoji: string; cells: { value: number; used: boolean }[] }[] }
  | { k: 'jwager'; you: boolean; who: string; category: string; min: number; max: number }
  | { k: 'jbuzz'; category: string; value: number; question: string; openAt: number; locked: boolean; blockedUntil: number; buzzed: boolean }
  | { k: 'janswer'; you: boolean; who: string; input: JInput; q: PublicQuestion | null; question: string; deadline: number | null; totalMs: number; asQuestion: boolean }
  | { k: 'jallplay'; q: PublicQuestion; deadline: number | null; totalMs: number; answered: boolean; value: number }
  | { k: 'jreveal'; solution: string; explanation: string; delta: number | null; lines: string[] }
  | { k: 'jround'; round: number }
  | { k: 'jfwager'; category: string; max: number; done: boolean; deadline: number | null; totalMs: number }
  | { k: 'jfanswer'; input: 'phone' | 'text'; q: PublicQuestion; done: boolean; deadline: number | null; totalMs: number; asQuestion: boolean }
  | { k: 'jfwait' }
  | { k: 'jfreveal'; ok: boolean; delta: number; solution: string; explanation: string }
  | { k: 'done'; winners: string[] };
export interface JView { you: { id: string; name: string; color: string; avatar: string; score: number; place: number; streak: number }; players: number; screen: JScreen }

export function jeopardyView(s: JeopardyState, id: string): JView | null {
  const ranked = rankPlayers(s.players);
  const me = ranked.find((r) => r.player.id === id);
  if (!me) return null;
  const p = me.player;
  const base = { you: { id: p.id, name: p.name, color: p.color, avatar: p.avatar, score: p.score, place: me.place, streak: p.streak }, players: s.players.length };
  const name = (pid: string | null): string => player(s, pid)?.name ?? 'Host';
  const c = s.cur;
  const cell = cellOf(s);
  const catTitle = c ? s.board[c.ci].title : '';
  const screen = ((): JScreen => {
    switch (s.phase) {
      case 'lobby': return { k: 'lobby' };
      case 'board': return { k: 'jboard', round: s.round, you: s.chooser === id, chooser: name(s.chooser), cats: s.board.map((cat) => ({ title: cat.title, emoji: cat.emoji, cells: cat.cells.map((x) => ({ value: x.value, used: x.used })) })) };
      case 'wager': return { k: 'jwager', you: c!.buzzer === id, who: name(c!.buzzer), category: catTitle, min: MIN_WAGER, max: maxSafetyWager(s, id) };
      case 'buzz': return { k: 'jbuzz', category: catTitle, value: c!.value, question: cell!.d.q.question, openAt: c!.openAt, locked: c!.locked.includes(id), blockedUntil: c!.blocked[id] ?? 0, buzzed: c!.pending.some((x) => x.id === id) };
      case 'answer': {
        const mine = c!.buzzer === id;
        const total = c!.input === 'text' ? TEXT_ANSWER_MS : s.settings.answerSeconds * 1000;
        return { k: 'janswer', you: mine, who: name(c!.buzzer), input: c!.input, q: mine && c!.input !== 'voice' ? publicQuestion(cell!.d) : null, question: cell!.d.q.question, deadline: c!.deadline, totalMs: total, asQuestion: s.settings.asQuestion };
      }
      case 'allplay': return { k: 'jallplay', q: publicQuestion(cell!.d), deadline: c!.deadline, totalMs: ALLPLAY_MS, answered: id in c!.estimates, value: c!.value };
      case 'reveal': {
        const mineLog = c!.log.filter((l) => l.id === id);
        return { k: 'jreveal', solution: phrase(s, solutionText(cell!.d)), explanation: cell!.d.q.explanation, delta: mineLog.length ? mineLog.reduce((a, l) => a + l.delta, 0) : null,
          lines: c!.log.map((l) => `${name(l.id)}: ${l.said} ${l.ok ? '✓' : '✗'} ${l.delta > 0 ? '+' : ''}${l.delta}`) };
      }
      case 'roundEnd': return { k: 'jround', round: s.round };
      case 'finalWager': return { k: 'jfwager', category: CATEGORIES.find((x) => x.id === s.finalQ!.q.category)?.title ?? '', max: maxFinalWager(s, id), done: id in s.fin!.wagers, deadline: s.fin!.deadline, totalMs: FINAL_MS };
      case 'finalAnswer': return { k: 'jfanswer', input: s.fin!.input, q: publicQuestion(s.finalQ!), done: id in s.fin!.answers, deadline: s.fin!.deadline, totalMs: FINAL_MS, asQuestion: s.settings.asQuestion };
      case 'finalJudge': return { k: 'jfwait' };
      case 'finalReveal': return { k: 'jfreveal', ok: !!s.fin!.verdicts[id], delta: s.fin!.deltas[id] ?? 0, solution: phrase(s, solutionText(s.finalQ!)), explanation: s.finalQ!.q.explanation };
      case 'done': return { k: 'done', winners: ranked.filter((r) => r.place === 1).map((r) => r.player.name) };
    }
  })();
  return { ...base, screen };
}

export function describeJeopardy(s: JeopardyState): string {
  const open = s.board.reduce((n, c) => n + c.cells.filter((x) => !x.used).length, 0);
  const where = s.phase === 'lobby' ? 'Lobby' : s.phase === 'done' ? 'beendet' : s.phase.startsWith('final') ? 'Finale Runde' : `Runde ${s.round}, ${open} Felder offen`;
  return `Jeopardy${s.local ? '' : ' (per Handy)'} · ${s.players.map((p) => `${p.name} ${p.score}`).join(', ')} · ${where}`;
}

export function isJeopardyState(x: unknown): x is JeopardyState {
  const s = x as JeopardyState;
  const obj = (v: unknown): boolean => typeof v === 'object' && v !== null;
  if (!obj(s) || s.v !== 1 || s.kind !== 'jeopardy' || !Array.isArray(s.players) || !Array.isArray(s.board) || !Array.isArray(s.nextBoards) || !obj(s.settings)) return false;
  const phases: JPhase[] = ['lobby', 'board', 'wager', 'buzz', 'answer', 'allplay', 'reveal', 'roundEnd', 'finalWager', 'finalAnswer', 'finalJudge', 'finalReveal', 'done'];
  if (!phases.includes(s.phase)) return false;
  if (!s.players.every((p) => obj(p) && typeof p.id === 'string' && typeof p.name === 'string' && Number.isFinite(p.score))) return false;
  const boardOk = (b: JCat[]): boolean => Array.isArray(b) && b.every((c) => obj(c) && Array.isArray(c.cells) && c.cells.length === ROWS && c.cells.every((x) => obj(x) && Number.isFinite(x.value) && obj(x.d) && obj(x.d.q) && Array.isArray(x.d.shown)));
  if (!boardOk(s.board) || !s.nextBoards.every(boardOk)) return false;
  const needsCur = ['wager', 'buzz', 'answer', 'allplay', 'reveal'].includes(s.phase);
  if (needsCur && (!obj(s.cur) || !s.board[s.cur!.ci]?.cells[s.cur!.ri] || !Array.isArray(s.cur!.log))) return false;
  if (s.phase.startsWith('final') && (!obj(s.fin) || !obj(s.finalQ))) return false;
  return s.phase === 'lobby' || s.board.length > 0;
}
