import type { LevelId } from '../core/types';
import { load, save } from './store';

export interface Highscore { name: string; score: number; correct: number; length: number; level: LevelId; date: string }

const KEY = 'highscores';
const PER_LENGTH = 20;

export const allHighscores = (): Highscore[] => load<Highscore[]>(KEY, []);

/** Bestenliste für eine Rundenlänge, beste zuerst. */
export const highscoresFor = (length: number, list = allHighscores()): Highscore[] =>
  list.filter((h) => h.length === length).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));

/** Fügt ein Ergebnis ein und liefert den erreichten Platz (1-basiert) oder 0, falls nicht in den Top 20. */
export function addHighscore(entry: Highscore): number {
  const list = allHighscores();
  const same = highscoresFor(entry.length, [...list, entry]).slice(0, PER_LENGTH);
  save(KEY, [...list.filter((h) => h.length !== entry.length), ...same]);
  return same.indexOf(entry) + 1;
}

// Kürzlich gespielte Fragen – damit nicht ständig dieselben kommen.
const SEEN = 'seen';
export const seenIds = (): Set<string> => new Set(load<string[]>(SEEN, []));
export function markSeen(ids: string[], keep = 150): void {
  const merged = [...load<string[]>(SEEN, []).filter((id) => !ids.includes(id)), ...ids];
  save(SEEN, merged.slice(-keep));
}
