import { loadQuestions } from '../core/questions';
import { latestAutosave } from '../storage/saves';
import { storageAvailable } from '../storage/store';
import { h, type View } from './dom';
import { grid, group, helmet, phones } from './icons';
import { loadSession } from './session';

export function homeView(): View {
  const soon = (icon: SVGElement, title: string, text: string): HTMLElement =>
    h('div.mode.soon', { 'aria-disabled': 'true' }, icon, h('h3', title), h('p', text), h('span.tag', 'kommt bald'));
  const auto = latestAutosave();
  return {
    el: h('main.page.home',
      h('header.hero', h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Das F1-Quiz mit Augenzwinkern'),
        h('h1.wordmark', 'Boxen', h('span', 'funk')),
        h('p.lead', `${loadQuestions().length} Fragen zu Weltmeistern, Funksprüchen, Pannen und allem dazwischen.`)),
      auto ? h('section.resume', h('div', h('p.kicker', 'Rennen unterbrochen'), h('p', auto.summary)),
        h('button.btn.primary', { type: 'button', onclick: () => { loadSession(auto); location.hash = '#/spiel'; } }, 'Weiterspielen')) : null,
      h('nav.modes', { 'aria-label': 'Spielmodi' },
        h('a.mode', { href: '#/solo' }, helmet(), h('h3', 'Solo'), h('p', '10, 20 oder 30 Fragen gegen die Uhr – mit Zeitbonus und Bestenliste.'), h('span.tag.go', 'Start')),
        h('a.mode', { href: '#/party' }, group(), h('h3', 'Ein Gerät, viele Fahrer'), h('p', 'Pass-and-Play für 2–8 Spieler, reihum.'), h('span.tag.go', 'Start')),
        soon(phones(), 'Party per Handy', 'Host zeigt QR-Code, alle spielen im Browser mit.'),
        soon(grid(), 'Grand Prix Jeopardy', 'Board, Buzzer, Safety-Car-Felder und Finale Runde.')),
      h('p.links', h('a.btn', { href: '#/spielstaende' }, 'Spielstände'), h('a.btn', { href: '#/bestenliste' }, 'Bestenliste'), h('a.btn', { href: '#/historie' }, 'Historie')),
      storageAvailable() ? null : h('p.notice', { role: 'status' }, 'Hinweis: Dein Browser erlaubt kein dauerhaftes Speichern. Spielstände, Bestenliste und Historie gehen beim Schließen verloren.')),
  };
}
