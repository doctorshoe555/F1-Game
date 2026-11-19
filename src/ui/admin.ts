// Admin-Seite: Fragen durchsuchen, melden, eigene Fragen importieren und exportieren.
import { reportUrl } from '../config';
import { bundledQuestions, CATEGORIES, categoryById, isValidOn, loadQuestions, setExtraQuestions, todayIso } from '../core/questions';
import { solutionText } from '../core/scoring';
import type { Question } from '../core/types';
import { loadCustom, parseImport, saveCustom } from '../storage/custom';
import { storageAvailable } from '../storage/store';
import { download } from './classicGame';
import { h, type View } from './dom';
import { difficultyDots } from './questionView';

const TYPE_NAMES: Record<Question['type'], string> = { mc: 'Auswahl', tf: 'Wahr/Falsch', estimate: 'Schätzfrage', image: 'Bildfrage', order: 'Sortieren' };
const PAGE = 30;
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const answerOf = (q: Question): string => solutionText({ q, shown: q.options ?? q.items ?? [], correctIndex: typeof q.answer === 'number' ? q.answer : -1 });
const asFile = (list: Question[]): string => '{"questions":[\n' + list.map((q) => JSON.stringify(q)).join(',\n') + '\n]}\n';

const TEMPLATE: Question[] = [{
  id: 'eigene-001', type: 'mc', category: 'pannen', difficulty: 2, tags: ['spass'],
  question: 'Hier steht deine Frage?', options: ['Richtige Antwort', 'Falsch A', 'Falsch B', 'Falsch C'], answer: 0,
  explanation: 'Kurze, witzige oder lehrreiche Erklärung.', source: 'eigene', generated: false, lastVerified: todayIso(),
}];

export function adminView(): View {
  const cats = CATEGORIES.map((c) => c.id);
  let custom = loadCustom(cats);
  const customIds = (): Set<string> => new Set(custom.map((q) => q.id));
  const f = { text: '', category: '', type: '', origin: '' };
  let shown = PAGE;
  let report: { ok: string; errors: string[] } | null = null;
  const results = h('div');
  const importBox = h('div');
  const stats = h('p.lead');

  const apply = (list: Question[]): void => { custom = list; saveCustom(list); setExtraQuestions(list); };

  function matches(q: Question): boolean {
    const mine = customIds().has(q.id);
    if (f.category && q.category !== f.category) return false;
    if (f.type && q.type !== f.type) return false;
    if (f.origin === 'eigene' && !mine) return false;
    if (f.origin === 'kuratiert' && (q.generated || mine)) return false;
    if (f.origin === 'generiert' && !q.generated) return false;
    if (f.origin === 'abgelaufen' && isValidOn(q, todayIso())) return false;
    if (!f.text) return true;
    const hay = norm([q.id, q.question, q.explanation, ...(q.options ?? []), ...(q.items ?? []), ...q.tags].join(' '));
    return norm(f.text).split(/\s+/).every((w) => hay.includes(w));
  }

  function item(q: Question): HTMLElement {
    const cat = categoryById(q.category);
    const mine = customIds().has(q.id);
    const expired = !isValidOn(q, todayIso());
    return h('details.adm-q',
      h('summary', h('span.adm-text', q.question), h('span.adm-chips', h('span', `${cat.emoji} ${cat.title}`), h('span', TYPE_NAMES[q.type]), difficultyDots(q.difficulty),
        mine ? h('span.chip-own', 'eigene') : q.generated ? h('span', 'generiert') : null, expired ? h('span.chip-bad', 'abgelaufen') : null)),
      q.image ? h('figure.q-image.small', h('img', { src: q.image.url, alt: 'Bild zur Frage', loading: 'lazy' })) : null,
      q.options ? h('ul.pills', q.options.map((o, i) => h(i === q.answer ? 'li.best' : 'li', i === q.answer ? `✓ ${o}` : o))) : h('p', h('b', 'Antwort: '), answerOf(q)),
      h('p', h('b', 'Erklärung: '), q.explanation),
      h('dl.adm-meta',
        h('dt', 'id'), h('dd', q.id), h('dt', 'Quelle'), h('dd', q.source), h('dt', 'geprüft am'), h('dd', q.lastVerified),
        q.year ? [h('dt', 'Bezugsjahr'), h('dd', String(q.year))] : null,
        q.validUntil ? [h('dt', 'gültig bis'), h('dd', q.validUntil)] : null,
        q.tags.length ? [h('dt', 'Tags'), h('dd', q.tags.join(', '))] : null,
        q.image ? [h('dt', 'Bild'), h('dd', `${q.image.author} · ${q.image.license}`)] : null),
      h('div.actions',
        h('a.btn', { href: reportUrl(q, answerOf(q)), target: '_blank', rel: 'noopener' }, 'Frage falsch? Auf GitHub melden'),
        mine ? h('button.btn', { type: 'button', onclick: () => { apply(custom.filter((x) => x.id !== q.id)); report = { ok: `„${q.id}“ gelöscht.`, errors: [] }; drawAll(); } }, 'Eigene Frage löschen') : null));
  }

  function drawResults(): void {
    const all = loadQuestions().filter(matches);
    results.replaceChildren(
      h('p.pool', { role: 'status' }, `${all.length} Treffer`),
      ...all.slice(0, shown).map(item),
      ...(all.length > shown ? [h('button.btn', { type: 'button', onclick: () => { shown += PAGE; drawResults(); } }, `Weitere anzeigen (${all.length - shown})`)] : []));
  }
  function drawImport(): void {
    const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'q-import', class: 'visually-hidden',
      onchange: async () => {
        const picked = file.files?.[0];
        if (!picked) return;
        const taken = new Set([...bundledQuestions().map((q) => q.id), ...customIds()]);
        const r = parseImport(await picked.text(), taken, cats, todayIso());
        if (r.added.length) apply([...custom, ...r.added]);
        report = { ok: r.added.length ? `${r.added.length} Frage(n) importiert.` : '', errors: r.errors };
        drawAll();
      } });
    const parts: (HTMLElement | null)[] = [
      report?.ok ? h('p.saved', { role: 'status' }, report.ok) : null,
      report?.errors.length ? h('div.form-error', { role: 'alert' }, h('p', `${report.errors.length} Frage(n) nicht übernommen:`), h('ul', report.errors.slice(0, 15).map((x) => h('li', x)))) : null,
      storageAvailable() ? null : h('p.notice', 'Dein Browser erlaubt kein dauerhaftes Speichern – importierte Fragen gehen beim Schließen verloren.'),
      h('div.actions', file, h('label.btn.primary', { for: 'q-import' }, 'Fragen importieren (JSON)'),
        h('button.btn', { type: 'button', onclick: () => download('boxenfunk-vorlage.json', asFile(TEMPLATE)) }, 'Vorlage herunterladen'),
        h('button.btn', { type: 'button', disabled: !custom.length, onclick: () => download('boxenfunk-eigene-fragen.json', asFile(custom)) }, `Eigene exportieren (${custom.length})`),
        h('button.btn', { type: 'button', onclick: () => download('boxenfunk-alle-fragen.json', asFile(loadQuestions())) }, 'Alle exportieren')),
    ];
    importBox.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
    report = null;
  }
  function drawAll(): void {
    const all = loadQuestions();
    stats.textContent = `${all.length} Fragen im Spiel: ${all.filter((q) => !q.generated && !customIds().has(q.id)).length} kuratiert, ${all.filter((q) => q.generated).length} generiert, ${custom.length} eigene.`;
    drawImport(); drawResults();
  }

  const select = (label: string, key: keyof typeof f, options: [string, string][]): HTMLElement => h('label.adm-filter', h('span', label),
    h('select', { onchange: (e: Event) => { f[key] = (e.target as HTMLSelectElement).value; shown = PAGE; drawResults(); } }, options.map(([v, t]) => h('option', { value: v }, t))));
  const search = h('input', { type: 'search', placeholder: 'Suchen in Frage, Antworten, Erklärung, id …', 'aria-label': 'Fragen durchsuchen', oninput: () => { f.text = search.value; shown = PAGE; drawResults(); } });

  drawAll();
  return {
    el: h('main.page', h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Fragen verwalten'), stats,
      h('h2', 'Eigene Fragen'),
      h('p.hint', 'Importierte Fragen werden nur auf diesem Gerät gespeichert und sind sofort in allen Spielmodi dabei. Felder wie tags, source und lastVerified werden ergänzt, wenn sie fehlen. Kategorien: ', cats.join(', '), '.'),
      importBox,
      h('h2', 'Fragen durchsuchen'),
      h('div.adm-filters', search,
        select('Kategorie', 'category', [['', 'alle'], ...CATEGORIES.map((c): [string, string] => [c.id, c.title])]),
        select('Typ', 'type', [['', 'alle'], ...Object.entries(TYPE_NAMES)]),
        select('Herkunft', 'origin', [['', 'alle'], ['kuratiert', 'kuratiert'], ['generiert', 'generiert'], ['eigene', 'eigene'], ['abgelaufen', 'abgelaufen']])),
      results),
  };
}
