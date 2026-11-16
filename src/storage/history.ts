// Spielhistorie und Statistik je Spielername.
import { ranking, type ClassicState } from '../core/classic';
import type { RaceState } from '../core/race';
import { rankPlayers } from '../core/roster';
import type { LevelId } from '../core/types';
import { addHighscore } from './highscores';
import { load, save } from './store';

export interface HistoryPlayer { name: string; color: string; score: number; correct: number; answered: number; place: number }
export interface HistoryEntry {
  id: string;
  date: string;
  mode: 'solo' | 'party';
  level: LevelId;
  length: number;
  players: HistoryPlayer[];
  fastestLap: { name: string; timeMs: number } | null;
}

const KEY = 'history';
const MAX = 100;

export const listHistory = (): HistoryEntry[] => {
  const raw = load<unknown>(KEY, []);
  return Array.isArray(raw) ? (raw as HistoryEntry[]).filter((e) => e && Array.isArray(e.players)) : [];
};

/**
 * Trägt ein beendetes Spiel genau einmal ein (erneute Aufrufe mit derselben id ändern nichts).
 * Solo-Runden landen zusätzlich in der Bestenliste; zurück kommt dort der Platz (0 = nicht in den Top 20).
 */
export function recordClassic(id: string, s: ClassicState, date = new Date().toISOString()): { added: boolean; rank: number } {
  const list = listHistory();
  if (s.phase !== 'done' || list.some((e) => e.id === id)) return { added: false, rank: 0 };
  const solo = s.players.length === 1;
  const entry: HistoryEntry = {
    id, date, mode: solo ? 'solo' : 'party', level: s.settings.level, length: s.deck.length,
    players: ranking(s).map((r) => ({ name: r.player.name, color: r.player.color, score: r.player.score, correct: r.player.correct, answered: r.player.answered, place: r.place })),
    fastestLap: s.fastest ? { name: s.players[s.fastest.player].name, timeMs: s.fastest.timeMs } : null,
  };
  save(KEY, [entry, ...list].slice(0, MAX));
  const me = s.players[0];
  const rank = solo ? addHighscore({ name: me.name, score: me.score, correct: me.correct, length: s.deck.length, level: s.settings.level, date }) : 0;
  return { added: true, rank };
}

/** Trägt ein beendetes Quiz-Rennen (Party per Handy) genau einmal ein. */
export function recordRace(id: string, s: RaceState, date = new Date().toISOString()): boolean {
  const list = listHistory();
  if (s.phase !== 'done' || !s.players.length || list.some((e) => e.id === id)) return false;
  const best = s.best && s.players.find((p) => p.id === s.best!.id);
  const entry: HistoryEntry = {
    id, date, mode: 'party', level: s.settings.level, length: s.deck.length,
    players: rankPlayers(s.players).map((r) => ({ name: r.player.name, color: r.player.color, score: r.player.score, correct: r.player.correct, answered: s.deck.length, place: r.place })),
    fastestLap: best ? { name: best.name, timeMs: s.best!.timeMs } : null,
  };
  save(KEY, [entry, ...list].slice(0, MAX));
  return true;
}

export interface PlayerStats { name: string; color: string; games: number; soloGames: number; partyGames: number; wins: number; best: number; correct: number; answered: number; fastestMs: number | null }

/** Statistik je Spielername (Groß-/Kleinschreibung egal), meiste Spiele zuerst. */
export function playerStats(list = listHistory()): PlayerStats[] {
  const map = new Map<string, PlayerStats>();
  for (const e of [...list].reverse()) {
    for (const p of e.players) {
      const key = p.name.trim().toLowerCase();
      const st = map.get(key) ?? { name: p.name, color: p.color, games: 0, soloGames: 0, partyGames: 0, wins: 0, best: 0, correct: 0, answered: 0, fastestMs: null };
      st.name = p.name; st.color = p.color; st.games++;
      if (e.mode === 'solo') st.soloGames++; else { st.partyGames++; if (p.place === 1) st.wins++; }
      st.best = Math.max(st.best, p.score); st.correct += p.correct; st.answered += p.answered;
      if (e.fastestLap && e.fastestLap.name.trim().toLowerCase() === key) st.fastestMs = Math.min(st.fastestMs ?? Infinity, e.fastestLap.timeMs);
      map.set(key, st);
    }
  }
  return [...map.values()].sort((a, b) => b.games - a.games || b.best - a.best);
}
