import { colorForName } from '../core/colors';
import { levelById } from '../core/questions';
import { allHighscores, highscoresFor, type Highscore } from '../storage/highscores';
import { fmt, h, type View } from './dom';
import { levelTyre } from './icons';

/** Bestenliste in Timing-Tower-Optik: Platz, Farbbalken, Name, Punkte, Abstand zur Spitze. */
export function scoreTable(list: Highscore[], highlightDate?: string): HTMLElement {
  if (!list.length) return h('p.hint', 'Noch keine Einträge – die Pole-Position ist frei.');
  const top = list[0].score;
  return h('ol.tower', list.map((e, i) => {
    const me = e.date === highlightDate;
    const level = levelById(e.level);
    return h(me ? 'li.me' : 'li',
      h('span.pos', { 'aria-label': `Platz ${i + 1}` }, String(i + 1)),
      h('i.team', { style: `background:${colorForName(e.name).hex}` }),
      h('span.name', h('span', e.name), me ? h('em', 'du') : null),
      h('span.meta', { title: `${level.title}, ${new Date(e.date).toLocaleDateString('de-DE')}` }, levelTyre(e.level), h('span', `${e.correct}/${e.length}`)),
      h('span.pts', fmt(e.score)),
      h('span.gap', i === 0 ? 'Spitze' : `−${fmt(top - e.score)}`));
  }));
}

export function highscoresView(): View {
  const lengths = [...new Set([10, 20, 30, ...allHighscores().map((e) => e.length)])].sort((a, b) => a - b);
  return {
    el: h('main.page', h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Bestenliste'),
      h('p.hint', 'Die Bestenliste wird nur auf diesem Gerät gespeichert. Reifen = Stufe (S leicht, M mittel, H schwer, I Bwoah), daneben die richtigen Antworten.'),
      lengths.map((len) => h('section', h('h2', `${len} Fragen`), scoreTable(highscoresFor(len))))),
  };
}
