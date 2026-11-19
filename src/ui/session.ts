// Das gerade laufende Spiel: hält den Zustand, sichert automatisch und trägt beendete Spiele in die Historie ein.
import { resumeClassic, type ClassicState } from '../core/classic';
import { recordClassic } from '../storage/history';
import { autosave, listSaves, newId, type SaveEntry } from '../storage/saves';

export interface Session { id: string; state: ClassicState; lights: boolean; rank: number | null }
let cur: Session | null = null;

export const session = (): Session | null => cur;

export function startSession(state: ClassicState): void {
  cur = { id: newId(), state, lights: true, rank: null };
  autosave(cur.id, state);
}

/** Spielstand laden. Automatische Sicherungen laufen unter ihrer id weiter, benannte Stände als neues Spiel. */
export function loadSession(entry: SaveEntry): void {
  if (entry.kind !== 'classic' || 'kind' in entry.state) return;
  cur = { id: entry.auto ? entry.id : newId(), state: resumeClassic(entry.state, Date.now()), lights: false, rank: null };
  autosave(cur.id, cur.state);
}

/** Nach einem Neuladen der Seite: letzte automatische Sicherung wieder aufnehmen. */
export function restoreSession(): Session | null {
  if (!cur) { const auto = listSaves().find((e) => e.auto && e.kind === 'classic'); if (auto) loadSession(auto); }
  return cur;
}

export function updateSession(state: ClassicState): void {
  if (!cur) return;
  cur.state = state;
  autosave(cur.id, state);
  if (state.phase === 'done') { const r = recordClassic(cur.id, state); if (r.added) cur.rank = r.rank; }
}
