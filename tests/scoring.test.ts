import { describe, expect, it } from 'vitest';
import { fmtEstimate, judge, points, solutionText } from '../src/core/scoring';
import type { Dealt, Question } from '../src/core/types';

const base = { category: 'x', difficulty: 3 as const, tags: [], question: 'Frage?', explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' };
const mc: Dealt = { q: { ...base, id: 'mc', type: 'mc', options: ['A', 'B', 'C'], answer: 0 } as Question, shown: ['B', 'A', 'C'], correctIndex: 1 };
const tf: Dealt = { q: { ...base, id: 'tf', type: 'tf', answer: false } as Question, shown: [], correctIndex: -1 };
const est: Dealt = { q: { ...base, id: 'e', type: 'estimate', answer: 100, tolerance: 40, unit: 'kg' } as Question, shown: [], correctIndex: -1 };
const ord: Dealt = { q: { ...base, id: 'o', type: 'order', items: ['a', 'b', 'c', 'd'] } as Question, shown: ['d', 'c', 'b', 'a'], correctIndex: -1 };

describe('judge', () => {
  it('wertet Multiple Choice nach der angezeigten Reihenfolge', () => {
    expect(judge(mc, { kind: 'choice', index: 1 }).correct).toBe(true);
    expect(judge(mc, { kind: 'choice', index: 0 }).correct).toBe(false);
  });
  it('wertet Wahr/Falsch', () => {
    expect(judge(tf, { kind: 'bool', value: false }).correct).toBe(true);
    expect(judge(tf, { kind: 'bool', value: true }).accuracy).toBe(0);
  });
  it('gibt bei abgelaufener Zeit nichts', () => {
    for (const d of [mc, tf, est, ord]) expect(judge(d, null)).toEqual({ accuracy: 0, correct: false });
  });
  it('staffelt Schätzfragen nach Abweichung', () => {
    expect(judge(est, { kind: 'number', value: 100 })).toMatchObject({ accuracy: 1, correct: true, off: 0 });
    expect(judge(est, { kind: 'number', value: 110 }).accuracy).toBeCloseTo(0.75);
    expect(judge(est, { kind: 'number', value: 70 })).toMatchObject({ correct: false });
    expect(judge(est, { kind: 'number', value: 70 }).accuracy).toBeCloseTo(0.25);
    expect(judge(est, { kind: 'number', value: 500 }).accuracy).toBe(0);
    expect(judge(est, { kind: 'number', value: NaN }).accuracy).toBe(0);
  });
  it('gibt bei Sortierfragen nur moderate Teilpunkte', () => {
    expect(judge(ord, { kind: 'order', items: ['a', 'b', 'c', 'd'] })).toMatchObject({ accuracy: 1, correct: true });
    expect(judge(ord, { kind: 'order', items: ['a', 'b', 'd', 'c'] })).toMatchObject({ accuracy: 0.25, correct: false });
    expect(judge(ord, { kind: 'order', items: ['d', 'c', 'b', 'a'] }).accuracy).toBe(0);
  });
  it('lehnt Antworten vom falschen Typ ab', () => {
    expect(judge(mc, { kind: 'bool', value: true }).correct).toBe(false);
    expect(judge(est, { kind: 'choice', index: 0 }).accuracy).toBe(0);
  });
});

describe('points', () => {
  const right = { accuracy: 1, correct: true };
  it('vergibt Grundpunkte plus Zeitbonus', () => {
    expect(points(right, 1)).toBe(1000);
    expect(points(right, 0.5)).toBe(750);
    expect(points(right, 0)).toBe(500);
  });
  it('begrenzt den Zeitanteil auf 0…1', () => {
    expect(points(right, 7)).toBe(1000);
    expect(points(right, -3)).toBe(500);
  });
  it('gibt für falsche Antworten nie Punkte', () => {
    expect(points({ accuracy: 0, correct: false }, 1)).toBe(0);
  });
  it('gewichtet Schätzfragen mit der Genauigkeit und gibt Bonus erst ab „halb richtig“', () => {
    expect(points({ accuracy: 0.75, correct: true }, 1)).toBe(750);
    expect(points({ accuracy: 0.25, correct: false }, 1)).toBe(125);
  });
});

describe('solutionText', () => {
  it('formatiert die Lösung je Typ', () => {
    expect(solutionText(mc)).toBe('A');
    expect(solutionText(tf)).toBe('Falsch');
    expect(solutionText(est)).toBe('100 kg');
    expect(solutionText(ord)).toBe('a → b → c → d');
  });
  it('schreibt Jahreszahlen ohne Tausenderpunkt, andere Zahlen mit', () => {
    expect(fmtEstimate({ answer: 1950 }, 1950)).toBe('1950');
    expect(fmtEstimate({ answer: 1950 }, 2010)).toBe('2010');
    expect(fmtEstimate({ answer: 7004, unit: 'm' }, 7004)).toBe('7.004');
    expect(fmtEstimate({ answer: 15000, unit: 'U/min' }, 15000)).toBe('15.000');
    expect(fmtEstimate({ answer: 1.8, unit: 's' }, 1.8)).toBe('1,8');
  });
});
