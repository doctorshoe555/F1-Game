import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error – reine Node-Skripte ohne Typdeklaration
import { createApi } from '../scripts/lib/jolpica.mjs';
// @ts-expect-error
import { buildAll, careerQuestions, championQuestions, currentQuestions, dedupe, gpName, keepVerifiedDates, raceQuestions, seeded, splitFiles, titleQuestions } from '../scripts/lib/templates.mjs';
// @ts-expect-error
import { collect } from '../scripts/update-questions.mjs';
// @ts-expect-error
import { validateQuestions } from '../scripts/validate.mjs';
import { loadQuestions } from '../src/core/questions';
import type { Question } from '../src/core/types';

const TODAY = '2026-11-16';
const drv = (id: string, name: string, team: string, points: number, wins = 0) => ({ id, name, team, points, wins });
const top = (year: number, champ: [string, string, string]) => ({
  year, complete: true,
  drivers: [drv(...champ, 400, 9), drv('b', 'Ben Zwei', 'Team B', 380), drv('c', 'Cem Drei', 'Team C', 300), drv('d', 'Dua Vier', 'Team D', 250), drv('e', 'Eli Fünf', 'Team E', 200)],
  constructors: ['Team A', 'Team B', 'Team C', 'Team D', 'Team E'].map((name, i) => ({ name, points: 700 - i * 100 })),
});
const data = {
  seasons: [
    ...[2000, 2001, 2003].map((y) => top(y, ['alt', 'Alma Alt', 'Team A'])),
    ...[2021, 2022, 2023, 2024].map((y) => top(y, ['max', 'Max Muster', 'Team A'])),
    top(2025, ['neu', 'Nora Neu', 'Team B']),
    { ...top(2026, ['max', 'Max Muster', 'Team A']), complete: false },
  ],
  races: {
    2025: [{ round: 1, gp: 'Australian Grand Prix', circuit: 'Albert Park Grand Prix Circuit', winner: { id: 'neu', name: 'Nora Neu' }, team: 'Team B' },
      { round: 2, gp: 'Emilia Romagna Grand Prix', circuit: 'Autodromo Enzo e Dino Ferrari', winner: { id: 'max', name: 'Max Muster' }, team: 'Team A' },
      { round: 3, gp: 'Monaco Grand Prix', circuit: 'Circuit de Monaco', winner: { id: 'b', name: 'Ben Zwei' }, team: 'Team B' },
      { round: 4, gp: 'British Grand Prix', circuit: 'Silverstone Circuit', winner: { id: 'neu', name: 'Nora Neu' }, team: 'Team B' }],
    2026: [{ round: 1, gp: 'Australian Grand Prix', circuit: 'Albert Park Grand Prix Circuit', winner: { id: 'max', name: 'Max Muster' }, team: 'Team A' }],
  },
  careers: [{ id: 'max', name: 'Max Muster', wins: 74, poles: 50 }, { id: 'alt', name: 'Alma Alt', wins: 91, poles: 68 }, { id: 'x1', name: 'Xaver Eins', wins: 25, poles: 3 },
    { id: 'x2', name: 'Yara Zwei', wins: 41, poles: 65 }, { id: 'x3', name: 'Zoe Drei', wins: 53, poles: 57 }, { id: 'x4', name: 'Willi Vier', wins: 31, poles: 20 },
    { id: 'x5', name: 'Vera Fünf', wins: 13, poles: 9 }, { id: 'x6', name: 'Udo Sechs', wins: 7, poles: 4 }, { id: 'x7', name: 'Tom Sieben', wins: 2, poles: 1 }],
  grid: { year: 2026, round: 20, drivers: [['max', 'Max Muster', 'Team A'], ['a2', 'Anna Zwei', 'Team A'], ['neu', 'Nora Neu', 'Team B'], ['b', 'Ben Zwei', 'Team B'], ['c', 'Cem Drei', 'Team C'], ['c2', 'Cleo Zwei', 'Team C'], ['d', 'Dua Vier', 'Team D'], ['solo', 'Sam Solo', 'Team E']].map(([id, name, team]) => ({ id, name, team })) },
  seasonEnd: '2026-12-06',
};
const byId = (qs: Question[], id: string): Question => { const q = qs.find((x) => x.id === id); if (!q) throw new Error(`${id} fehlt`); return q; };

describe('Templates', () => {
  it('fragt nach dem Weltmeister – mit den Nächstplatzierten derselben Saison als Distraktoren', () => {
    const qs: Question[] = championQuestions(data, TODAY);
    const q = byId(qs, 'gen-wm-2025');
    expect(q.options![q.answer as number]).toBe('Nora Neu');
    expect([...q.options!].sort()).toEqual(['Ben Zwei', 'Cem Drei', 'Dua Vier', 'Nora Neu']);
    expect(q).toMatchObject({ category: 'statistik', year: 2025, difficulty: 2, generated: true, lastVerified: TODAY });
    expect(byId(qs, 'gen-wm-2000').difficulty).toBe(3);
    expect(qs.some((x) => x.id === 'gen-wm-2026')).toBe(false);              // laufende Saison hat noch keinen Champion
    expect(byId(qs, 'gen-vize-2025').options![byId(qs, 'gen-vize-2025').answer as number]).toBe('Ben Zwei');
    expect(byId(qs, 'gen-kwm-2025').options![byId(qs, 'gen-kwm-2025').answer as number]).toBe('Team A');
  });
  it('zählt Titel und lässt Fragen zu aktiven Fahrern auslaufen', () => {
    const qs: Question[] = titleQuestions(data, TODAY);
    const max = byId(qs, 'gen-titel-max');
    expect(max.options![max.answer as number]).toBe('4');
    expect(max.validUntil).toBe('2026-12-06');
    expect(max.explanation).toBe('4 Titel: 2021, 2022, 2023, 2024.');
    const alt = byId(qs, 'gen-titel-alt');
    expect(alt.options![alt.answer as number]).toBe('3');
    expect(alt.validUntil).toBeUndefined();                                  // nicht mehr aktiv → Fakt bleibt
    expect(qs.some((x) => x.id === 'gen-titel-neu')).toBe(false);            // erst ab zwei Titeln
  });
  it('fragt nach Rennsiegern und nur dann nach der Strecke, wenn der Rennname sie nicht verrät', () => {
    const qs: Question[] = raceQuestions(data, TODAY);
    const sieg = byId(qs, 'gen-sieg-2025-02');
    expect(sieg.question).toBe('Wer gewann 2025 den Großen Preis von der Emilia-Romagna?');
    expect(sieg.options![sieg.answer as number]).toBe('Max Muster');
    expect(new Set(sieg.options).size).toBe(4);
    expect(byId(qs, 'gen-strecke-2025-02').options![byId(qs, 'gen-strecke-2025-02').answer as number]).toBe('Autodromo Enzo e Dino Ferrari');
    expect(qs.some((x) => x.id === 'gen-strecke-2025-03')).toBe(false);      // „Circuit de Monaco“ beim Monaco-GP wäre geschenkt
    expect(qs.some((x) => x.id === 'gen-sieg-2026-01')).toBe(true);
    expect(qs.some((x) => x.id.startsWith('gen-strecke-2026'))).toBe(false); // laufende Saison: keine Streckenfragen
    expect(gpName('Abu Dhabi Grand Prix')).toBe('Abu Dhabi');
    expect(gpName('Neuland Grand Prix')).toBe('Neuland');
  });
  it('baut Schätz- und Sortierfragen aus den Karrierezahlen', () => {
    const qs: Question[] = careerQuestions(data, TODAY);
    expect(byId(qs, 'gen-siege-max')).toMatchObject({ type: 'estimate', answer: 74, tolerance: 37, unit: 'Siege', validUntil: '2026-12-06' });
    expect(byId(qs, 'gen-siege-max').explanation).toContain('Stand: Saison 2026 nach 20 Rennen');
    expect(byId(qs, 'gen-poles-alt')).toMatchObject({ answer: 68, unit: 'Poles' });
    expect(byId(qs, 'gen-poles-alt').validUntil).toBeUndefined();
    expect(qs.some((x) => x.id === 'gen-siege-x7' || x.id === 'gen-poles-x1')).toBe(false);   // unter 5 lohnt keine Schätzfrage
    const order = qs.filter((x) => x.type === 'order');
    expect(order.length).toBeGreaterThan(0);
    for (const o of order) {
      const wins = o.items!.map((n) => data.careers.find((c) => c.name === n)!.wins);
      expect(wins).toEqual([...wins].sort((a, b) => b - a));
      expect(Math.min(...wins.slice(0, -1).map((w, i) => w - wins[i + 1]))).toBeGreaterThanOrEqual(3);
    }
  });
  it('gibt aktuellen Fakten immer ein Ablaufdatum', () => {
    const qs: Question[] = currentQuestions(data, TODAY);
    expect(byId(qs, 'gen-amtierend')).toMatchObject({ validUntil: '2026-12-06' });
    expect(byId(qs, 'gen-amtierend').options![byId(qs, 'gen-amtierend').answer as number]).toBe('Nora Neu');
    const team = byId(qs, 'gen-team-2026-max');
    expect(team.options![team.answer as number]).toBe('Team A');
    expect(team.validUntil).toBe('2027-03-31');
    const mate = byId(qs, 'gen-kollege-2026-a2');
    expect(mate.question).toBe('Wer ist in der Saison 2026 Teamkollege von Anna Zwei?');
    expect(mate.options![mate.answer as number]).toBe('Max Muster');
    expect(mate.options).not.toContain('Anna Zwei');
    expect(qs.some((x) => x.id.startsWith('gen-kollege') && /Sam Solo|Dua Vier/.test(x.question))).toBe(false);   // Teams ohne zweiten Fahrer
    expect(qs.every((x) => x.validUntil)).toBe(true);
  });
  it('liefert bei gleicher Eingabe exakt dieselben Fragen und besteht die Schema-Prüfung', () => {
    const a = buildAll(data, TODAY);
    expect(buildAll(JSON.parse(JSON.stringify(data)), TODAY)).toEqual(a);
    expect(validateQuestions(a, 'generated')).toEqual([]);
    expect(seeded('x')()).toBe(seeded('x')());
  });
});

describe('Nachbearbeitung', () => {
  const q = (id: string, question: string, extra = {}): Question => ({ id, type: 'tf', category: 'statistik', difficulty: 2, tags: [], question, answer: true, explanation: 'Darum.', source: 's', generated: true, lastVerified: TODAY, ...extra });
  it('entfernt doppelte ids und wortgleiche Fragen, auch gegenüber den kuratierten', () => {
    const out = dedupe([q('g1', 'Wer wurde 2010 Weltmeister?'), q('g1', 'Andere Frage?'), q('g2', 'wer wurde 2010  weltmeister'), q('g3', 'Schon kuratiert?'), q('cur', 'Neu?')], [q('cur', 'Schon kuratiert?')]);
    expect(out.map((x: Question) => x.id)).toEqual(['g1']);
  });
  it('lässt Sortierfragen mit gleichem Text, aber anderen Elementen zu', () => {
    const o = (id: string, items: string[]) => ({ ...q(id, 'Sortiere …'), type: 'order' as const, items });
    expect(dedupe([o('o1', ['a', 'b', 'c']), o('o2', ['a', 'b', 'd']), o('o3', ['a', 'b', 'c'])])).toHaveLength(2);
  });
  it('behält lastVerified, solange sich eine Frage nicht ändert', () => {
    const old = [q('a', 'Bleibt?', { lastVerified: '2026-01-01' }), q('b', 'Ändert sich?', { lastVerified: '2026-01-01' })];
    const fresh = [q('a', 'Bleibt?'), q('b', 'Ändert sich?', { explanation: 'Neuer Stand.' }), q('c', 'Neu?')];
    expect(keepVerifiedDates(fresh, old).map((x: Question) => x.lastVerified)).toEqual(['2026-01-01', TODAY, TODAY]);
  });
  it('verteilt stabil sortiert auf Dateien je Kategorie', () => {
    const files = splitFiles([q('z', 'Z?'), q('a', 'A?'), q('m', 'M?', { category: 'saison' })]);
    expect(Object.keys(files).sort()).toEqual(['saison.json', 'statistik.json']);
    expect(files['statistik.json'].map((x: Question) => x.id)).toEqual(['a', 'z']);
  });
});

describe('API-Zugriff', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
  it('cacht Antworten auf der Platte und fragt dann nicht erneut', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-'));
    let calls = 0;
    const api = createApi({ cacheDir: dir, minGapMs: 0, fetchImpl: async () => { calls++; return ok({ MRData: { total: '7' } }); } });
    expect(await api.get('a.json')).toEqual({ total: '7' });
    expect(await api.get('a.json')).toEqual({ total: '7' });
    expect(calls).toBe(1);
    expect(api.stats).toEqual({ network: 1, cached: 1 });
    expect(readdirSync(dir)).toHaveLength(1);
    await expect(createApi({ cacheDir: dir, offline: true }).get('b.json')).rejects.toThrow(/offline/);
  });
  it('wartet bei 429 und versucht es erneut, gibt bei dauerhaften Fehlern aber auf', async () => {
    let n = 0;
    const api = createApi({ minGapMs: 0, fetchImpl: async () => (++n === 1 ? { ok: false, status: 429, headers: new Headers({ 'retry-after': '0.01' }) } : ok({ MRData: { x: 1 } })) });
    expect(await api.get('a.json')).toEqual({ x: 1 });
    expect(n).toBe(2);
    await expect(createApi({ minGapMs: 0, fetchImpl: async () => ({ ok: false, status: 404, headers: new Headers() }) }).get('a.json')).rejects.toThrow(/404/);
  });
  it('bringt API-Antworten in das Modell der Templates', async () => {
    const D = (id: string, given: string, family: string) => ({ driverId: id, givenName: given, familyName: family });
    const standings = (rows: [string, string, string, string][]) => ({ StandingsTable: { StandingsLists: [{ DriverStandings: rows.map(([id, g, f, team], i) => ({ points: String(100 - i), wins: '1', Driver: D(id, g, f), Constructors: [{ name: team }] })) }] } });
    const res = (round: number, name: string, drivers: [string, string, string, string][]) => ({ round: String(round), raceName: name, date: '2026-03-01', Circuit: { circuitName: 'Kurs' }, Results: drivers.map(([id, g, f, team]) => ({ Driver: D(id, g, f), Constructor: { name: team } })) });
    const field: [string, string, string, string][] = [['a', 'Ada', 'Eins', 'Team A'], ['b', 'Ben', 'Zwei', 'Team B']];
    const routes: [RegExp, unknown][] = [
      [/^seasons/, { SeasonTable: { Seasons: [{ season: '2025' }, { season: '2026' }] } }],
      [/^2026\/races/, { RaceTable: { Races: [{ date: '2026-03-01' }, { date: '2026-12-06' }] } }],
      [/^2026\/last\/results/, { RaceTable: { Races: [res(1, 'Australian Grand Prix', field)] } }],
      [/driverstandings/, standings(field)],
      [/constructorstandings/, { StandingsTable: { StandingsLists: [{ ConstructorStandings: [{ points: '9', Constructor: { name: 'Team A' } }] }] } }],
      [/^\d+\/results\/1/, { RaceTable: { Races: [res(1, 'Australian Grand Prix', [field[0]])] } }],
      [/drivers\/hamilton\/results\/1/, { total: '106', RaceTable: { Races: [res(1, 'x', [['hamilton', 'Lewis', 'Hamilton', 'Ferrari']])] } }],
      [/drivers\/hamilton\/grid/, { total: '105', RaceTable: { Races: [] } }],
      [/drivers\//, { total: '0', RaceTable: { Races: [] } }],
    ];
    const api = createApi({ minGapMs: 0, fetchImpl: async (url: string) => ok({ MRData: routes.find(([re]) => re.test(url.split('/f1/')[1]))![1] }) });
    const got = await collect(api, () => {}, '2026-11-16');
    expect(got.seasons.map((s: { year: number; complete: boolean }) => [s.year, s.complete])).toEqual([[2025, true], [2026, false]]);
    expect(got.seasons[0].drivers[0]).toEqual({ id: 'a', name: 'Ada Eins', team: 'Team A', points: 100, wins: 1 });
    expect(Object.keys(got.races)).toEqual(['2025', '2026']);
    expect(got.grid).toMatchObject({ year: 2026, round: 1 });
    expect(got.careers).toEqual([{ id: 'hamilton', name: 'Lewis Hamilton', wins: 106, poles: 105 }]);
    expect(got.seasonEnd).toBe('2026-12-06');
    expect((await collect(api, () => {}, '2027-01-10')).seasonEnd).toBe('2027-03-31');   // Winterpause
  });
});

describe('ausgelieferte Generator-Fragen', () => {
  it('sind als generiert markiert und nennen ihre Quelle', () => {
    const gen = loadQuestions().filter((x) => x.id.startsWith('gen-'));
    expect(gen.length).toBeGreaterThan(100);
    expect(gen.every((x) => x.generated && /jolpi/.test(x.source))).toBe(true);
  });
  it('lassen Fragen aus review/ nie ins Spiel', () => {
    expect(loadQuestions().some((x) => /llm|review/.test(x.source))).toBe(false);
  });
});
