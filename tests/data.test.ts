import { describe, expect, it } from 'vitest';
// @ts-expect-error – reines Node-Skript ohne Typdeklaration
import { validateAll } from '../scripts/validate.mjs';
import { parseNumber } from '../src/ui/questionView';

describe('Fragendateien', () => {
  it('bestehen Schema- und Inhaltsprüfung', () => {
    const { errors, total } = validateAll();
    expect(errors).toEqual([]);
    expect(total).toBeGreaterThan(200);
  });
});

describe('parseNumber', () => {
  it('versteht deutsche und englische Schreibweisen', () => {
    expect(parseNumber('1,8')).toBe(1.8);
    expect(parseNumber('1.8')).toBe(1.8);
    expect(parseNumber('1.200')).toBe(1200);
    expect(parseNumber('7 004')).toBe(7004);
    expect(parseNumber('15.000,5')).toBe(15000.5);
    expect(parseNumber(' 42 ')).toBe(42);
  });
  it('lehnt Unsinn ab', () => {
    for (const s of ['', 'abc', '12abc', '1,2,3', '--5']) expect(parseNumber(s)).toBeNaN();
  });
});
