// Spielstände: automatische Sicherung laufender Spiele, benannte Speicherstände, Export/Import als JSON.
import { describeClassic, isClassicState, type ClassicState } from '../core/classic';
import { describeJeopardy, isJeopardyState, type JeopardyState } from '../core/jeopardy';
import { load, save } from './store';

export type SaveKind = 'classic' | 'jeopardy';
export type SaveState = ClassicState | JeopardyState;

/** Erkennt die Art eines (geladenen oder importierten) Spielstands; null = unbrauchbar. */
export const kindOf = (state: unknown): SaveKind | null => (isJeopardyState(state) ? 'jeopardy' : isClassicState(state) ? 'classic' : null);
const describe = (state: SaveState): string => ('kind' in state ? describeJeopardy(state) : describeClassic(state));
export interface SaveEntry {
  id: string;
  name: string;
  /** true = automatische Sicherung des laufenden Spiels, false = vom Nutzer benannter Stand */
  auto: boolean;
  kind: SaveKind;
  updatedAt: string;
  summary: string;
  state: SaveState;
}

const KEY = 'saves';
const MAX_AUTO = 3;
const MAX_NAMED = 20;
export const FILE_FORMAT = 1;

export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readAll(): SaveEntry[] {
  const raw = load<unknown>(KEY, []);
  // Kaputte Einträge (z. B. nach einem Versionswechsel) werden übersprungen statt die App zu blockieren.
  return Array.isArray(raw) ? (raw as SaveEntry[]).filter((e) => e && typeof e.id === 'string' && kindOf(e.state) === e.kind) : [];
}
function writeAll(list: SaveEntry[]): void {
  const byDate = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  save(KEY, [...byDate.filter((e) => e.auto).slice(0, MAX_AUTO), ...byDate.filter((e) => !e.auto).slice(0, MAX_NAMED)]);
}

/** Alle Spielstände, neueste zuerst. */
export const listSaves = (): SaveEntry[] => readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const getSave = (id: string): SaveEntry | undefined => readAll().find((e) => e.id === id);
export const latestAutosave = (): SaveEntry | undefined => listSaves().find((e) => e.auto);
/** Export-Datei für einen Zustand, der (noch) nicht in der Liste steht. */
export const exportState = (state: SaveState, name = 'Exportierter Spielstand'): string =>
  exportSave({ id: 'export', name, auto: false, kind: kindOf(state) ?? 'classic', updatedAt: new Date().toISOString(), summary: '', state });

/** Laufendes Spiel sichern (ein Eintrag je Spiel-id; beendete Spiele werden entfernt). */
export function autosave(id: string, state: SaveState, now = new Date()): void {
  const rest = readAll().filter((e) => e.id !== id);
  if (state.phase === 'done' || state.phase === 'lobby') { writeAll(rest); return; }
  writeAll([...rest, { id, name: 'Automatisch gesichert', auto: true, kind: kindOf(state) ?? 'classic', updatedAt: now.toISOString(), summary: describe(state), state }]);
}

/** Momentaufnahme unter eigenem Namen ablegen – unabhängig vom laufenden Spiel. */
export function saveNamed(name: string, state: SaveState, now = new Date()): SaveEntry {
  const entry: SaveEntry = { id: newId(), name: name.trim().slice(0, 40) || 'Unbenannt', auto: false, kind: kindOf(state) ?? 'classic', updatedAt: now.toISOString(), summary: describe(state), state };
  writeAll([...readAll(), entry]);
  return entry;
}

export function deleteSave(id: string): void { writeAll(readAll().filter((e) => e.id !== id)); }

export function exportSave(e: SaveEntry): string {
  return JSON.stringify({ app: 'boxenfunk', format: FILE_FORMAT, kind: e.kind, name: e.name, savedAt: e.updatedAt, state: e.state }, null, 1);
}

/** Liest eine exportierte Datei ein und legt sie als benannten Stand ab. Wirft einen Fehler mit verständlichem Text. */
export function importSave(json: string, now = new Date()): SaveEntry {
  let data: { app?: unknown; format?: unknown; kind?: unknown; name?: unknown; state?: unknown };
  try { data = JSON.parse(json); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!data || typeof data !== 'object' || data.app !== 'boxenfunk') throw new Error('Das ist keine Boxenfunk-Spielstandsdatei.');
  if (data.format !== FILE_FORMAT) throw new Error('Dieser Spielstand stammt aus einer anderen Version und kann nicht geladen werden.');
  if (kindOf(data.state) === null || kindOf(data.state) !== data.kind) throw new Error('Der Spielstand in der Datei ist unvollständig oder beschädigt.');
  return saveNamed(typeof data.name === 'string' && !/^Automatisch/.test(data.name) ? data.name : 'Importierter Spielstand', data.state as SaveState, now);
}
