import { beforeEach, describe, expect, it } from 'vitest';
import { answerClassic, createClassic, nextClassic, readyClassic, type ClassicSettings, type ClassicState } from '../src/core/classic';
import type { Question } from '../src/core/types';
import { highscoresFor } from '../src/storage/highscores';
import { listHistory, playerStats, recordClassic } from '../src/storage/history';
import { autosave, deleteSave, exportSave, getSave, importSave, latestAutosave, listSaves, saveNamed } from '../src/storage/saves';
import { clearMemory, load, save, storageAvailable } from '../src/storage/store';

// Unter Node gibt es kein localStorage – die Tests laufen damit genau über den Fallback im Arbeitsspeicher.
const tf = (id: string): Question => ({ id, type: 'tf', category: 'a', difficulty: 2, tags: [], question: 'Frage?', answer: true, explanation: 'Darum.', source: 'test', generated: false, lastVerified: '2026-01-01' });
const settings: ClassicSettings = { length: 2, level: 'stammgast', categories: null, era: 'alle', seconds: 20 };
const yes = { kind: 'bool', value: true } as const;
const no = { kind: 'bool', value: false } as const;
const T0 = 1_000_000;
const running = (): ClassicState => createClassic(settings, [tf('1'), tf('2')], [{ name: 'Ada', color: 'rosso' }], T0);
function finished(names: string[], answers: (typeof yes | typeof no)[]): ClassicState {
  let s = createClassic({ ...settings, length: answers.length }, answers.map((_, i) => tf(String(i))), names.map((name) => ({ name, color: 'rosso' })), T0);
  for (const a of answers) { s = readyClassic(s, T0); s = nextClassic(answerClassic(s, a, T0 + 2_000), T0); }
  return s;
}
const at = (n: number): Date => new Date(Date.UTC(2026, 0, 1, 0, n));

beforeEach(() => clearMemory());

describe('Speicher-Fallback', () => {
  it('funktioniert ohne localStorage im Arbeitsspeicher', () => {
    expect(storageAvailable()).toBe(false);
    expect(load('x', 'leer')).toBe('leer');
    save('x', { a: 1 });
    expect(load('x', null)).toEqual({ a: 1 });
  });
});

describe('Spielstände', () => {
  it('sichert ein laufendes Spiel unter seiner id und überschreibt dabei den alten Stand', () => {
    const s = running();
    autosave('g1', s, at(1));
    autosave('g1', answerClassic(s, yes, T0), at(2));
    expect(listSaves()).toHaveLength(1);
    expect(latestAutosave()).toMatchObject({ id: 'g1', auto: true, summary: 'Solo (Ada) · Frage 1/2' });
    expect(getSave('g1')?.state.phase).toBe('reveal');
  });
  it('entfernt die automatische Sicherung, sobald das Spiel beendet ist', () => {
    autosave('g1', running(), at(1));
    autosave('g1', finished(['Ada'], [yes, yes]), at(2));
    expect(listSaves()).toEqual([]);
  });
  it('behält höchstens drei automatische Sicherungen, benannte Stände bleiben', () => {
    saveNamed('Wohnzimmer-GP', running(), at(0));
    for (let i = 1; i <= 5; i++) autosave(`g${i}`, running(), at(i));
    const list = listSaves();
    expect(list.filter((e) => e.auto).map((e) => e.id)).toEqual(['g5', 'g4', 'g3']);
    expect(list.filter((e) => !e.auto).map((e) => e.name)).toEqual(['Wohnzimmer-GP']);
  });
  it('legt benannte Stände als unabhängige Momentaufnahme an und löscht sie wieder', () => {
    const s = running();
    const named = saveNamed('  Halbzeit  ', s, at(1));
    autosave('g1', answerClassic(s, yes, T0), at(2));
    expect(named.name).toBe('Halbzeit');
    expect(getSave(named.id)?.state.phase).toBe('question');
    expect(saveNamed('', s).name).toBe('Unbenannt');
    deleteSave(named.id);
    expect(getSave(named.id)).toBeUndefined();
  });
  it('exportiert und importiert verlustfrei', () => {
    const s = answerClassic(running(), yes, T0 + 3_000);
    const file = exportSave(saveNamed('Für Oma', s, at(1)));
    clearMemory();
    const back = importSave(file, at(9));
    expect(back).toMatchObject({ name: 'Für Oma', auto: false });
    expect(back.state).toEqual(s);
    expect(listSaves()).toHaveLength(1);
  });
  it('weist fremde und beschädigte Dateien mit klarer Meldung zurück', () => {
    const ok = JSON.parse(exportSave(saveNamed('x', running())));
    expect(() => importSave('kein json')).toThrow(/kein gültiges JSON/);
    expect(() => importSave('{"foo":1}')).toThrow(/keine Boxenfunk/);
    expect(() => importSave('null')).toThrow(/keine Boxenfunk/);
    expect(() => importSave(JSON.stringify({ ...ok, format: 99 }))).toThrow(/anderen Version/);
    expect(() => importSave(JSON.stringify({ ...ok, state: { ...ok.state, deck: 'weg' } }))).toThrow(/beschädigt/);
  });
  it('überspringt kaputte Einträge im Speicher, statt alles zu verlieren', () => {
    const good = saveNamed('gut', running());
    save('saves', [{ id: 'kaputt', kind: 'classic', state: { v: 1 } }, 'quatsch', null, getSave(good.id)]);
    expect(listSaves().map((e) => e.name)).toEqual(['gut']);
    save('saves', 'gar keine Liste');
    expect(listSaves()).toEqual([]);
  });
});

describe('Historie', () => {
  it('trägt ein beendetes Solo-Spiel genau einmal ein – samt Bestenliste', () => {
    const s = finished(['Ada'], [yes, no]);
    expect(recordClassic('g1', s, '2026-01-01T10:00:00.000Z')).toEqual({ added: true, rank: 1 });
    expect(recordClassic('g1', s)).toEqual({ added: false, rank: 0 });
    expect(listHistory()).toHaveLength(1);
    expect(listHistory()[0]).toMatchObject({ mode: 'solo', length: 2, players: [{ name: 'Ada', score: 950, correct: 1, place: 1 }], fastestLap: { name: 'Ada', timeMs: 2000 } });
    expect(highscoresFor(2).map((h) => [h.name, h.score])).toEqual([['Ada', 950]]);
  });
  it('trägt laufende Spiele nicht ein', () => {
    expect(recordClassic('g1', running()).added).toBe(false);
    expect(listHistory()).toEqual([]);
  });
  it('führt Mehrspieler-Rennen ohne Bestenlisten-Eintrag und zählt Siege je Name', () => {
    recordClassic('a', finished(['Ada', 'Ben'], [yes, no, yes, no]), '2026-01-01T10:00:00.000Z');
    recordClassic('b', finished(['ada', 'Ben'], [no, yes]), '2026-01-02T10:00:00.000Z');
    recordClassic('c', finished(['Ada'], [yes, yes]), '2026-01-03T10:00:00.000Z');
    expect(highscoresFor(4)).toEqual([]);
    const stats = playerStats();
    expect(stats.map((s) => s.name)).toEqual(['Ada', 'Ben']);
    expect(stats[0]).toMatchObject({ games: 3, soloGames: 1, partyGames: 2, wins: 1, best: 1900, correct: 4, answered: 5, fastestMs: 2000 });
    expect(stats[1]).toMatchObject({ games: 2, wins: 1, correct: 1, answered: 3 });
  });
  it('behält höchstens 100 Spiele, das neueste zuerst', () => {
    const s = finished(['Ada'], [yes]);
    for (let i = 0; i < 105; i++) recordClassic(`g${i}`, s, at(i).toISOString());
    expect(listHistory()).toHaveLength(100);
    expect(listHistory()[0].id).toBe('g104');
  });
});
