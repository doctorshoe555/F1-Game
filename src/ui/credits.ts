import { loadQuestions } from '../core/questions';
import { h, type View } from './dom';

export function creditsView(): View {
  // Bildnachweise direkt aus den Fragendaten – so bleibt die Liste automatisch aktuell.
  const groups = new Map<string, { author: string; license: string; source: string; n: number }>();
  for (const q of loadQuestions()) {
    if (!q.image) continue;
    const key = `${q.image.author}|${q.image.license}|${q.image.source}`;
    const g = groups.get(key) ?? { author: q.image.author, license: q.image.license, source: q.image.source, n: 0 };
    g.n++; groups.set(key, g);
  }
  const link = (url: string): HTMLElement | string => (/^https:\/\//.test(url) ? h('a', { href: url, rel: 'noopener', target: '_blank' }, url.replace(/^https:\/\//, '')) : url);
  return {
    el: h('main.page', h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Credits & Lizenzen'),
      h('p', 'Boxenfunk ist ein inoffizielles Fanprojekt. Es steht in keiner Verbindung zur Formel 1, zur FIA, zu Teams oder Fahrern und verwendet keine offiziellen Logos, Marken oder Schriften.'),
      h('h2', 'Bilder'),
      h('table.scores', h('thead', h('tr', h('th', 'Urheber'), h('th', 'Lizenz'), h('th', 'Quelle'), h('th.num', 'Bilder'))),
        h('tbody', [...groups.values()].map((g) => h('tr', h('td', g.author), h('td', g.license), h('td', link(g.source)), h('td.num', String(g.n)))))),
      h('h2', 'Schriften'),
      h('ul', h('li', 'Barlow Condensed – Jeremy Tribby, SIL Open Font License 1.1'), h('li', 'Titillium Web – Accademia di Belle Arti di Urbino, SIL Open Font License 1.1')),
      h('h2', 'Daten'),
      h('ul', h('li', 'Streckengeometrie: ', link('https://github.com/bacinger/f1-circuits'), ' (MIT-Lizenz)'), h('li', 'Statistik-Fragen („Aus dem Archiv“, „Aktuelle Saison“, Siege und Poles): erzeugt aus der ', link('https://github.com/jolpica/jolpica-f1'), '-API, Daten unter CC BY-NC-SA 4.0 – nur nicht-kommerzielle Nutzung'), h('li', 'Fragen und Erklärungen: handgeschrieben für dieses Projekt')),
      h('h2', 'Icons & Grafiken'),
      h('p', 'Alle Icons, Flaggen und Streckenumrisse wurden für dieses Projekt selbst erstellt.')),
  };
}
