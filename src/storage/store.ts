// Sicherer Speicherzugriff: localStorage mit Fallback im Arbeitsspeicher,
// falls der Browser den Speicher sperrt (privater Modus, volle Quota …).
const PREFIX = 'boxenfunk.';
const memory = new Map<string, string>();
let usable: boolean | null = null;

function ls(): Storage | null {
  if (usable === false) return null;
  try {
    const s = globalThis.localStorage;
    if (usable === null) { s.setItem(PREFIX + '_probe', '1'); s.removeItem(PREFIX + '_probe'); usable = true; }
    return s;
  } catch { usable = false; return null; }
}

/** false = es wird nur im Arbeitsspeicher gesichert (geht beim Schließen verloren). */
export const storageAvailable = (): boolean => ls() !== null;

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(PREFIX + key) ?? memory.get(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}
export function save(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try { ls()?.setItem(PREFIX + key, raw); } catch { /* bleibt im Arbeitsspeicher */ }
}
export function remove(key: string): void {
  memory.delete(key);
  try { ls()?.removeItem(PREFIX + key); } catch { /* egal */ }
}

/** Nur für Tests: Arbeitsspeicher-Fallback leeren. */
export function clearMemory(): void { memory.clear(); }
