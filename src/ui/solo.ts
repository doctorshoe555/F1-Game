// Solo-Modus: Einstellungen → Fragerunde → Ergebnis.
import { answerClassic, createClassic, currentDealt, deadline, nextClassic, type ClassicSettings, type ClassicState } from '../core/classic';
import { CATEGORIES, ERAS, LEVELS, filterPool, levelById, loadQuestions, pickQuestions } from '../core/questions';
import type { Answer } from '../core/types';
import { addHighscore, highscoresFor, markSeen, seenIds } from '../storage/highscores';
import { load, save } from '../storage/store';
import { fmt, h, type View } from './dom';
import { scoreTable } from './highscores';
import { levelTyre, stopwatch } from './icons';
import { startLights } from './lights';
import { questionHead, questionInput, questionReveal } from './questionView';
import { sfx } from './sound';

const DEFAULTS: ClassicSettings = { length: 10, level: 'stammgast', categories: null, era: 'alle', seconds: 20 };
let game: ClassicState | null = null;
let savedRank: { rank: number; date: string } | null = null;
let lightsPending = false;
const secs = (ms: number): string => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

const go = (hash: string): void => { location.hash = hash; };

// ---------- Einstellungen ----------
export function soloSetupView(): View {
  const s: ClassicSettings = { ...DEFAULTS, ...load<Partial<ClassicSettings>>('solo.settings', {}) };
  const all = loadQuestions();
  const usedCats = CATEGORIES.filter((c) => all.some((q) => q.category === c.id));
  const el = h('main.page');

  const radios = <T extends string | number>(name: string, label: string, options: { value: T; title: string; hint?: string; icon?: SVGElement }[], current: T, set: (v: T) => void): HTMLElement =>
    h('fieldset.field', h('legend', label), h('div.choices', options.map((o) =>
      h('label.choice', h('input', { type: 'radio', name, checked: o.value === current, onchange: () => { set(o.value); draw(); } }),
        h('span', o.icon ?? null, h('span.choice-text', o.title, o.hint ? h('small', o.hint) : null))))));

  function draw(): void {
    const pool = filterPool(all, s);
    const n = Math.min(s.length, pool.length);
    const allCats = s.categories === null;
    const toggleCat = (id: string): void => {
      const cur = new Set(s.categories ?? usedCats.map((c) => c.id));
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      s.categories = cur.size === usedCats.length ? null : [...cur];
      draw();
    };
    el.replaceChildren(
      h('a.back', { href: '#/' }, '← Startseite'),
      h('h1', 'Solo-Runde'),
      radios('len', 'Länge', [10, 20, 30].map((v) => ({ value: v, title: `${v} Fragen` })), s.length, (v) => { s.length = v; }),
      radios('lvl', 'Schwierigkeit', LEVELS.map((l) => ({ value: l.id, title: l.title, hint: l.hint, icon: levelTyre(l.id) })), s.level, (v) => { s.level = v; }),
      radios('sec', 'Zeit pro Frage', [{ value: 15, title: '15 s' }, { value: 20, title: '20 s' }, { value: 30, title: '30 s' }, { value: 0, title: 'ohne Timer', hint: 'kein Zeitbonus' }], s.seconds, (v) => { s.seconds = v; }),
      radios('era', 'Zeitraum', ERAS.map((e) => ({ value: e.id, title: e.title })), s.era, (v) => { s.era = v; }),
      h('fieldset.field', h('legend', 'Kategorien'),
        h('div.choices',
          h('label.choice', h('input', { type: 'checkbox', checked: allCats, onchange: () => { s.categories = allCats ? [] : null; draw(); } }), h('span', 'Alle')),
          usedCats.map((c) => h('label.choice', h('input', { type: 'checkbox', checked: allCats || s.categories!.includes(c.id), onchange: () => toggleCat(c.id) }), h('span', `${c.emoji} ${c.title}`))))),
      h('p.pool', { role: 'status' }, pool.length === 0 ? 'Zu dieser Auswahl gibt es keine Fragen – bitte Filter lockern.'
        : pool.length < s.length ? `Nur ${pool.length} passende Fragen – die Runde wird entsprechend kürzer.`
        : `${pool.length} passende Fragen im Pool.`),
      h('button.btn.primary.big', { type: 'button', disabled: n === 0, onclick: start }, `Runde starten (${n} Fragen)`),
    );
  }
  function start(): void {
    save('solo.settings', s);
    const picked = pickQuestions(filterPool(all, s), s.length, s.level, seenIds());
    markSeen(picked.map((q) => q.id));
    game = createClassic({ ...s, length: picked.length }, picked, ['Solo'], Date.now());
    savedRank = null;
    lightsPending = true;
    go('#/solo/spiel');
  }
  draw();
  return { el };
}

// ---------- Fragerunde ----------
export function soloGameView(): View {
  if (!game) { go('#/solo'); return { el: h('main.page') }; }
  const el = h('main.page.game');
  let raf = 0;
  let lights: ReturnType<typeof startLights> | null = null;
  let finishPlayed = false;
  let key: (e: KeyboardEvent) => void = () => {};
  const onKey = (e: KeyboardEvent): void => { if (!e.ctrlKey && !e.metaKey && !e.altKey) key(e); };
  document.addEventListener('keydown', onKey);

  const update = (next: ClassicState): void => { game = next; draw(); };
  const answer = (a: Answer): void => {
    const next = answerClassic(game!, a, Date.now());
    const o = next.last;
    if (o) sfx(o.fastestLap ? 'purple' : o.verdict.correct ? 'ok' : 'bad');
    update(next);
  };

  function draw(): void {
    cancelAnimationFrame(raf);
    const g = game!;
    if (lightsPending && g.phase === 'question') {
      key = () => {};
      lights = startLights(() => { lightsPending = false; lights = null; game = { ...game!, startedAt: Date.now() }; draw(); });
      el.replaceChildren(lights.el);
      return;
    }
    if (g.phase === 'done') {
      if (!finishPlayed) { finishPlayed = true; sfx('finish'); }
      el.replaceChildren(result(g)); key = () => {}; return;
    }
    const d = currentDealt(g)!;
    const me = g.players[0];
    const head = h('header.game-head',
      h('span.count', h('small', 'Frage'), ` ${g.index + 1}`, h('small', `/${g.deck.length}`)),
      h(me.streak >= 3 ? 'span.drs.open' : 'span.drs', { 'aria-label': me.streak >= 3 ? `DRS offen: ${me.streak} richtige in Folge` : 'DRS geschlossen', title: 'Öffnet ab drei richtigen Antworten in Folge' },
        'DRS', me.streak >= 3 ? h('small', `×${me.streak}`) : null),
      h('span.score', { 'aria-label': `Punktestand ${me.score}` }, fmt(me.score), h('small', ' Pkt.')));

    if (g.phase === 'question') {
      const input = questionInput(d, answer);
      const isText = (t: EventTarget | null): boolean => t instanceof HTMLInputElement;
      key = (e) => { if (!isText(e.target)) input.key(e); };
      const end = deadline(g);
      const bar = h('i');
      const left$ = h('span');
      let lastTick = 99;
      const timer = end ? h('div.timer', { role: 'timer', 'aria-label': 'Restzeit' }, bar, left$) : null;
      el.replaceChildren(head, timer ?? '', questionHead(d), input.el);
      if (end) {
        const total = g.settings.seconds * 1000;
        const tick = (): void => {
          const left = end - Date.now();
          if (left <= 0) { answer(null); return; }
          bar.style.width = `${(left / total) * 100}%`;
          const whole = Math.ceil(left / 1000);
          if (whole !== lastTick) { if (whole <= 3 && lastTick !== 99) sfx('tick'); lastTick = whole; left$.textContent = String(whole); }
          timer!.classList.toggle('low', left < 5000);
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
    } else {
      const o = g.last!;
      const v = o.verdict;
      const status = o.timedOut ? ['bad', '⏱ Zeit abgelaufen'] : v.correct ? ['good', '✓ Richtig'] : v.accuracy > 0 ? ['part', '≈ Knapp daneben'] : ['bad', '✗ Leider falsch'];
      const last = g.index + 1 >= g.deck.length;
      const nextBtn = h('button.btn.primary.big', { type: 'button', onclick: () => update(nextClassic(game!, Date.now())) }, last ? 'Zum Ergebnis' : 'Nächste Frage');
      key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextBtn.click(); } };
      el.replaceChildren(...[head,
        h(`div.verdict.${status[0]}`, { role: 'status' }, h('strong', status[1]), h('span', o.gained > 0 ? `+${fmt(o.gained)} Punkte` : 'keine Punkte')),
        o.fastestLap ? h('div.fastest', { role: 'status' }, stopwatch(), h('strong', 'Schnellste Runde'), h('span', secs(o.timeMs))) : null,
        questionHead(d), questionReveal(d, o), nextBtn].filter((n): n is HTMLElement => n !== null));
      nextBtn.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }

  function result(g: ClassicState): HTMLElement {
    const me = g.players[0];
    const level = levelById(g.settings.level);
    const box = h('div.save-score');
    const table = h('div');
    const showTable = (): void => { table.replaceChildren(scoreTable(highscoresFor(g.deck.length), savedRank?.date)); };
    const drawSave = (): void => {
      if (savedRank) {
        box.replaceChildren(h('p.saved', { role: 'status' }, savedRank.rank ? `Gespeichert – Platz ${savedRank.rank} der Bestenliste (${g.deck.length} Fragen).` : 'Gespeichert – für die Top 20 hat es diesmal nicht gereicht.'));
        return;
      }
      const name = h('input', { type: 'text', maxLength: 16, value: load('player.name', ''), placeholder: 'Dein Name', 'aria-label': 'Dein Name für die Bestenliste', autocomplete: 'nickname' });
      box.replaceChildren(h('form.inline', {
        onsubmit: (e: Event) => {
          e.preventDefault();
          const n = name.value.trim() || 'Anonymer Rookie';
          save('player.name', n);
          const date = new Date().toISOString();
          savedRank = { rank: addHighscore({ name: n, score: me.score, correct: me.correct, length: g.deck.length, level: g.settings.level, date }), date };
          drawSave(); showTable();
        },
      }, name, h('button.btn.primary', { type: 'submit' }, 'In die Bestenliste')));
    };
    drawSave(); showTable();
    const quota = me.correct / g.deck.length;
    const verdict = quota >= 0.9 ? 'Weltmeisterlich!' : quota >= 0.7 ? 'Podium! Stark gefahren.' : quota >= 0.4 ? 'Solide Punkteränge.' : 'Bwoah. Nächstes Mal wird es besser.';
    return h('section.result',
      h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Zielflagge'), h('h1', verdict),
      h('div.stats',
        h('div', h('strong', fmt(me.score)), h('span', 'Punkte')),
        h('div', h('strong', `${me.correct}/${g.deck.length}`), h('span', 'richtig')),
        h('div', h('strong', String(me.bestStreak)), h('span', 'beste Serie')),
        h('div.purple', h('strong', g.fastest ? secs(g.fastest.timeMs) : '–'), h('span', 'schnellste Runde'))),
      h('p.hint.with-ico', levelTyre(level.id), `${level.title} · ${g.settings.seconds ? g.settings.seconds + ' s pro Frage' : 'ohne Timer'}`),
      box, h('h2', `Bestenliste – ${g.deck.length} Fragen`), table,
      h('div.actions', h('a.btn.primary', { href: '#/solo' }, 'Neue Runde'), h('a.btn', { href: '#/' }, 'Startseite')));
  }

  draw();
  return { el, dispose: () => { lights?.dispose(); cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); } };
}
