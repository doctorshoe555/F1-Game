// Wandelt LLM-Vorschläge in prüfbare Fragen für data/questions/review/ um. Reine Funktionen (ohne Netz).

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();

/**
 * @param parsed   { suggestions: [...], rephrased: [{ id, explanation }] } – Antwort des Modells
 * @param ctx      { date, categories: string[], existing: Question[] }
 * Vorschläge, die es wortgleich schon gibt, eine unbekannte Kategorie haben oder formal nicht passen, fallen weg.
 */
export function toReviewQuestions(parsed, { date, categories, existing }) {
  const taken = new Set(existing.map((q) => norm(q.question)));
  const byId = new Map(existing.map((q) => [q.id, q]));
  const meta = { source: 'llm-vorschlag (ungeprüft)', generated: true, lastVerified: date };
  const out = [];
  let n = 0;
  for (const s of parsed.suggestions ?? []) {
    if (!categories.includes(s.category) || taken.has(norm(s.question)) || !s.question?.trim() || !s.explanation?.trim()) continue;
    const common = { id: `llm-${date}-${String(++n).padStart(2, '0')}`, type: s.type, category: s.category, difficulty: clamp(s.difficulty, 1, 5), tags: ['spass', 'review'], question: s.question.trim() };
    if (s.type === 'tf') out.push({ ...common, answer: !!s.answerBool, explanation: s.explanation.trim(), ...meta });
    else if (s.type === 'mc') {
      const options = [...new Set((s.options ?? []).map((o) => String(o).trim()).filter(Boolean))];
      if (options.length < 3 || options.length > 6 || !Number.isInteger(s.answerIndex) || s.answerIndex < 0 || s.answerIndex >= options.length) { n--; continue; }
      out.push({ ...common, options, answer: s.answerIndex, explanation: s.explanation.trim(), ...meta });
    } else { n--; continue; }
    taken.add(norm(s.question));
  }
  // Umformulierte Erklärungen: Kopie der Originalfrage mit neuer Erklärung – zum Vergleichen und Übernehmen von Hand
  for (const r of parsed.rephrased ?? []) {
    const q = byId.get(r.id);
    if (!q || !r.explanation?.trim() || r.explanation.trim() === q.explanation) continue;
    out.push({ ...q, id: `${q.id}-llm`, tags: [...new Set([...(q.tags ?? []), 'review'])], explanation: r.explanation.trim(), ...meta });
  }
  return out;
}
