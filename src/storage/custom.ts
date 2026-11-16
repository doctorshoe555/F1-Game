// Eigene Fragen: per JSON importiert, nur auf diesem Gerät gespeichert, im Spiel mit dabei.
import type { Question } from '../core/types';
import { validateQuestion } from '../core/validate';
import { load, save } from './store';

const KEY = 'custom.questions';
export const MAX_CUSTOM = 500;

export const loadCustom = (categories: readonly string[]): Question[] => {
  const raw = load<unknown>(KEY, []);
  return Array.isArray(raw) ? (raw as Question[]).filter((q) => validateQuestion(q, categories).length === 0) : [];
};
export const saveCustom = (list: Question[]): void => save(KEY, list.slice(0, MAX_CUSTOM));

export interface ImportReport { added: Question[]; errors: string[] }
/**
 * Liest eine JSON-Datei mit Fragen ({ "questions": [...] } oder direkt eine Liste).
 * Gültige Fragen kommen in `added`, alles andere mit Begründung in `errors`. ids dürfen mit keiner vorhandenen Frage kollidieren.
 */
export function parseImport(json: string, takenIds: ReadonlySet<string>, categories: readonly string[], today: string): ImportReport {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return { added: [], errors: ['Die Datei ist kein gültiges JSON.'] }; }
  const list = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return { added: [], errors: ['Erwartet wird { "questions": [ … ] } oder direkt eine Liste von Fragen.'] };
  const added: Question[] = [];
  const errors: string[] = [];
  const ids = new Set(takenIds);
  list.forEach((raw, i) => {
    // Bequemlichkeit: fehlende Verwaltungsfelder ergänzen, damit eine minimale Frage genügt
    const q = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { tags: [], source: 'eigene', generated: false, lastVerified: today, ...(raw as object) } : raw;
    const label = `Frage ${i + 1}${(q as { id?: unknown })?.id ? ` (${String((q as { id: unknown }).id)})` : ''}`;
    const problems = validateQuestion(q, categories);
    if (problems.length) { errors.push(`${label}: ${problems.join('; ')}`); return; }
    const ok = q as Question;
    if (ids.has(ok.id)) { errors.push(`${label}: die id ist schon vergeben`); return; }
    if (ok.generated) { errors.push(`${label}: generated muss bei eigenen Fragen false sein`); return; }
    ids.add(ok.id); added.push(ok);
  });
  return { added, errors };
}
