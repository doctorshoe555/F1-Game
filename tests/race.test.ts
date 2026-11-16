import { describe, expect, it } from 'vitest';
import { backToLobby, CLOSEST_BONUS, createRace, everyoneAnswered, isRaceState, nextQuestion, playerView, resolveQuestion, startRace, submitAnswer, tickRace, type RaceState } from '../src/core/race';
import { joinRoster, rankPlayers, setConnected, type NetPlayer } from '../src/core/roster';
import type { Question } from '../src/core/types';
import { compensate, estimateOffset, MAX_LAG_MS } from '../src/net/clock';
import { cleanRoomCode, newRoomCode } from '../src/net/protocol';

const base = { category: 'a', difficulty: 2 as const, tags: [], explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' };
const tf = (id: string): Question => ({ ...base, id, type: 'tf', question: 'Stimmt das?', answer: true });
const est: Question = { ...base, id: 'e', type: 'estimate', question: 'Wie viele?', answer: 100, tolerance: 40 };
const settings = { length: 2, level: 'stammgast' as const, categories: null, era: 'alle' as const, seconds: 20 };
const yes = { kind: 'bool', value: true } as const;
const no = { kind: 'bool', value: false } as const;
const T0 = 1_000_000;
let n = 0;
const tok = () => `tok${++n}`;
const hello = (name: string, token?: string) => ({ name, color: 'rosso', avatar: '🏎️', token });

function lobbyWith(...names: string[]): { s: RaceState; tokens: Record<string, string> } {
  let s = createRace(); let tokens: Record<string, string> = {};
  for (const name of names) { const r = joinRoster(s.players, tokens, hello(name), tok); s = { ...s, players: r.players }; tokens = r.tokens; }
  return { s, tokens };
}
const running = (qs: Question[], ...names: string[]) => startRace(lobbyWith(...names).s, settings, qs, T0, () => 0.5);

describe('Beitritt und Wiedereinstieg', () => {
  it('vergibt ids und Tokens und lehnt doppelte Namen verbundener Spieler ab', () => {
    const { s, tokens } = lobbyWith('Ada', 'Ben');
    expect(s.players.map((p) => [p.id, p.name, p.connected])).toEqual([['p1', 'Ada', true], ['p2', 'Ben', true]]);
    expect(Object.keys(tokens)).toEqual(['p1', 'p2']);
    expect(joinRoster(s.players, tokens, hello(' ada '), tok).status).toBe('name-taken');
    expect(joinRoster(s.players, tokens, hello('   '), tok).status).toBe('bad-name');
  });
  it('lässt einen getrennten Spieler über sein Token wieder einsteigen – mit Punkten', () => {
    const { s, tokens } = lobbyWith('Ada', 'Ben');
    const players = setConnected(s.players.map((p) => (p.id === 'p1' ? { ...p, score: 1500 } : p)), 'p1', false);
    const r = joinRoster(players, tokens, hello('Egal', tokens.p1), tok);
    expect(r).toMatchObject({ status: 'rejoined', player: { id: 'p1', name: 'Ada', score: 1500, connected: true }, token: tokens.p1 });
    expect(r.players).toHaveLength(2);
  });
  it('lässt einen getrennten Spieler auch nur mit seinem Namen wieder einsteigen (neues Gerät)', () => {
    const { s, tokens } = lobbyWith('Ada');
    const players = setConnected([{ ...s.players[0], score: 900 }], 'p1', false);
    const r = joinRoster(players, tokens, hello('ADA'), tok);
    expect(r).toMatchObject({ status: 'rejoined', player: { id: 'p1', score: 900 } });
    if (r.status === 'rejoined') { expect(r.token).not.toBe(tokens.p1); expect(r.tokens.p1).toBe(r.token); }
  });
  it('begrenzt den Raum auf 12 Fahrer, Rückkehrer kommen trotzdem rein', () => {
    const { s, tokens } = lobbyWith(...Array.from({ length: 12 }, (_, i) => `F${i}`));
    expect(joinRoster(s.players, tokens, hello('Zuspät'), tok).status).toBe('full');
    expect(joinRoster(setConnected(s.players, 'p3', false), tokens, hello('F2'), tok).status).toBe('rejoined');
  });
  it('vergibt nach dem Entfernen eines Spielers keine id doppelt', () => {
    const { s, tokens } = lobbyWith('Ada', 'Ben', 'Cem');
    const r = joinRoster(s.players.filter((p) => p.id !== 'p2'), tokens, hello('Dua'), tok);
    expect(r.players.map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
  });
  it('teilt Plätze bei Punktgleichheit', () => {
    const mk = (id: string, score: number): NetPlayer => ({ id, name: id, color: '', avatar: '', score, correct: 0, streak: 0, connected: true });
    expect(rankPlayers([mk('a', 5), mk('b', 9), mk('c', 5)]).map((r) => [r.player.id, r.place])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
  });
});

describe('Quiz-Rennen', () => {
  it('startet nur aus der Lobby, mit Spielern und Fragen', () => {
    expect(startRace(createRace(), settings, [tf('1')], T0).phase).toBe('lobby');
    expect(startRace(lobbyWith('Ada').s, settings, [], T0).phase).toBe('lobby');
    const s = running([tf('1'), tf('2')], 'Ada');
    expect(s).toMatchObject({ phase: 'question', index: 0, startedAt: T0 });
    expect(startRace(s, settings, [tf('9')], T0)).toBe(s);
  });
  it('wertet aus, sobald alle verbundenen Spieler geantwortet haben, mit Zeitbonus und schnellster Runde', () => {
    let s = running([tf('1'), tf('2')], 'Ada', 'Ben', 'Cem');
    s = submitAnswer(s, 'p1', 0, yes, 5_000);
    s = submitAnswer(s, 'p2', 0, yes, 2_000);
    expect(everyoneAnswered(s)).toBe(false);
    expect(tickRace(s, T0 + 6_000).phase).toBe('question');
    s = tickRace(submitAnswer(s, 'p3', 0, no, 1_000), T0 + 6_000);
    expect(s.phase).toBe('reveal');
    expect(s.players.map((p) => p.score)).toEqual([875, 950, 0]);
    expect(s.results!.p2).toMatchObject({ fastest: true, gained: 950 });
    expect(s.results!.p1.fastest).toBe(false);
    expect(s.results!.p3).toMatchObject({ fastest: false, gained: 0 });   // schneller, aber falsch
    expect(s.best).toEqual({ id: 'p2', timeMs: 2_000 });
  });
  it('wartet nicht auf getrennte Spieler und löst nach Ablauf der Zeit (plus Kulanz) auf', () => {
    let s = running([tf('1')], 'Ada', 'Ben');
    s = { ...s, players: setConnected(s.players, 'p2', false) };
    expect(tickRace(s, T0 + 20_000).phase).toBe('question');
    const timedOut = tickRace(s, T0 + 20_400);
    expect(timedOut.phase).toBe('reveal');
    expect(timedOut.results!.p1).toMatchObject({ answer: null, gained: 0 });
    expect(tickRace(submitAnswer(s, 'p1', 0, yes, 100), T0 + 200).phase).toBe('reveal');
  });
  it('zählt nur die erste Antwort und verwirft veraltete, verspätete und fremde', () => {
    let s = running([tf('1'), tf('2')], 'Ada', 'Ben');
    s = submitAnswer(s, 'p1', 0, yes, 1_000);
    expect(submitAnswer(s, 'p1', 0, no, 1_500)).toBe(s);
    expect(submitAnswer(s, 'p2', 1, yes, 1_000)).toBe(s);          // Antwort auf eine andere Frage
    expect(submitAnswer(s, 'p2', 0, yes, 20_500)).toBe(s);         // nach der Kulanz
    expect(submitAnswer(s, 'p9', 0, yes, 1_000)).toBe(s);
    expect(submitAnswer(s, 'p2', 0, null, 1_000)).toBe(s);
    expect(submitAnswer(s, 'p2', 0, yes, 20_300).answers.p2.timeMs).toBe(20_000);
  });
  it('gibt bei Schätzfragen der besten Schätzung einen Bonus', () => {
    let s = running([est], 'Ada', 'Ben', 'Cem');
    s = submitAnswer(s, 'p1', 0, { kind: 'number', value: 500 }, 0);
    s = submitAnswer(s, 'p2', 0, { kind: 'number', value: 300 }, 0);
    s = resolveQuestion(s);
    expect(s.results!.p2).toMatchObject({ closest: true, gained: CLOSEST_BONUS });   // weit daneben, aber am nächsten dran
    expect(s.results!.p1).toMatchObject({ closest: false, gained: 0 });
    expect(s.results!.p3.closest).toBe(false);
  });
  it('läuft bis zur Siegerehrung und zurück in die Lobby', () => {
    let s = running([tf('1'), tf('2')], 'Ada', 'Ben');
    s = resolveQuestion(submitAnswer(s, 'p1', 0, yes, 0));
    expect(nextQuestion(s, T0 + 50_000)).toMatchObject({ phase: 'question', index: 1, startedAt: T0 + 50_000, answers: {}, results: null });
    s = nextQuestion(resolveQuestion(nextQuestion(s, T0)), T0);
    expect(s.phase).toBe('done');
    expect(playerView(s, 'p1')!.screen).toEqual({ k: 'done', winners: ['Ada'] });
    const again = backToLobby(s);
    expect(again).toMatchObject({ phase: 'lobby', deck: [] });
    expect(again.players.map((p) => [p.name, p.score])).toEqual([['Ada', 0], ['Ben', 0]]);
  });
  it('bleibt als JSON speicherbar und erkennt kaputte Zustände', () => {
    const s = resolveQuestion(submitAnswer(running([tf('1')], 'Ada'), 'p1', 0, yes, 100));
    const copy = JSON.parse(JSON.stringify(s));
    expect(copy).toEqual(s);
    expect(isRaceState(copy)).toBe(true);
    for (const bad of [null, {}, { ...s, kind: 'x' }, { ...s, index: 5 }, { ...s, results: null }, { ...s, players: 'x' }]) expect(isRaceState(bad)).toBe(false);
  });
});

describe('Ansicht fürs Handy', () => {
  it('verrät während der Frage weder Lösung noch Erklärung', () => {
    const mc: Question = { ...base, id: 'm', type: 'mc', question: 'Wer?', options: ['Richtig', 'Falsch1', 'Falsch2'], answer: 0, explanation: 'GEHEIM' };
    const s = running([mc], 'Ada');
    const v = playerView(s, 'p1')!;
    expect(v.screen.k).toBe('question');
    const json = JSON.stringify(v);
    expect(json).not.toContain('GEHEIM');
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('correctIndex');
    expect(v.screen).toMatchObject({ deadline: T0 + 20_000, totalMs: 20_000, answered: false });
    expect(playerView(submitAnswer(s, 'p1', 0, { kind: 'choice', index: 0 }, 5), 'p1')!.screen).toMatchObject({ answered: true });
    expect(playerView(s, 'niemand')).toBeNull();
  });
  it('zeigt in der Auflösung das eigene Ergebnis, die Lösung und den Platz', () => {
    let s = running([tf('1'), tf('2')], 'Ada', 'Ben');
    s = resolveQuestion(submitAnswer(submitAnswer(s, 'p1', 0, no, 10), 'p2', 0, yes, 4_000));
    expect(playerView(s, 'p2')).toMatchObject({ you: { place: 1, score: 900 }, players: 2, screen: { k: 'reveal', status: 'right', gained: 900, solution: 'Wahr', explanation: 'Darum.', fastest: true, last: false } });
    expect(playerView(s, 'p1')!.screen).toMatchObject({ status: 'wrong', gained: 0, fastest: false });
    const silent = resolveQuestion(running([tf('1')], 'Ada'));
    expect(playerView(silent, 'p1')!.screen).toMatchObject({ status: 'none', last: true });
  });
});

describe('Uhrenabgleich und Zeitstempelausgleich', () => {
  it('nimmt die Messung mit der kürzesten Laufzeit', () => {
    const r = estimateOffset([
      { sentAt: 1000, receivedAt: 1400, hostTime: 6100 },   // 400 ms Laufzeit, ungenau
      { sentAt: 2000, receivedAt: 2040, hostTime: 7020 },   // 40 ms Laufzeit → Versatz 5000
      { sentAt: 3000, receivedAt: 2990, hostTime: 9999 },   // unmöglich, wird ignoriert
    ]);
    expect(r).toEqual({ offset: 5000, rtt: 40 });
    expect(estimateOffset([])).toBeNull();
  });
  it('schreibt Netzlaufzeit gut, aber nur in Grenzen', () => {
    const start = 10_000;
    expect(compensate(12_000, 12_300, start)).toBe(12_000);                       // ehrlich: 300 ms Laufzeit gutgeschrieben
    expect(compensate(13_000, 12_300, start)).toBe(12_300);                       // Zukunft gibt es nicht
    expect(compensate(10_100, 15_000, start)).toBe(15_000 - MAX_LAG_MS);          // „ich war viel früher“ → gedeckelt
    expect(compensate(5_000, 10_200, start)).toBe(start);                         // nie vor Fragenbeginn
    expect(compensate('quatsch', 12_300, start)).toBe(12_300);
    expect(compensate(NaN, 12_300, start)).toBe(12_300);
  });
  it('erzeugt und säubert Raum-Codes ohne verwechselbare Buchstaben', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(cleanRoomCode(' ab-1c d9e ')).toBe('ABCD');
  });
});
