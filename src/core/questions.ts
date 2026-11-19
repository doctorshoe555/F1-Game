// Fragenpool: filtern, gewichten, ziehen, austeilen. Reine Funktionen – ohne DOM, testbar.
import type { Category, Dealt, EraId, LevelId, PoolFilter, Question } from './types';

export interface Level { id: LevelId; title: string; hint: string; weights: Record<number, number>; funBoost: number }

/** Die Stufen sind Gewichtungen auf `difficulty` (0 = ausgeschlossen). */
export const LEVELS: Level[] = [
  { id: 'sonntagsfahrer', title: 'Sonntagsfahrer', hint: 'leicht', weights: { 1: 5, 2: 4, 3: 1, 4: 0, 5: 0 }, funBoost: 1 },
  { id: 'stammgast', title: 'Stammgast', hint: 'mittel', weights: { 1: 1, 2: 3, 3: 5, 4: 2, 5: 0.5 }, funBoost: 1 },
  { id: 'profi', title: 'Boxenfunk-Profi', hint: 'schwer', weights: { 1: 0, 2: 0.5, 3: 2, 4: 5, 5: 5 }, funBoost: 1 },
  { id: 'bwoah', title: 'Bwoah-Modus', hint: 'gemischt, viele Spaßfragen', weights: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, funBoost: 5 },
];
export const levelById = (id: LevelId): Level => LEVELS.find((l) => l.id === id) ?? LEVELS[1];

export const ERAS: { id: EraId; title: string; test: (year: number) => boolean }[] = [
  { id: 'alle', title: 'Alle Jahre', test: () => true },
  { id: 'ab2014', title: 'Ab 2014 (Hybrid-Ära)', test: (y) => y >= 2014 },
  { id: 'ab2000', title: 'Ab 2000', test: (y) => y >= 2000 },
  { id: 'vor2000', title: 'Vor 2000', test: (y) => y < 2000 },
];

export const isFun = (q: Question): boolean => q.tags.includes('spass');

/** Gilt die Frage am Stichtag (YYYY-MM-DD)? */
export function isValidOn(q: Question, today: string): boolean {
  return (!q.validFrom || q.validFrom <= today) && (!q.validUntil || q.validUntil >= today);
}
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Fragen, die zu Kategorie, Zeitraum, Stufe und Stichtag passen. Zeitlose Fragen (ohne year) bleiben immer drin. */
export function filterPool(all: Question[], f: PoolFilter, today = todayIso()): Question[] {
  const era = ERAS.find((e) => e.id === f.era) ?? ERAS[0];
  const level = levelById(f.level);
  return all.filter((q) => isValidOn(q, today)
    && (!f.categories || f.categories.includes(q.category))
    && (q.year === undefined || era.test(q.year))
    && (level.weights[q.difficulty] ?? 0) > 0);
}

export function weightOf(q: Question, level: Level, seen: ReadonlySet<string>): number {
  let w = level.weights[q.difficulty] ?? 0;
  if (isFun(q)) w *= level.funBoost;
  if (seen.has(q.id)) w *= 0.1; // kürzlich gespielte Fragen kommen deutlich seltener
  if (q.generated && q.type !== 'image') w *= 0.5; // Statistik aus dem Generator soll die handgeschriebenen Fragen nicht verdrängen
  return w;
}

/**
 * Zieht n Fragen gewichtet ohne Zurücklegen. Damit keine Kategorie dominiert
 * (z. B. 40 Streckenumrisse), wird das Gewicht je Kategorie normalisiert.
 */
export function pickQuestions(pool: Question[], n: number, levelId: LevelId, seen: ReadonlySet<string> = new Set(), rnd: () => number = Math.random): Question[] {
  const level = levelById(levelId);
  const catTotal = new Map<string, number>();
  const raw = pool.map((q) => { const w = weightOf(q, level, seen); catTotal.set(q.category, (catTotal.get(q.category) ?? 0) + w); return w; });
  const cand = pool.map((q, i) => ({ q, w: raw[i] > 0 ? raw[i] / Math.sqrt(catTotal.get(q.category)!) : 0 })).filter((c) => c.w > 0);
  const out: Question[] = [];
  while (out.length < n && cand.length) {
    let r = rnd() * cand.reduce((a, c) => a + c.w, 0);
    let i = 0;
    while (i < cand.length - 1 && (r -= cand[i].w) > 0) i++;
    out.push(cand.splice(i, 1)[0].q);
  }
  return out;
}

export function shuffle<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Mischt Antwortoptionen bzw. Sortier-Elemente für die Anzeige. */
export function deal(q: Question, rnd: () => number = Math.random): Dealt {
  if (q.type === 'mc' || q.type === 'image') {
    const order = shuffle(q.options!.map((_, i) => i), rnd);
    return { q, shown: order.map((i) => q.options![i]), correctIndex: order.indexOf(q.answer as number) };
  }
  if (q.type === 'order') {
    let shown = shuffle(q.items!, rnd);
    // nie schon richtig sortiert austeilen
    for (let t = 0; t < 5 && shown.every((s, i) => s === q.items![i]); t++) shown = shuffle(q.items!, rnd);
    if (shown.every((s, i) => s === q.items![i])) shown = [...shown.slice(1), shown[0]];
    return { q, shown, correctIndex: -1 };
  }
  return { q, shown: [], correctIndex: -1 };
}

// ---- Laden: Vite bündelt alle Dateien aus curated/ und generated/ (review/ bewusst nicht) ----
let bundled: Question[] | null = null;
let extra: Question[] = [];
/** Eigene (importierte) Fragen dazunehmen; ids, die es schon gibt, werden ignoriert. */
export function setExtraQuestions(list: Question[]): void { extra = list; }
export function bundledQuestions(): Question[] {
  if (!bundled) {
    const files = import.meta.glob<{ questions: Question[] }>(['../../data/questions/curated/*.json', '../../data/questions/generated/*.json'], { eager: true, import: 'default' });
    bundled = Object.values(files).flatMap((f) => f.questions);
  }
  return bundled;
}
export function loadQuestions(): Question[] {
  if (!extra.length) return bundledQuestions();
  const ids = new Set(bundledQuestions().map((q) => q.id));
  return [...bundledQuestions(), ...extra.filter((q) => !ids.has(q.id))];
}
import categoriesJson from '../../data/categories.json';
export const CATEGORIES: Category[] = categoriesJson;
export const categoryById = (id: string): Category => CATEGORIES.find((c) => c.id === id) ?? { id, title: id, emoji: '❓' };
