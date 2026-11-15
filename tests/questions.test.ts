import { describe, expect, it } from 'vitest';
import { CATEGORIES, deal, filterPool, isValidOn, loadQuestions, pickQuestions } from '../src/core/questions';
import type { Question } from '../src/core/types';

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id, type: 'tf', category: 'a', difficulty: 3, tags: [], question: 'Frage?', answer: true, explanation: 'Darum.',
  source: 'test', generated: false, lastVerified: '2026-01-01', ...over,
});
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('filterPool', () => {
  const pool = [q('alt', { year: 1990 }), q('neu', { year: 2020 }), q('zeitlos'), q('leicht', { difficulty: 1 }), q('hart', { difficulty: 5 }), q('b', { category: 'b' })];
  const ids = (f: Parameters<typeof filterPool>[1]) => filterPool(pool, f, '2026-06-01').map((x) => x.id);
  it('filtert nach Zeitraum, lässt zeitlose Fragen aber drin', () => {
    expect(ids({ level: 'bwoah', categories: null, era: 'ab2000' })).toEqual(['neu', 'zeitlos', 'leicht', 'hart', 'b']);
    expect(ids({ level: 'bwoah', categories: null, era: 'vor2000' })).not.toContain('neu');
  });
  it('filtert nach Kategorie', () => {
    expect(ids({ level: 'bwoah', categories: ['b'], era: 'alle' })).toEqual(['b']);
    expect(ids({ level: 'bwoah', categories: [], era: 'alle' })).toEqual([]);
  });
  it('schließt über die Stufe unpassende Schwierigkeiten aus', () => {
    expect(ids({ level: 'sonntagsfahrer', categories: null, era: 'alle' })).not.toContain('hart');
    expect(ids({ level: 'profi', categories: null, era: 'alle' })).not.toContain('leicht');
  });
  it('beachtet validFrom/validUntil', () => {
    expect(isValidOn(q('x', { validUntil: '2026-05-31' }), '2026-06-01')).toBe(false);
    expect(isValidOn(q('x', { validFrom: '2026-07-01' }), '2026-06-01')).toBe(false);
    expect(isValidOn(q('x', { validFrom: '2026-01-01', validUntil: '2026-06-01' }), '2026-06-01')).toBe(true);
  });
});

describe('pickQuestions', () => {
  it('zieht ohne Dubletten und höchstens so viele, wie da sind', () => {
    const pool = Array.from({ length: 8 }, (_, i) => q(`q${i}`));
    const got = pickQuestions(pool, 20, 'stammgast');
    expect(got).toHaveLength(8);
    expect(new Set(got.map((x) => x.id)).size).toBe(8);
  });
  it('bevorzugt im Bwoah-Modus Spaßfragen und meidet kürzlich gespielte', () => {
    const pool = [...Array.from({ length: 30 }, (_, i) => q(`ernst${i}`)), ...Array.from({ length: 30 }, (_, i) => q(`spass${i}`, { tags: ['spass'] }))];
    let fun = 0, seenHits = 0;
    const seen = new Set(pool.slice(0, 15).map((x) => x.id));
    for (let i = 0; i < 200; i++) {
      const got = pickQuestions(pool, 10, 'bwoah');
      fun += got.filter((x) => x.tags.includes('spass')).length;
      seenHits += pickQuestions(pool, 10, 'stammgast', seen).filter((x) => seen.has(x.id)).length;
    }
    expect(fun / 2000).toBeGreaterThan(0.7);
    expect(seenHits / 2000).toBeLessThan(0.1);
  });
  it('lässt eine große Kategorie nicht alles dominieren', () => {
    const pool = [...Array.from({ length: 80 }, (_, i) => q(`gross${i}`, { category: 'gross' })), ...Array.from({ length: 10 }, (_, i) => q(`klein${i}`, { category: 'klein' }))];
    let klein = 0;
    for (let i = 0; i < 300; i++) klein += pickQuestions(pool, 5, 'stammgast').filter((x) => x.category === 'klein').length;
    expect(klein / 1500).toBeGreaterThan(0.2); // rein proportional wären es 11 %
  });
});

describe('deal', () => {
  it('mischt Optionen und merkt sich die richtige Position', () => {
    const d = deal(q('m', { type: 'mc', options: ['richtig', 'f1', 'f2', 'f3'], answer: 0 }), seq(0.1, 0.9, 0.5));
    expect([...d.shown].sort()).toEqual(['f1', 'f2', 'f3', 'richtig']);
    expect(d.shown[d.correctIndex]).toBe('richtig');
  });
  it('teilt Sortierfragen nie schon gelöst aus', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(deal(q('o', { type: 'order', items })).shown).not.toEqual(items);
    expect(deal(q('o', { type: 'order', items }), () => 0.999).shown).not.toEqual(items);
  });
});

describe('ausgelieferter Fragenpool', () => {
  const all = loadQuestions();
  it('enthält mindestens 150 kuratierte Fragen', () => {
    expect(all.filter((x) => !x.generated).length).toBeGreaterThanOrEqual(150);
  });
  it('reicht in jeder Stufe für eine 30er-Runde', () => {
    for (const level of ['sonntagsfahrer', 'stammgast', 'profi', 'bwoah'] as const) {
      expect(filterPool(all, { level, categories: null, era: 'alle' }).length).toBeGreaterThanOrEqual(30);
    }
  });
  it('hat rund 30 % Spaßfragen unter den kuratierten', () => {
    const curated = all.filter((x) => !x.generated);
    const share = curated.filter((x) => x.tags.includes('spass')).length / curated.length;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.4);
  });
  it('nutzt nur bekannte Kategorien', () => {
    const known = new Set(CATEGORIES.map((c) => c.id));
    expect(all.filter((x) => !known.has(x.category))).toEqual([]);
  });
});
