import { describe, expect, it } from 'vitest';
import { answerClassic, createClassic, currentPlayer, deadline, nextClassic, type ClassicSettings } from '../src/core/classic';
import type { Question } from '../src/core/types';

const tf = (id: string): Question => ({ id, type: 'tf', category: 'a', difficulty: 2, tags: [], question: 'Frage?', answer: true, explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' });
const settings: ClassicSettings = { length: 3, level: 'stammgast', categories: null, era: 'alle', seconds: 20 };
const T0 = 1_000_000;
const yes = { kind: 'bool', value: true } as const;
const no = { kind: 'bool', value: false } as const;

describe('klassische Runde', () => {
  it('läuft von der ersten Frage bis zum Endstand', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], ['Solo'], T0);
    expect(s.phase).toBe('question');
    expect(deadline(s)).toBe(T0 + 20_000);

    s = answerClassic(s, yes, T0 + 5_000);            // richtig nach 5 s → 500 + 375
    expect(s.phase).toBe('reveal');
    expect(s.last).toMatchObject({ gained: 875, timedOut: false });
    s = nextClassic(s, T0 + 10_000);
    expect(s.startedAt).toBe(T0 + 10_000);

    s = answerClassic(s, no, T0 + 11_000);            // falsch
    expect(s.last?.gained).toBe(0);
    s = nextClassic(s, T0 + 20_000);

    s = answerClassic(s, yes, T0 + 20_000);           // sofort richtig → 1000
    s = nextClassic(s, T0 + 30_000);
    expect(s.phase).toBe('done');
    expect(s.players[0]).toMatchObject({ score: 1875, correct: 2, answered: 3, bestStreak: 1 });
  });
  it('zählt Serien', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], ['Solo'], T0);
    for (const a of [yes, yes, no]) s = nextClassic(answerClassic(s, a, s.startedAt), T0);
    expect(s.players[0]).toMatchObject({ bestStreak: 2, streak: 0 });
  });
  it('wertet abgelaufene Zeit als falsch – auch wenn die Antwort zu spät noch eintrifft', () => {
    let s = createClassic(settings, [tf('1'), tf('2')], ['Solo'], T0);
    s = answerClassic(s, null, T0 + 20_000);
    expect(s.last).toMatchObject({ timedOut: true, gained: 0, answer: null });
    s = nextClassic(s, T0);
    s = answerClassic(s, yes, T0 + 25_000);
    expect(s.last).toMatchObject({ timedOut: true, gained: 0 });
    expect(s.players[0].score).toBe(0);
  });
  it('gibt ohne Timer keinen Zeitbonus und kein Zeitlimit', () => {
    let s = createClassic({ ...settings, seconds: 0 }, [tf('1')], ['Solo'], T0);
    expect(deadline(s)).toBeNull();
    s = answerClassic(s, yes, T0 + 999_999);
    expect(s.last).toMatchObject({ gained: 500, timedOut: false });
  });
  it('ignoriert doppelte Antworten und verfrühtes Weiterklicken', () => {
    let s = createClassic(settings, [tf('1'), tf('2')], ['Solo'], T0);
    expect(nextClassic(s, T0)).toBe(s);
    s = answerClassic(s, yes, T0);
    expect(answerClassic(s, no, T0)).toBe(s);
  });
  it('lässt mehrere Spieler reihum antworten', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], ['Ada', 'Ben'], T0);
    const turns: number[] = [];
    while (s.phase !== 'done') { turns.push(currentPlayer(s)); s = nextClassic(answerClassic(s, yes, s.startedAt), T0); }
    expect(turns).toEqual([0, 1, 0]);
    expect(s.players.map((p) => p.score)).toEqual([2000, 1000]);
  });
  it('bleibt als JSON speicherbar', () => {
    const s = answerClassic(createClassic(settings, [tf('1')], ['Solo'], T0), yes, T0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('merkt sich die schnellste richtige Antwort als Fastest Lap', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3'), tf('4')], ['Solo'], T0);
    s = answerClassic(s, yes, T0 + 4_000);
    expect(s.last?.fastestLap).toBe(true);
    s = answerClassic(nextClassic(s, T0), no, T0 + 100);       // schneller, aber falsch
    expect(s.last?.fastestLap).toBe(false);
    s = answerClassic(nextClassic(s, T0), yes, T0 + 6_000);    // richtig, aber langsamer
    expect(s.last?.fastestLap).toBe(false);
    s = answerClassic(nextClassic(s, T0), yes, T0 + 1_500);
    expect(s.last?.fastestLap).toBe(true);
    expect(s.fastest).toEqual({ player: 0, timeMs: 1_500, index: 3 });
  });
  it('ist ohne Fragen sofort fertig', () => {
    expect(createClassic(settings, [], ['Solo'], T0).phase).toBe('done');
  });
});
