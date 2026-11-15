// Seite „Historie“: Statistik je Fahrername und die letzten Spiele.
import { PLAYER_COLORS } from '../core/colors';
import { levelById } from '../core/questions';
import { listHistory, playerStats } from '../storage/history';
import { fmt, h, type View } from './dom';
import { levelTyre } from './icons';

const hex = (id: string): string => (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;

export function historyView(): View {
  const list = listHistory();
  const stats = playerStats(list);
  return {
    el: h('main.page', h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Historie'),
      !list.length ? h('p.hint', 'Noch keine beendeten Spiele auf diesem Gerät.') : [
        h('h2', 'Fahrerwertung'),
        h('div.table-wrap', h('table.scores',
          h('thead', h('tr', h('th', 'Fahrer'), h('th.num', 'Spiele'), h('th.num', 'Siege'), h('th.num', 'Bestwert'), h('th.num', 'Quote'), h('th.num', 'Schnellste'))),
          h('tbody', stats.map((s) => h('tr',
            h('td', h('i.swatch', { style: `background:${hex(s.color)}` }), ' ', s.name), h('td.num', String(s.games)),
            h('td.num', s.partyGames ? `${s.wins}/${s.partyGames}` : '–'), h('td.num', fmt(s.best)),
            h('td.num', s.answered ? `${Math.round((s.correct / s.answered) * 100)} %` : '–'),
            h('td.num.purple-text', s.fastestMs == null ? '–' : `${(s.fastestMs / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`)))))),
        h('p.hint', 'Siege zählen nur in Mehrspieler-Rennen. Bestwert = höchste Punktzahl in einem Spiel, Quote = Anteil richtiger Antworten, Schnellste = schnellste richtige Antwort.'),
        h('h2', 'Letzte Spiele'),
        h('ol.games', list.map((e) => h('li',
          h('div.game-meta', levelTyre(e.level), h('span', `${new Date(e.date).toLocaleDateString('de-DE')} · ${e.mode === 'solo' ? 'Solo' : `${e.players.length} Fahrer`} · ${e.length} Fragen · ${levelById(e.level).title}`)),
          h('div.game-result', e.players.map((p) => h('span', h('b', `${p.place}.`), ' ', h('i.swatch', { style: `background:${hex(p.color)}` }), ` ${p.name} `, h('span.num', fmt(p.score)))))))),
      ],
      h('p.hint', 'Die Historie wird nur auf diesem Gerät gespeichert (höchstens die letzten 100 Spiele).')),
  };
}
