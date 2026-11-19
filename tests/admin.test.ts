import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error – reines Node-Skript ohne Typdeklaration
import { toReviewQuestions } from '../scripts/lib/review.mjs';
// @ts-expect-error
import { validateQuestions } from '../scripts/validate.mjs';
import { reportUrl } from '../src/config';
import { bundledQuestions, CATEGORIES, filterPool, loadQuestions, setExtraQuestions } from '../src/core/questions';
import type { Question } from '../src/core/types';
import { validateQuestion } from '../src/core/validate';
import { loadCustom, parseImport, saveCustom } from '../src/storage/custom';
import { clearMemory } from '../src/storage/store';

const cats = CATEGORIES.map((c) => c.id);
const good: Question = { id: 'eigene-1', type: 'mc', category: 'pannen', difficulty: 2, tags: [], question: 'Wer war es?', options: ['A', 'B', 'C'], answer: 1, explanation: 'Darum eben.', source: 'eigene', generated: false, lastVerified: '2026-11-16' };
beforeEach(() => { clearMemory(); setExtraQuestions([]); });

describe('Prüfung im Browser', () => {
  it('lässt alle ausgelieferten Fragen durch – stimmt also mit dem JSON-Schema überein', () => {
    const bad = bundledQuestions().map((q) => [q.id, validateQuestion(q, cats)] as const).filter(([, e]) => e.length);
    expect(bad).toEqual([]);
  });
  it('findet dieselben Fehler wie die Schema-Prüfung', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['id', { id: 'Mit Leerzeichen' }], ['Kategorie', { category: 'gibtsnicht' }], ['difficulty', { difficulty: 7 }], ['answer', { answer: 3 }],
      ['options', { options: ['A', 'A'] }], ['unbekanntes Feld', { quatsch: 1 }], ['lastVerified', { lastVerified: '16.11.2026' }], ['tags', { tags: ['Groß'] }],
      ['tolerance', { type: 'estimate', answer: 5, options: undefined }], ['answer muss true', { type: 'tf', answer: 'ja', options: undefined }],
      ['items', { type: 'order', items: ['a', 'b'], options: undefined, answer: undefined }], ['image', { type: 'image' }], ['explanation', { explanation: '' }],
    ];
    for (const [hint, patch] of cases) {
      const q = JSON.parse(JSON.stringify({ ...good, ...patch }));
      const mine = validateQuestion(q, cats);
      expect(mine.join(' | '), hint).toContain(hint.split(' ')[0]);
      expect(validateQuestions([q], 'curated').length, `Schema sollte „${hint}“ ebenfalls ablehnen`).toBeGreaterThan(0);
    }
    expect(validateQuestion(good, cats)).toEqual([]);
    expect(validateQuestions([good], 'curated')).toEqual([]);
    for (const junk of [null, 5, 'x', []]) expect(validateQuestion(junk, cats)).toEqual(['ist kein Objekt']);
  });
});

describe('Eigene Fragen', () => {
  const taken = new Set(['wm-01']);
  it('importiert gültige Fragen und ergänzt fehlende Verwaltungsfelder', () => {
    const minimal = { id: 'neu-1', type: 'tf', category: 'funk', difficulty: 1, question: 'Stimmt das wirklich?', answer: true, explanation: 'Ja, tut es.' };
    const r = parseImport(JSON.stringify({ questions: [good, minimal] }), taken, cats, '2026-11-16');
    expect(r.errors).toEqual([]);
    expect(r.added[1]).toMatchObject({ id: 'neu-1', tags: [], source: 'eigene', generated: false, lastVerified: '2026-11-16' });
    expect(parseImport(JSON.stringify([good]), taken, cats, '2026-11-16').added).toHaveLength(1);        // auch als nackte Liste
  });
  it('meldet jede abgelehnte Frage mit Begründung und übernimmt den Rest', () => {
    const r = parseImport(JSON.stringify({ questions: [good, { ...good, id: 'wm-01' }, { ...good, id: 'eigene-1' }, { ...good, id: 'x', difficulty: 9 }, { ...good, id: 'g', generated: true }, 'kein Objekt'] }), taken, cats, '2026-11-16');
    expect(r.added.map((q) => q.id)).toEqual(['eigene-1']);
    expect(r.errors).toHaveLength(5);
    expect(r.errors[0]).toMatch(/Frage 2 \(wm-01\): die id ist schon vergeben/);
    expect(r.errors[2]).toMatch(/difficulty/);
    expect(parseImport('kaputt', taken, cats, 'x').errors[0]).toMatch(/kein gültiges JSON/);
    expect(parseImport('{"foo":1}', taken, cats, 'x').errors[0]).toMatch(/Erwartet wird/);
  });
  it('speichert eigene Fragen, nimmt sie in den Pool auf und überspringt kaputte Einträge', () => {
    saveCustom([good, { ...good, id: 'kaputt', difficulty: 99 } as unknown as Question]);
    const mine = loadCustom(cats);
    expect(mine.map((q) => q.id)).toEqual(['eigene-1']);
    const before = loadQuestions().length;
    setExtraQuestions([...mine, { ...good, id: bundledQuestions()[0].id }]);       // id-Kollision mit einer ausgelieferten Frage
    expect(loadQuestions()).toHaveLength(before + 1);
    expect(filterPool(loadQuestions(), { level: 'stammgast', categories: ['pannen'], era: 'alle' }).some((q) => q.id === 'eigene-1')).toBe(true);
  });
});

describe('Meldung per GitHub-Issue', () => {
  it('füllt Titel und Text vor', () => {
    const url = new URL(reportUrl({ id: 'wm-01', question: 'Wer & was?' }, 'Lewis Hamilton'));
    expect(url.pathname).toMatch(/\/issues\/new$/);
    expect(url.searchParams.get('title')).toBe('Frage melden: wm-01');
    expect(url.searchParams.get('body')).toContain('Wer & was?');
    expect(url.searchParams.get('body')).toContain('Lewis Hamilton');
  });
});

describe('LLM-Vorschläge', () => {
  const existing = [{ ...good, id: 'gen-wm-2000', question: 'Wer wurde 2000 Weltmeister?', explanation: 'Trocken.', generated: true }, good];
  const ctx = { date: '2026-11-16', categories: cats, existing };
  const sug = (over = {}) => ({ type: 'mc', category: 'funk', difficulty: 2.4, question: 'Neue Spaßfrage?', options: ['A', 'B', 'C', 'D'], answerIndex: 2, answerBool: false, explanation: 'Weil es so ist.', ...over });
  it('werden zu gültigen, als ungeprüft markierten Fragen', () => {
    const out = toReviewQuestions({ suggestions: [sug(), sug({ type: 'tf', question: 'Stimmt diese Aussage?', options: [], answerIndex: 0, answerBool: true })], rephrased: [{ id: 'gen-wm-2000', explanation: 'Lockerer formuliert.' }] }, ctx);
    expect(out.map((q: Question) => q.id)).toEqual(['llm-2026-11-16-01', 'llm-2026-11-16-02', 'gen-wm-2000-llm']);
    expect(out[0]).toMatchObject({ difficulty: 2, answer: 2, generated: true, source: 'llm-vorschlag (ungeprüft)', tags: ['spass', 'review'] });
    expect(out[1]).toMatchObject({ type: 'tf', answer: true });
    expect(out[1].options).toBeUndefined();
    expect(out[2]).toMatchObject({ question: 'Wer wurde 2000 Weltmeister?', explanation: 'Lockerer formuliert.' });
    expect(validateQuestions(out, 'review')).toEqual([]);
  });
  it('verwerfen Dubletten, unbekannte Kategorien und formal Unbrauchbares', () => {
    const out = toReviewQuestions({
      suggestions: [sug({ question: 'Wer war es?' }), sug({ category: 'erfunden' }), sug({ answerIndex: 9 }), sug({ options: ['A', 'A'] }), sug({ explanation: ' ' }), sug({ type: 'order' }), sug({ difficulty: 99, question: 'Die bleibt?' })],
      rephrased: [{ id: 'gibts-nicht', explanation: 'x' }, { id: 'gen-wm-2000', explanation: 'Trocken.' }],
    }, ctx);
    expect(out.map((q: Question) => [q.id, q.difficulty])).toEqual([['llm-2026-11-16-01', 5]]);
  });
});
