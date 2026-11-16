// Einstellungen für Solo und Pass-and-Play.
import { createClassic, MAX_PLAYERS, type ClassicSettings } from '../core/classic';
import { PLAYER_COLORS } from '../core/colors';
import { CATEGORIES, ERAS, LEVELS, filterPool, loadQuestions, pickQuestions } from '../core/questions';
import { markSeen, seenIds } from '../storage/highscores';
import { load, save } from '../storage/store';
import { h, type View } from './dom';
import { levelTyre } from './icons';
import { startSession } from './session';

export type Filters = Omit<ClassicSettings, 'length'>;
const FILTER_DEFAULTS: Filters = { level: 'stammgast', categories: null, era: 'alle', seconds: 20 };

type Option<T> = { value: T; title: string; hint?: string; icon?: SVGElement };
export function radios<T extends string | number>(name: string, label: string, options: Option<T>[], current: T, set: (v: T) => void): HTMLElement {
  return h('fieldset.field', h('legend', label), h('div.choices', options.map((o) =>
    h('label.choice', h('input', { type: 'radio', name, checked: o.value === current, onchange: () => set(o.value) }),
      h('span', o.icon ?? null, h('span.choice-text', o.title, o.hint ? h('small', o.hint) : null))))));
}

/** Gemeinsame Felder: Stufe, Zeit, Zeitraum, Kategorien. */
export function filterFields(s: Filters, redraw: () => void): HTMLElement[] {
  const all = loadQuestions();
  const used = CATEGORIES.filter((c) => all.some((q) => q.category === c.id));
  const allCats = s.categories === null;
  const toggle = (id: string): void => {
    const cur = new Set(s.categories ?? used.map((c) => c.id));
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    s.categories = cur.size === used.length ? null : [...cur];
    redraw();
  };
  return [
    radios('lvl', 'Schwierigkeit', LEVELS.map((l) => ({ value: l.id, title: l.title, hint: l.hint, icon: levelTyre(l.id) })), s.level, (v) => { s.level = v; redraw(); }),
    radios('sec', 'Zeit pro Frage', [{ value: 15, title: '15 s' }, { value: 20, title: '20 s' }, { value: 30, title: '30 s' }, { value: 0, title: 'ohne Timer', hint: 'kein Zeitbonus' }], s.seconds, (v) => { s.seconds = v; redraw(); }),
    radios('era', 'Zeitraum', ERAS.map((e) => ({ value: e.id, title: e.title })), s.era, (v) => { s.era = v; redraw(); }),
    h('fieldset.field', h('legend', 'Kategorien'), h('div.choices',
      h('label.choice', h('input', { type: 'checkbox', checked: allCats, onchange: () => { s.categories = allCats ? [] : null; redraw(); } }), h('span', 'Alle')),
      used.map((c) => h('label.choice', h('input', { type: 'checkbox', checked: allCats || s.categories!.includes(c.id), onchange: () => toggle(c.id) }), h('span', `${c.emoji} ${c.title}`))))),
  ];
}

export function poolNote(pool: number, wanted: number): HTMLElement {
  return h('p.pool', { role: 'status' }, pool === 0 ? 'Zu dieser Auswahl gibt es keine Fragen – bitte Filter lockern.'
    : pool < wanted ? `Nur ${pool} passende Fragen – die Runde wird entsprechend kürzer.` : `${pool} passende Fragen im Pool.`);
}

function launch(filters: Filters, total: number, players: { name: string; color: string }[]): void {
  const pool = filterPool(loadQuestions(), filters);
  const picked = pickQuestions(pool, total, filters.level, seenIds());
  markSeen(picked.map((q) => q.id));
  startSession(createClassic({ ...filters, length: picked.length }, picked, players, Date.now()));
  location.hash = '#/spiel';
}

// ---------- Solo ----------
export function soloSetupView(): View {
  const stored = load<Partial<ClassicSettings>>('solo.settings', {});
  const s: Filters = { ...FILTER_DEFAULTS, ...stored };
  let length = stored.length ?? 10;
  let name = load('player.name', '');
  const el = h('main.page');
  function draw(): void {
    const pool = filterPool(loadQuestions(), s).length;
    const n = Math.min(length, pool);
    const input = h('input', { type: 'text', maxLength: 16, value: name, placeholder: 'Dein Name', id: 'solo-name', autocomplete: 'nickname', oninput: () => { name = input.value; } });
    el.replaceChildren(
      h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Solo-Runde'),
      h('div.field', h('label.legend', { for: 'solo-name' }, 'Fahrername'), input, h('p.hint', 'Für Bestenliste und Historie.')),
      radios('len', 'Länge', [10, 20, 30].map((v) => ({ value: v, title: `${v} Fragen` })), length, (v) => { length = v; draw(); }),
      ...filterFields(s, draw), poolNote(pool, length),
      h('button.btn.primary.big', {
        type: 'button', disabled: n === 0,
        onclick: () => {
          const who = name.trim() || 'Anonymer Rookie';
          save('player.name', name.trim()); save('solo.settings', { ...s, length });
          launch(s, length, [{ name: who, color: PLAYER_COLORS[0].id }]);
        },
      }, `Runde starten (${n} Fragen)`));
  }
  draw();
  return { el };
}

// ---------- Pass-and-Play ----------
interface Roster { name: string; color: string }
export function partySetupView(): View {
  const stored = load<{ filters?: Partial<Filters>; perPlayer?: number; roster?: Roster[] }>('party.settings', {});
  const s: Filters = { ...FILTER_DEFAULTS, ...stored.filters };
  let perPlayer = stored.perPlayer ?? 5;
  const valid = (r: unknown): r is Roster => !!r && typeof (r as Roster).name === 'string' && PLAYER_COLORS.some((c) => c.id === (r as Roster).color);
  const roster: Roster[] = Array.isArray(stored.roster) && stored.roster.filter(valid).length >= 2
    ? stored.roster.filter(valid).slice(0, MAX_PLAYERS) : [{ name: '', color: PLAYER_COLORS[0].id }, { name: '', color: PLAYER_COLORS[1].id }];
  const freeColor = (): string => (PLAYER_COLORS.find((c) => !roster.some((r) => r.color === c.id)) ?? PLAYER_COLORS[0]).id;
  const el = h('main.page');
  let error = '';

  function draw(): void {
    const pool = filterPool(loadQuestions(), s).length;
    const wanted = perPlayer * roster.length;
    // gleich viele Fragen für alle: auf ein Vielfaches der Spielerzahl abrunden
    const total = Math.floor(Math.min(wanted, pool) / roster.length) * roster.length;
    el.replaceChildren(
      h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Ein Gerät, viele Fahrer'),
      h('p.lead', 'Reihum beantwortet jeder seine eigene Frage. Nach jeder Frage wird das Gerät weitergegeben.'),
      h('fieldset.field', h('legend', `Startaufstellung (${roster.length} von ${MAX_PLAYERS})`),
        h('ol.roster', roster.map((r, i) => {
          const col = PLAYER_COLORS.find((c) => c.id === r.color)!;
          const name = h('input', { type: 'text', maxLength: 16, value: r.name, placeholder: `Fahrer ${i + 1}`, 'aria-label': `Name von Fahrer ${i + 1}`, oninput: () => { r.name = name.value; } });
          return h('li', h('i.swatch', { style: `background:${col.hex}` }), name,
            h('select', { 'aria-label': `Farbe von Fahrer ${i + 1}`, onchange: (e: Event) => { r.color = (e.target as HTMLSelectElement).value; draw(); } },
              PLAYER_COLORS.map((c) => h('option', { value: c.id, selected: c.id === r.color }, c.name))),
            h('button.icon', { type: 'button', disabled: roster.length <= 2, 'aria-label': `Fahrer ${i + 1} entfernen`, onclick: () => { roster.splice(i, 1); draw(); } }, '✕'));
        })),
        h('button.btn', { type: 'button', disabled: roster.length >= MAX_PLAYERS, onclick: () => { roster.push({ name: '', color: freeColor() }); draw(); } }, '+ Fahrer hinzufügen')),
      radios('per', 'Fragen pro Fahrer', [3, 5, 8, 10].map((v) => ({ value: v, title: String(v) })), perPlayer, (v) => { perPlayer = v; draw(); }),
      ...filterFields(s, draw), poolNote(pool, wanted),
      h('p.form-error', { role: 'alert' }, error),
      h('button.btn.primary.big', {
        type: 'button', disabled: total === 0,
        onclick: () => {
          const players = roster.map((r, i) => ({ name: r.name.trim() || `Fahrer ${i + 1}`, color: r.color }));
          const names = players.map((p) => p.name.toLowerCase());
          if (new Set(names).size !== names.length) { error = 'Zwei Fahrer haben denselben Namen – bitte ändern, sonst gerät die Statistik durcheinander.'; draw(); return; }
          save('party.settings', { filters: s, perPlayer, roster });
          launch(s, total, players);
        },
      }, `Rennen starten (${total} Fragen)`));
    error = '';
  }
  draw();
  return { el };
}
