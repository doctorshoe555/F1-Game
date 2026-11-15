import { loadQuestions } from '../core/questions';
import { storageAvailable } from '../storage/store';
import { h, type View } from './dom';
import { grid, group, helmet, phones } from './icons';

export function homeView(): View {
  const soon = (icon: SVGElement, title: string, text: string): HTMLElement =>
    h('div.mode.soon', { 'aria-disabled': 'true' }, icon, h('h3', title), h('p', text), h('span.tag', 'kommt bald'));
  return {
    el: h('main.page.home',
      h('header.hero', h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Das F1-Quiz mit Augenzwinkern'),
        h('h1.wordmark', 'Boxen', h('span', 'funk')),
        h('p.lead', `${loadQuestions().length} Fragen zu Weltmeistern, Funksprüchen, Pannen und allem dazwischen.`)),
      h('nav.modes', { 'aria-label': 'Spielmodi' },
        h('a.mode', { href: '#/solo' }, helmet(), h('h3', 'Solo'), h('p', '10, 20 oder 30 Fragen gegen die Uhr – mit Zeitbonus und Bestenliste.'), h('span.tag.go', 'Start')),
        soon(group(), 'Ein Gerät, viele Fahrer', 'Pass-and-Play für 2–8 Spieler, reihum.'),
        soon(phones(), 'Party per Handy', 'Host zeigt QR-Code, alle spielen im Browser mit.'),
        soon(grid(), 'Grand Prix Jeopardy', 'Board, Buzzer, Safety-Car-Felder und Finale Runde.')),
      h('p.links', h('a.btn', { href: '#/bestenliste' }, 'Bestenliste')),
      storageAvailable() ? null : h('p.notice', { role: 'status' }, 'Hinweis: Dein Browser erlaubt kein Speichern. Bestenliste und Einstellungen gehen beim Schließen verloren.')),
  };
}
