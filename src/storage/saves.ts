// Spielstände: automatische Sicherung laufender Spiele, benannte Speicherstände, Export/Import als JSON.
import { describeClassic, isClassicState, type ClassicState } from '../core/classic';
import { load, save } from './store';

export type SaveKind = 'classic';
export interface SaveEntry {
  id: string;
  name: string;
  /** true = automatische Sicherung des laufenden Spiels, false = vom Nutzer benannter Stand */
  auto: boolean;
  kind: SaveKind;
  updatedAt: string;
  summary: string;
  state: ClassicState;
}

const KEY = 'saves';
const MAX_AUTO = 3;
const MAX_NAMED = 20;
export const FILE_FORMAT = 1;

export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readAll(): SaveEntry[] {
  const raw = load<unknown>(KEY, []);
  // Kaputte Einträge (z. B. nach einem Versionswechsel) werden übersprungen statt die App zu blockieren.
  return Array.isArray(raw) ? (raw as SaveEntry[]).filter((e) => e && typeof e.id === 'string' && e.kind === 'classic' && isClassicState(e.state)) : [];
}
function writeAll(list: SaveEntry[]): void {
  const byDate = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  save(KEY, [...byDate.filter((e) => e.auto).slice(0, MAX_AUTO), ...byDate.filter((e) => !e.auto).slice(0, MAX_NAMED)]);
}

/** Alle Spielstände, neueste zuerst. */
export const listSaves = (): SaveEntry[] => readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const getSave = (id: string): SaveEntry | undefined => readAll().find((e) => e.id === id);
export const latestAutosave = (): SaveEntry | undefined => listSaves().find((e) => e.auto);

/** Laufendes Spiel sichern (ein Eintrag je Spiel-id; beendete Spiele werden entfernt). */
export function autosave(id: string, state: ClassicState, now = new Date()): void {
  const rest = readAll().filter((e) => e.id !== id);
  if (state.phase === 'done') { writeAll(rest); return; }
  writeAll([...rest, { id, name: 'Automatisch gesichert', auto: true, kind: 'classic', updatedAt: now.toISOString(), summary: describeClassic(state), state }]);
}

/** Momentaufnahme unter eigenem Namen ablegen – unabhängig vom laufenden Spiel. */
export function saveNamed(name: string, state: ClassicState, now = new Date()): SaveEntry {
  const entry: SaveEntry = { id: newId(), name: name.trim().slice(0, 40) || 'Unbenannt', auto: false, kind: 'classic', updatedAt: now.toISOString(), summary: describeClassic(state), state };
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
  if (data.kind !== 'classic' || !isClassicState(data.state)) throw new Error('Der Spielstand in der Datei ist unvollständig oder beschädigt.');
  return saveNamed(typeof data.name === 'string' && !/^Automatisch/.test(data.name) ? data.name : 'Importierter Spielstand', data.state, now);
}
