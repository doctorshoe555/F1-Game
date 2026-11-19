// Prüfung einzelner Fragen im Browser (für den Import eigener Fragen) – spiegelt data/schema/question.schema.json.
import type { Question } from './types';

const TYPES = ['mc', 'tf', 'estimate', 'image', 'order'];
const ALLOWED = new Set(['id', 'type', 'category', 'difficulty', 'year', 'tags', 'question', 'image', 'options', 'items', 'answer', 'accept', 'tolerance', 'unit', 'explanation', 'source', 'generated', 'validFrom', 'validUntil', 'lastVerified']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, min = 1): v is string => typeof v === 'string' && v.trim().length >= min;
const strList = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every((x) => str(x)) && new Set(v).size === v.length;

/** Liefert eine Liste verständlicher Fehler; leer = gültig. */
export function validateQuestion(input: unknown, categories: readonly string[]): string[] {
  const q = input as Partial<Question> & Record<string, unknown>;
  if (typeof q !== 'object' || q === null || Array.isArray(q)) return ['ist kein Objekt'];
  const e: string[] = [];
  for (const k of Object.keys(q)) if (!ALLOWED.has(k)) e.push(`unbekanntes Feld „${k}“`);
  if (!str(q.id) || !/^[a-z0-9][a-z0-9-]*$/.test(q.id)) e.push('id fehlt oder enthält andere Zeichen als a–z, 0–9 und Bindestrich');
  if (!TYPES.includes(q.type as string)) { e.push(`type muss einer von ${TYPES.join(', ')} sein`); return e; }
  if (!str(q.category) || !categories.includes(q.category)) e.push(`unbekannte Kategorie „${String(q.category)}“`);
  if (!Number.isInteger(q.difficulty) || (q.difficulty as number) < 1 || (q.difficulty as number) > 5) e.push('difficulty muss eine ganze Zahl von 1 bis 5 sein');
  if (q.year !== undefined && (!Number.isInteger(q.year) || q.year < 1900 || q.year > 2100)) e.push('year ist kein plausibles Jahr');
  if (!Array.isArray(q.tags) || !q.tags.every((t) => typeof t === 'string' && /^[a-z0-9-]+$/.test(t))) e.push('tags muss eine Liste aus Kleinbuchstaben-Wörtern sein (darf leer sein)');
  if (!str(q.question, 5)) e.push('question fehlt');
  if (!str(q.explanation, 5)) e.push('explanation fehlt');
  if (!str(q.source)) e.push('source fehlt (z. B. „eigene“)');
  if (typeof q.generated !== 'boolean') e.push('generated muss true oder false sein');
  for (const k of ['validFrom', 'validUntil', 'lastVerified'] as const) if (q[k] !== undefined && !(typeof q[k] === 'string' && DATE.test(q[k]))) e.push(`${k} muss ein Datum der Form JJJJ-MM-TT sein`);
  if (q.lastVerified === undefined) e.push('lastVerified fehlt');
  if (q.accept !== undefined && !(Array.isArray(q.accept) && q.accept.every((x) => str(x)))) e.push('accept muss eine Liste von Texten sein');
  if (q.type === 'mc' || q.type === 'image') {
    if (!strList(q.options, 2, 6)) e.push('options: 2 bis 6 unterschiedliche Texte nötig');
    else if (!Number.isInteger(q.answer) || (q.answer as number) < 0 || (q.answer as number) >= q.options.length) e.push('answer muss der Index der richtigen Option sein (ab 0 gezählt)');
  }
  if (q.type === 'image') {
    const img = q.image as Record<string, unknown> | undefined;
    if (!img || !['url', 'license', 'author', 'source'].every((k) => str(img[k]))) e.push('image braucht url, license, author und source');
  }
  if (q.type === 'tf' && typeof q.answer !== 'boolean') e.push('answer muss true oder false sein');
  if (q.type === 'estimate') {
    if (typeof q.answer !== 'number' || !Number.isFinite(q.answer)) e.push('answer muss eine Zahl sein');
    if (typeof q.tolerance !== 'number' || !(q.tolerance > 0)) e.push('tolerance (größer als 0) fehlt');
  }
  if (q.type === 'order' && !strList(q.items, 3, 6)) e.push('items: 3 bis 6 unterschiedliche Texte in der richtigen Reihenfolge nötig');
  return e;
}
