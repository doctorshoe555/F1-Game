import { describe, expect, it } from 'vitest';
import { answerClassic, createClassic, currentPlayer, deadline, describeClassic, isClassicState, nextClassic, ranking, readyClassic, resumeClassic, type ClassicSettings } from '../src/core/classic';
import type { Question } from '../src/core/types';

const tf = (id: string): Question => ({ id, type: 'tf', category: 'a', difficulty: 2, tags: [], question: 'Frage?', answer: true, explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' });
const settings: ClassicSettings = { length: 3, level: 'stammgast', categories: null, era: 'alle', seconds: 20 };
const T0 = 1_000_000;
const SOLO = [{ name: 'Solo', color: 'rosso' }];
const DUO = [{ name: 'Ada', color: 'rosso' }, { name: 'Ben', color: 'papaya' }];
const yes = { kind: 'bool', value: true } as const;
const no = { kind: 'bool', value: false } as const;

describe('klassische Runde', () => {
  it('läuft von der ersten Frage bis zum Endstand', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], SOLO, T0);
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
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], SOLO, T0);
    for (const a of [yes, yes, no]) s = nextClassic(answerClassic(s, a, s.startedAt), T0);
    expect(s.players[0]).toMatchObject({ bestStreak: 2, streak: 0 });
  });
  it('wertet abgelaufene Zeit als falsch – auch wenn die Antwort zu spät noch eintrifft', () => {
    let s = createClassic(settings, [tf('1'), tf('2')], SOLO, T0);
    s = answerClassic(s, null, T0 + 20_000);
    expect(s.last).toMatchObject({ timedOut: true, gained: 0, answer: null });
    s = nextClassic(s, T0);
    s = answerClassic(s, yes, T0 + 25_000);
    expect(s.last).toMatchObject({ timedOut: true, gained: 0 });
    expect(s.players[0].score).toBe(0);
  });
  it('gibt ohne Timer keinen Zeitbonus und kein Zeitlimit', () => {
    let s = createClassic({ ...settings, seconds: 0 }, [tf('1')], SOLO, T0);
    expect(deadline(s)).toBeNull();
    s = answerClassic(s, yes, T0 + 999_999);
    expect(s.last).toMatchObject({ gained: 500, timedOut: false });
  });
  it('ignoriert doppelte Antworten und verfrühtes Weiterklicken', () => {
    let s = createClassic(settings, [tf('1'), tf('2')], SOLO, T0);
    expect(nextClassic(s, T0)).toBe(s);
    s = answerClassic(s, yes, T0);
    expect(answerClassic(s, no, T0)).toBe(s);
  });
  it('lässt mehrere Spieler reihum antworten – mit Geräteübergabe vor jeder Frage', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], DUO, T0);
    expect(s.phase).toBe('handover');
    expect(answerClassic(s, yes, T0)).toBe(s);           // vor „Bereit“ zählt keine Antwort
    const turns: number[] = [];
    while (s.phase !== 'done') {
      turns.push(currentPlayer(s));
      s = readyClassic(s, T0 + 60_000);                   // Übergabe dauert – die Uhr startet erst jetzt
      expect(deadline(s)).toBe(T0 + 80_000);
      s = nextClassic(answerClassic(s, yes, T0 + 60_000), T0);
    }
    expect(turns).toEqual([0, 1, 0]);
    expect(s.players.map((p) => p.score)).toEqual([2000, 1000]);
  });
  it('überspringt die Übergabe im Solo-Spiel', () => {
    const s = createClassic(settings, [tf('1'), tf('2')], SOLO, T0);
    expect(s.phase).toBe('question');
    expect(readyClassic(s, T0 + 5)).toBe(s);
    expect(nextClassic(answerClassic(s, yes, T0), T0).phase).toBe('question');
  });
  it('erlaubt 1 bis 8 Spieler', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `F${i}`, color: 'rosso' }));
    expect(() => createClassic(settings, [tf('1')], many(8), T0)).not.toThrow();
    expect(() => createClassic(settings, [tf('1')], many(9), T0)).toThrow();
    expect(() => createClassic(settings, [tf('1')], [], T0)).toThrow();
  });
  it('bildet die Rangliste mit geteilten Plätzen', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3')], [...DUO, { name: 'Cem', color: 'navy' }], T0);
    for (const a of [no, yes, yes]) { s = readyClassic(s, T0); s = nextClassic(answerClassic(s, a, T0), T0); }
    expect(ranking(s).map((r) => [r.player.name, r.place])).toEqual([['Ben', 1], ['Cem', 1], ['Ada', 3]]);
  });
  it('gibt beim Fortsetzen wieder die volle Zeit und übergibt bei mehreren Spielern zuerst das Gerät', () => {
    const solo = createClassic(settings, [tf('1')], SOLO, T0);
    expect(resumeClassic(solo, T0 + 900_000)).toMatchObject({ phase: 'question', startedAt: T0 + 900_000 });
    const duo = readyClassic(createClassic(settings, [tf('1'), tf('2')], DUO, T0), T0);
    expect(resumeClassic(duo, T0 + 5).phase).toBe('handover');
    const reveal = answerClassic(solo, yes, T0);
    expect(resumeClassic(reveal, T0 + 5)).toBe(reveal);
  });
  it('erkennt gültige und beschädigte Spielstände', () => {
    const s = answerClassic(createClassic(settings, [tf('1'), tf('2')], SOLO, T0), yes, T0);
    expect(isClassicState(JSON.parse(JSON.stringify(s)))).toBe(true);
    for (const bad of [null, 42, {}, { ...s, v: 2 }, { ...s, phase: 'pause' }, { ...s, players: [] }, { ...s, index: 7 }, { ...s, deck: [{}] }, { ...s, last: null },
      { ...s, players: [{ name: 'x', score: 'viel' }] }]) expect(isClassicState(bad)).toBe(false);
    expect(describeClassic(s)).toBe('Solo (Solo) · Frage 1/2');
  });
  it('bleibt als JSON speicherbar', () => {
    const s = answerClassic(createClassic(settings, [tf('1')], SOLO, T0), yes, T0);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('merkt sich die schnellste richtige Antwort als Fastest Lap', () => {
    let s = createClassic(settings, [tf('1'), tf('2'), tf('3'), tf('4')], SOLO, T0);
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
    expect(createClassic(settings, [], SOLO, T0).phase).toBe('done');
  });
});
