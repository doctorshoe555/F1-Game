import { describe, expect, it } from 'vitest';
import { actJeopardy, boardCleared, buildBoards, BUZZ_WINDOW_MS, createJeopardy, DEFAULT_JEOPARDY, describeJeopardy, EARLY_LOCK_MS, HOST, hostJeopardy, inputFor, isJeopardyState, jeopardyView, maxFinalWager, maxSafetyWager, readDelay, startJeopardy, tickJeopardy, type JeopardySettings, type JeopardyState } from '../src/core/jeopardy';
import { loadQuestions } from '../src/core/questions';
import type { NetPlayer } from '../src/core/roster';
import { isPhrasedAsQuestion, matchesText, normalizeText, textAnswerable } from '../src/core/scoring';
import type { Dealt, Question } from '../src/core/types';

const base = { tags: [], explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' };
const mc = (id: string, category: string, difficulty: number, right = `Richtig ${id}`): Question =>
  ({ ...base, id, category, difficulty: difficulty as 1, type: 'mc', question: `Frage ${id}?`, options: [right, 'Falsch A', 'Falsch B', 'Falsch C'], answer: 0 });
const est = (id: string, category: string): Question => ({ ...base, id, category, difficulty: 3, type: 'estimate', question: `Wie viele ${id}?`, answer: 100, tolerance: 50 });
/** 14 Kategorien × 6 Fragen; in jeder Kategorie eine Schätzfrage auf Stufe 3 */
const POOL: Question[] = Array.from({ length: 14 }, (_, c) => [1, 2, 4, 5, 5].map((d, i) => mc(`c${c}q${i}`, `kat${c}`, d)).concat(est(`c${c}e`, `kat${c}`))).flat();
const T0 = 1_000_000;
const seq = (seed = 1) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const mkPlayer = (id: string, name: string): NetPlayer => ({ id, name, color: 'rosso', avatar: '🏎️', score: 0, correct: 0, streak: 0, connected: true });
const lobby = (...names: string[]): JeopardyState => ({ ...createJeopardy(), players: names.map((n, i) => mkPlayer(`p${i + 1}`, n)) });
const start = (over: Partial<JeopardySettings> = {}, names = ['Ada', 'Ben', 'Cem']): JeopardyState =>
  startJeopardy(lobby(...names), { ...DEFAULT_JEOPARDY, ...over }, POOL, T0, seq(7));

/** Sucht ein offenes Feld nach Bedingung. */
function find(s: JeopardyState, test: (cell: JeopardyState['board'][0]['cells'][0]) => boolean): { ci: number; ri: number } {
  for (let ci = 0; ci < s.board.length; ci++) for (let ri = 0; ri < 5; ri++) { const c = s.board[ci].cells[ri]; if (!c.used && test(c)) return { ci, ri }; }
  throw new Error('kein passendes Feld');
}
const normal = (s: JeopardyState) => find(s, (c) => !c.safety && c.d.q.type === 'mc');
const pick = (s: JeopardyState, pos: { ci: number; ri: number }, now = T0) => actJeopardy(s, HOST, { k: 'pick', ...pos }, now);
/** Feld wählen und warten, bis die Buzzer offen sind. */
function open(s: JeopardyState, pos = normal(s)): { s: JeopardyState; t: number } {
  const next = pick(s, pos);
  return { s: next, t: next.cur!.openAt };
}
/** Spieler buzzert und der Host wertet das Sammelfenster aus. */
function buzzIn(s: JeopardyState, id: string, t: number): JeopardyState {
  return tickJeopardy(actJeopardy(s, id, { k: 'buzz', at: t }, t), t + BUZZ_WINDOW_MS);
}
const rightIdx = (s: JeopardyState) => s.board[s.cur!.ci].cells[s.cur!.ri].d.correctIndex;
const score = (s: JeopardyState, id: string) => s.players.find((p) => p.id === id)!.score;

describe('Board', () => {
  it('zieht je Runde eigene Kategorien mit Werten 100–500 bzw. doppelt', () => {
    const { boards, finalQ } = buildBoards(POOL, DEFAULT_JEOPARDY, seq(3));
    expect(boards).toHaveLength(2);
    expect(boards.map((b) => b.length)).toEqual([6, 6]);
    expect(new Set(boards.flat().map((c) => c.id)).size).toBe(12);
    expect(boards[0][0].cells.map((c) => c.value)).toEqual([100, 200, 300, 400, 500]);
    expect(boards[1][0].cells.map((c) => c.value)).toEqual([200, 400, 600, 800, 1000]);
    for (const cat of boards.flat()) {
      const diffs = cat.cells.map((c) => c.d.q.difficulty);
      expect(diffs).toEqual([...diffs].sort((a, b) => a - b));               // nach oben wird es schwerer
      expect(new Set(cat.cells.map((c) => c.d.q.id)).size).toBe(5);
    }
    const onBoard = new Set(boards.flat().flatMap((c) => c.cells.map((x) => x.d.q.id)));
    expect(finalQ && !onBoard.has(finalQ.q.id)).toBe(true);
  });
  it('versteckt 1 Safety Car in Runde 1 und 2 in Runde 2 – nie in der ersten Reihe, nie auf Schätzfragen', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { boards } = buildBoards(POOL, DEFAULT_JEOPARDY, seq(seed));
      boards.forEach((b, r) => {
        const sc = b.flatMap((c) => c.cells.map((cell, ri) => ({ cell, ri }))).filter((x) => x.cell.safety);
        expect(sc).toHaveLength(r + 1);
        for (const x of sc) { expect(x.ri).toBeGreaterThan(0); expect(x.cell.d.q.type).not.toBe('estimate'); }
      });
    }
  });
  it('kürzt auf eine Runde, wenn die Kategorien nicht reichen, und baut mit dem echten Pool', () => {
    expect(buildBoards(POOL.filter((q) => +q.category.slice(3) < 8), DEFAULT_JEOPARDY, seq(1)).boards).toHaveLength(1);
    expect(buildBoards(POOL.slice(0, 12), DEFAULT_JEOPARDY, seq(1)).boards).toHaveLength(0);
    const real = buildBoards(loadQuestions(), DEFAULT_JEOPARDY);
    expect(real.boards).toHaveLength(2);
    expect(real.finalQ).not.toBeNull();
  });
  it('startet nur mit Spielern und genug Fragen', () => {
    expect(startJeopardy(createJeopardy(), DEFAULT_JEOPARDY, POOL, T0).phase).toBe('lobby');
    expect(startJeopardy(lobby('Ada'), DEFAULT_JEOPARDY, POOL.slice(0, 5), T0).phase).toBe('lobby');
    const s = start();
    expect(s).toMatchObject({ phase: 'board', round: 1 });
    expect(s.players.some((p) => p.id === s.chooser)).toBe(true);
  });
});

describe('Feld wählen und buzzern', () => {
  it('lässt nur den Wähler (oder den Host) ein offenes Feld nehmen', () => {
    const s = start();
    const other = s.players.find((p) => p.id !== s.chooser)!.id;
    const pos = normal(s);
    expect(actJeopardy(s, other, { k: 'pick', ...pos }, T0)).toBe(s);
    expect(actJeopardy(s, s.chooser!, { k: 'pick', ...pos }, T0).phase).toBe('buzz');
    expect(actJeopardy(s, HOST, { k: 'pick', ci: 99, ri: 0 }, T0)).toBe(s);
  });
  it('öffnet die Buzzer erst nach der Lesezeit und sperrt Frühstarter kurz', () => {
    const { s, t } = open(start());
    expect(t).toBe(T0 + readDelay(s.board[s.cur!.ci].cells[s.cur!.ri].d.q.question));
    const early = actJeopardy(s, 'p1', { k: 'buzz', at: t - 200 }, t - 200);
    expect(early.cur!.pending).toEqual([]);
    expect(actJeopardy(early, 'p1', { k: 'buzz', at: t + 10 }, t + 10)).toBe(early);          // noch gesperrt
    const later = t + EARLY_LOCK_MS + 1;
    expect(actJeopardy(early, 'p1', { k: 'buzz', at: later }, later).cur!.pending).toHaveLength(1);
  });
  it('wertet im Sammelfenster den frühesten Zeitstempel – nicht die Reihenfolge des Eintreffens', () => {
    let { s, t } = open(start());
    s = actJeopardy(s, 'p1', { k: 'buzz', at: t + 180 }, t + 200);     // kommt zuerst an, hat aber später gedrückt
    s = actJeopardy(s, 'p2', { k: 'buzz', at: t + 120 }, t + 260);     // langsame Leitung, früher gedrückt
    expect(tickJeopardy(s, t + 300).phase).toBe('buzz');               // Fenster (250 ms ab erstem Treffer) läuft noch
    s = tickJeopardy(s, t + 200 + BUZZ_WINDOW_MS);
    expect(s).toMatchObject({ phase: 'answer', cur: { buzzer: 'p2', pending: [] } });
    expect(s.cur!.deadline).toBe(t + 200 + BUZZ_WINDOW_MS + 15_000);
  });
  it('zählt jeden Spieler nur einmal und ignoriert Unbekannte', () => {
    let { s, t } = open(start());
    s = actJeopardy(s, 'p1', { k: 'buzz', at: t + 5 }, t + 5);
    expect(actJeopardy(s, 'p1', { k: 'buzz', at: t + 1 }, t + 6)).toBe(s);
    expect(actJeopardy(s, 'p9', { k: 'buzz', at: t + 1 }, t + 6)).toBe(s);
  });
  it('deckt auf, wenn niemand buzzert', () => {
    const { s, t } = open(start());
    expect(tickJeopardy(s, t + 11_999).phase).toBe('buzz');
    const r = tickJeopardy(s, t + 12_000);
    expect(r).toMatchObject({ phase: 'reveal', cur: { log: [] } });
    expect(r.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe('Antworten', () => {
  it('richtig: Punkte gutschreiben, der Spieler wählt als Nächster', () => {
    let { s, t } = open(start());
    const value = s.cur!.value;
    s = buzzIn(s, 'p2', t);
    expect(actJeopardy(s, 'p1', { k: 'answer', a: { kind: 'choice', index: rightIdx(s) } }, t)).toBe(s);   // nicht dran
    s = actJeopardy(s, 'p2', { k: 'answer', a: { kind: 'choice', index: rightIdx(s) } }, t + 500);
    expect(s).toMatchObject({ phase: 'reveal', chooser: 'p2' });
    expect(score(s, 'p2')).toBe(value);
    s = hostJeopardy(s, { k: 'continue' }, t);
    expect(s).toMatchObject({ phase: 'board', cur: null });
    expect(s.board.flatMap((c) => c.cells).filter((c) => c.used)).toHaveLength(1);
  });
  it('falsch: Punktabzug, dann dürfen die anderen – der Gesperrte nicht mehr', () => {
    let { s, t } = open(start());
    const value = s.cur!.value;
    const before = s.chooser;
    s = buzzIn(s, 'p1', t);
    s = actJeopardy(s, 'p1', { k: 'answer', a: { kind: 'choice', index: (rightIdx(s) + 1) % 4 } }, t + 1_000);
    expect(s).toMatchObject({ phase: 'buzz', cur: { locked: ['p1'], openAt: t + 1_000 } });
    expect(score(s, 'p1')).toBe(-value);
    expect(actJeopardy(s, 'p1', { k: 'buzz', at: t + 1_100 }, t + 1_100)).toBe(s);
    s = buzzIn(s, 'p3', t + 1_200);
    s = actJeopardy(s, 'p3', { k: 'answer', a: { kind: 'choice', index: (rightIdx(s) + 1) % 4 } }, t + 2_000);
    s = buzzIn(s, 'p2', t + 2_100);
    s = actJeopardy(s, 'p2', { k: 'answer', a: { kind: 'choice', index: (rightIdx(s) + 2) % 4 } }, t + 3_000);
    expect(s.phase).toBe('reveal');                                    // alle haben es versucht
    expect(s.players.map((p) => p.score)).toEqual([-value, -value, -value]);
    expect(s.chooser).toBe(before);                                    // niemand lag richtig → Wähler bleibt
  });
  it('wertet eine abgelaufene Antwortzeit als falsch', () => {
    let { s, t } = open(start());
    s = buzzIn(s, 'p1', t);
    const end = s.cur!.deadline!;
    expect(tickJeopardy(s, end + 399).phase).toBe('answer');
    s = tickJeopardy(s, end + 400);
    expect(s.phase).toBe('buzz');
    expect(s.cur!.log[0]).toMatchObject({ id: 'p1', ok: false, said: '(Zeit abgelaufen)' });
  });
  it('überspringt getrennte Spieler beim Nachbuzzern', () => {
    let { s, t } = open(start({}, ['Ada', 'Ben']));
    s = { ...s, players: s.players.map((p) => (p.id === 'p2' ? { ...p, connected: false } : p)) };
    s = buzzIn(s, 'p1', t);
    s = actJeopardy(s, 'p1', { k: 'answer', a: { kind: 'choice', index: (rightIdx(s) + 1) % 4 } }, t);
    expect(s.phase).toBe('reveal');
  });
  it('lässt den Host eine Wertung in der Auflösung umdrehen', () => {
    let { s, t } = open(start());
    const value = s.cur!.value;
    const before = s.chooser;
    s = buzzIn(s, 'p1', t);
    s = actJeopardy(s, 'p1', { k: 'answer', a: { kind: 'choice', index: rightIdx(s) } }, t);
    s = hostJeopardy(s, { k: 'flip', i: 0 }, t);
    expect(score(s, 'p1')).toBe(-value);
    expect(s.chooser).toBe(before);
    s = hostJeopardy(s, { k: 'flip', i: 0 }, t);
    expect(score(s, 'p1')).toBe(value);
    expect(s.chooser).toBe('p1');
  });
});

describe('Spielleiter-Modus', () => {
  it('lässt mündlich antworten und den Host per Klick werten', () => {
    let { s, t } = open(start({ judge: 'gm' }));
    const value = s.cur!.value;
    expect(s.cur!.input).toBe('voice');
    s = buzzIn(s, 'p3', t);
    expect(s.cur!.deadline).toBeNull();                                // kein Zeitlimit, der Spielleiter entscheidet
    expect(actJeopardy(s, 'p3', { k: 'answer', a: { kind: 'choice', index: 0 } }, t)).toBe(s);
    expect(jeopardyView(s, 'p3')!.screen).toMatchObject({ k: 'janswer', you: true, input: 'voice', q: null });
    const no = hostJeopardy(s, { k: 'judge', ok: false }, t);
    expect(no.phase).toBe('buzz');
    expect(score(no, 'p3')).toBe(-value);
    const yes = hostJeopardy(s, { k: 'judge', ok: true }, t);
    expect(yes).toMatchObject({ phase: 'reveal', chooser: 'p3' });
    expect(score(yes, 'p3')).toBe(value);
  });
});

describe('Safety Car', () => {
  const toSafety = (over: Partial<JeopardySettings> = {}) => { const s = start(over); return pick(s, find(s, (c) => c.safety)); };
  it('gehört nur dem Wähler, der seinen Einsatz selbst bestimmt', () => {
    let s = toSafety();
    const who = s.chooser!;
    const other = s.players.find((p) => p.id !== who)!.id;
    expect(s).toMatchObject({ phase: 'wager', cur: { buzzer: who, safety: true } });
    expect(jeopardyView(s, who)!.screen).toMatchObject({ k: 'jwager', you: true, min: 5, max: 500 });
    expect(actJeopardy(s, other, { k: 'wager', amount: 100 }, T0)).toBe(s);
    s = actJeopardy(s, who, { k: 'wager', amount: 350 }, T0);
    expect(s).toMatchObject({ phase: 'answer', cur: { stake: 350, buzzer: who } });
    const won = actJeopardy(s, who, { k: 'answer', a: { kind: 'choice', index: rightIdx(s) } }, T0);
    expect(score(won, who)).toBe(350);
    const lost = actJeopardy(s, who, { k: 'answer', a: { kind: 'choice', index: (rightIdx(s) + 1) % 4 } }, T0);
    expect(lost.phase).toBe('reveal');                                 // niemand sonst darf ran
    expect(score(lost, who)).toBe(-350);
  });
  it('begrenzt den Einsatz: mindestens 5, höchstens Punktestand bzw. höchster Feldwert der Runde', () => {
    let s = toSafety();
    const who = s.chooser!;
    expect(actJeopardy(s, who, { k: 'wager', amount: 99_999 }, T0).cur!.stake).toBe(500);
    expect(actJeopardy(s, who, { k: 'wager', amount: -50 }, T0).cur!.stake).toBe(5);
    expect(actJeopardy(s, who, { k: 'wager', amount: NaN }, T0).cur!.stake).toBe(5);
    s = { ...s, players: s.players.map((p) => (p.id === who ? { ...p, score: 2_300 } : p)) };
    expect(maxSafetyWager(s, who)).toBe(2_300);
    expect(maxSafetyWager({ ...s, round: 2, players: s.players.map((p) => ({ ...p, score: -400 })) }, who)).toBe(1_000);
  });
});

describe('Schätzfragen', () => {
  it('spielen alle; wer am nächsten dran ist, bekommt den Feldwert – ohne Abzug für die anderen', () => {
    let s = start();
    s = pick(s, find(s, (c) => c.d.q.type === 'estimate'));
    const value = s.cur!.value;
    expect(s).toMatchObject({ phase: 'allplay', cur: { input: 'allplay' } });
    s = actJeopardy(s, 'p1', { k: 'estimate', value: 60 }, T0);
    s = actJeopardy(s, 'p1', { k: 'estimate', value: 100 }, T0);       // zweiter Versuch zählt nicht
    s = actJeopardy(s, 'p2', { k: 'estimate', value: 130 }, T0);
    expect(s.phase).toBe('allplay');
    s = actJeopardy(s, 'p3', { k: 'estimate', value: 300 }, T0);       // letzter verbundener Spieler → Auflösung
    expect(s).toMatchObject({ phase: 'reveal', chooser: 'p2', cur: { closest: ['p2'] } });
    expect(s.players.map((p) => p.score)).toEqual([0, value, 0]);
  });
  it('teilt bei Gleichstand und löst nach Zeitablauf auch mit fehlenden Antworten auf', () => {
    let s = start();
    s = pick(s, find(s, (c) => c.d.q.type === 'estimate'));
    const value = s.cur!.value;
    s = actJeopardy(actJeopardy(s, 'p1', { k: 'estimate', value: 90 }, T0), 'p3', { k: 'estimate', value: 110 }, T0);
    s = tickJeopardy(s, T0 + 30_400);
    expect(s.cur!.closest).toEqual(['p1', 'p3']);
    expect(s.players.map((p) => p.score)).toEqual([value, 0, value]);
  });
});

/** Spielt alle offenen Felder schnell durch (Host überspringt). */
function clearBoard(s: JeopardyState): JeopardyState {
  while (!boardCleared(s) && s.phase === 'board') {
    s = pick(s, find(s, () => true));
    if (s.phase === 'wager') s = actJeopardy(s, s.cur!.buzzer!, { k: 'wager', amount: 5 }, T0);
    s = hostJeopardy(hostJeopardy(s, { k: 'skip' }, T0), { k: 'continue' }, T0);
  }
  return s;
}

describe('Runden und Finale', () => {
  it('wechselt nach dem leeren Board in Runde 2 – dort wählt zuerst, wer hinten liegt', () => {
    let s = start({}, ['Ada', 'Ben']);
    s = { ...s, players: s.players.map((p) => (p.id === 'p2' ? { ...p, score: -300 } : { ...p, score: 900 })) };
    s = clearBoard(s);
    expect(s.phase).toBe('roundEnd');
    s = hostJeopardy(s, { k: 'nextRound' }, T0);
    expect(s).toMatchObject({ phase: 'board', round: 2, nextBoards: [] });
    expect(s.board[0].cells[4].value).toBe(1_000);
    const last = [...s.players].sort((a, b) => a.score - b.score)[0].id;
    expect(s.chooser).toBe(last);
  });
  const toFinal = (over: Partial<JeopardySettings> = {}): JeopardyState => {
    let s = clearBoard(start({ rounds: 1, ...over }, ['Ada', 'Ben', 'Cem']));
    expect(s.phase).toBe('finalWager');
    return { ...s, players: s.players.map((p, i) => ({ ...p, score: [1_000, 200, -400][i] })) };
  };
  it('lässt alle geheim setzen: bis zum eigenen Punktestand, mindestens aber bis 500', () => {
    let s = toFinal();
    expect([maxFinalWager(s, 'p1'), maxFinalWager(s, 'p2'), maxFinalWager(s, 'p3')]).toEqual([1_000, 500, 500]);
    s = actJeopardy(s, 'p1', { k: 'finalWager', amount: 5_000 }, T0);
    expect(s.fin!.wagers.p1).toBe(1_000);
    expect(actJeopardy(s, 'p1', { k: 'finalWager', amount: 1 }, T0)).toBe(s);
    const view = JSON.stringify(jeopardyView(s, 'p2'));
    expect(view).not.toContain('1000');                                // fremde Einsätze bleiben geheim
    expect(jeopardyView(s, 'p1')!.screen).toMatchObject({ k: 'jfwager', done: true });
    s = actJeopardy(actJeopardy(s, 'p2', { k: 'finalWager', amount: 200 }, T0), 'p3', { k: 'finalWager', amount: 0 }, T0);
    expect(s.phase).toBe('finalAnswer');
  });
  it('wertet Auswahl-Antworten sofort und rechnet die Einsätze ab', () => {
    let s = toFinal({ judge: 'mc' });
    for (const [id, amount] of [['p1', 800], ['p2', 200], ['p3', 500]] as const) s = actJeopardy(s, id, { k: 'finalWager', amount }, T0);
    const right = s.finalQ!.correctIndex;
    s = actJeopardy(s, 'p1', { k: 'finalAnswer', a: { kind: 'choice', index: (right + 1) % 4 } }, T0);
    s = actJeopardy(s, 'p2', { k: 'finalAnswer', a: { kind: 'choice', index: right } }, T0);
    s = tickJeopardy(s, T0 + 45_400);                                  // Cem antwortet nicht
    expect(s.phase).toBe('finalReveal');
    expect(s.players.map((p) => p.score)).toEqual([200, 400, -900]);
    expect(jeopardyView(s, 'p2')!.screen).toMatchObject({ k: 'jfreveal', ok: true, delta: 200 });
    s = hostJeopardy(s, { k: 'continue' }, T0);
    expect(jeopardyView(s, 'p1')!.screen).toEqual({ k: 'done', winners: ['Ben'] });
  });
  it('legt Freitext-Antworten dem Host zur Wertung vor – mit Vorschlag, den er ändern kann', () => {
    let s = toFinal({ judge: 'gm' });
    expect(s.fin!.input).toBe('text');
    for (const id of ['p1', 'p2', 'p3']) s = actJeopardy(s, id, { k: 'finalWager', amount: 100 }, T0);
    const solution = s.finalQ!.shown[s.finalQ!.correctIndex];
    s = actJeopardy(s, 'p1', { k: 'finalAnswer', a: { kind: 'text', text: solution } }, T0);
    s = actJeopardy(s, 'p2', { k: 'finalAnswer', a: { kind: 'text', text: 'fast das Richtige, irgendwie' } }, T0);
    s = actJeopardy(s, 'p3', { k: 'finalAnswer', a: { kind: 'text', text: 'keine Ahnung' } }, T0);
    expect(s).toMatchObject({ phase: 'finalJudge', fin: { verdicts: { p1: true, p2: false, p3: false } } });
    expect(s.players.map((p) => p.score)).toEqual([1_000, 200, -400]);   // noch nichts verbucht
    s = hostJeopardy(s, { k: 'finalVerdict', id: 'p2', ok: true }, T0);
    s = hostJeopardy(s, { k: 'finalConfirm' }, T0);
    expect(s.phase).toBe('finalReveal');
    expect(s.players.map((p) => p.score)).toEqual([1_100, 300, -500]);
  });
  it('endet ohne Finale direkt mit der Siegerehrung', () => {
    expect(clearBoard(start({ rounds: 1, final: false })).phase).toBe('done');
  });
});

describe('Ansicht fürs Handy', () => {
  it('zeigt das Board ohne Fragen und verrät beim Buzzern keine Lösung', () => {
    const s = start();
    const boardView = JSON.stringify(jeopardyView(s, 'p1'));
    expect(boardView).not.toContain('Richtig');
    expect(boardView).not.toContain('safety');
    const { s: b } = open(s);
    const v = jeopardyView(b, 'p1')!;
    expect(v.screen).toMatchObject({ k: 'jbuzz', locked: false, buzzed: false });
    expect(JSON.stringify(v)).not.toContain('Richtig');
    expect(JSON.stringify(v)).not.toContain('Darum');
  });
  it('gibt die Antwortmöglichkeiten nur dem, der gebuzzert hat', () => {
    let { s, t } = open(start());
    s = buzzIn(s, 'p2', t);
    expect(jeopardyView(s, 'p2')!.screen).toMatchObject({ k: 'janswer', you: true, input: 'phone' });
    expect(JSON.stringify(jeopardyView(s, 'p2'))).toContain('Falsch A');
    expect(jeopardyView(s, 'p1')!.screen).toMatchObject({ k: 'janswer', you: false, who: 'Ben', q: null });
  });
  it('formuliert die Lösung mit Gag-Schalter als Frage', () => {
    let { s, t } = open(start({ asQuestion: true }));
    s = tickJeopardy(s, t + 12_000);
    const v = jeopardyView(s, 'p1')!.screen;
    expect(v.k === 'jreveal' && v.solution).toMatch(/^Wer oder was ist „Richtig .+“\?$/);
  });
  it('bleibt speicherbar und erkennt beschädigte Stände', () => {
    let { s, t } = open(start());
    s = buzzIn(s, 'p1', t);
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy).toEqual(s);
    expect(isJeopardyState(copy)).toBe(true);
    expect(isJeopardyState(JSON.parse(JSON.stringify(createJeopardy())))).toBe(true);
    for (const bad of [null, {}, { ...s, kind: 'race' }, { ...s, phase: 'x' }, { ...s, cur: null }, { ...s, board: [{ cells: [] }] }, { ...s, players: [{}] }]) expect(isJeopardyState(bad)).toBe(false);
    expect(describeJeopardy(s)).toMatch(/^Jeopardy \(per Handy\) · Ada 0, Ben 0, Cem 0 · Runde 1, 30 Felder offen$/);
  });
});

describe('Freitext', () => {
  const d = (right: string, accept?: string[]): Dealt => ({ q: { ...mc('x', 'k', 3, right), accept }, shown: [right, 'Falsch A', 'Falsch B', 'Falsch C'], correctIndex: 0 });
  it('verzeiht Tippfehler, Großschreibung, Akzente und fehlende Vornamen', () => {
    const ham = d('Lewis Hamilton');
    for (const ok of ['Lewis Hamilton', 'lewis hamilton', 'Hamilton', 'hamiltn', 'Luis Hamilton', 'Wer ist Lewis Hamilton?', '  HAMILTON!  ']) expect(matchesText(ham, ok)).toBe(true);
    for (const no of ['', 'Lewis', 'Schumacher', 'Hamburg', 'Ham']) expect(matchesText(ham, no)).toBe(false);
    expect(matchesText(d('São Paulo (Interlagos)'), 'sao paulo')).toBe(true);
    expect(matchesText(d('Kimi Räikkönen'), 'Raikkonen')).toBe(true);
  });
  it('ist bei kurzen Lösungen streng und kennt Alternativen', () => {
    expect(matchesText(d('2010'), '2011')).toBe(false);
    expect(matchesText(d('25'), '25')).toBe(true);
    expect(matchesText(d('Die 24 Stunden von Le Mans', ['Le Mans']), 'le mans')).toBe(true);
  });
  it('nutzt Freitext nur bei kurzen Lösungen, sonst Auswahl', () => {
    const settings = { ...DEFAULT_JEOPARDY, judge: 'text' as const };
    expect(textAnswerable(d('Monaco'))).toBe(true);
    expect(inputFor(d('Monaco'), settings)).toBe('text');
    expect(inputFor(d('Ein schnelleres Auto will überrunden – Platz machen'), settings)).toBe('phone');
    expect(inputFor(d('Monaco'), DEFAULT_JEOPARDY)).toBe('phone');
    expect(inputFor(d('Monaco'), { ...settings, judge: 'gm' })).toBe('voice');
  });
  it('erkennt die Frageform für den Gag-Schalter', () => {
    expect(isPhrasedAsQuestion('Wer ist Kimi?')).toBe(true);
    expect(isPhrasedAsQuestion('Kimi')).toBe(false);
    expect(normalizeText('Was ist der Halo?')).toBe('halo');
  });
});
