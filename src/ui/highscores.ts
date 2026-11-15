import { levelById } from '../core/questions';
import { allHighscores, highscoresFor, type Highscore } from '../storage/highscores';
import { fmt, h, type View } from './dom';

export function scoreTable(list: Highscore[], highlightDate?: string): HTMLElement {
  if (!list.length) return h('p.hint', 'Noch keine Einträge – die Pole-Position ist frei.');
  return h('table.scores',
    h('thead', h('tr', h('th', 'Pl.'), h('th', 'Name'), h('th.num', 'Punkte'), h('th.num', 'Richtig'), h('th', 'Stufe'), h('th', 'Datum'))),
    h('tbody', list.map((e, i) => h(e.date === highlightDate ? 'tr.me' : 'tr',
      h('td', String(i + 1)), h('td', e.name, e.date === highlightDate ? h('em', ' ← du') : null), h('td.num', fmt(e.score)), h('td.num', `${e.correct}/${e.length}`),
      h('td', levelById(e.level).title), h('td', new Date(e.date).toLocaleDateString('de-DE'))))));
}

export function highscoresView(): View {
  const lengths = [...new Set([10, 20, 30, ...allHighscores().map((e) => e.length)])].sort((a, b) => a - b);
  return {
    el: h('main.page', h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Bestenliste'),
      h('p.hint', 'Die Bestenliste wird nur auf diesem Gerät gespeichert.'),
      lengths.map((len) => h('section', h('h2', `${len} Fragen`), scoreTable(highscoresFor(len))))),
  };
}
