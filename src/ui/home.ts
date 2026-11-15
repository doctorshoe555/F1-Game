import { loadQuestions } from '../core/questions';
import { storageAvailable } from '../storage/store';
import { h, type View } from './dom';

export function homeView(): View {
  const soon = (title: string, text: string): HTMLElement =>
    h('div.mode.soon', { 'aria-disabled': 'true' }, h('h3', title), h('p', text), h('span.tag', 'kommt bald'));
  return {
    el: h('main.page.home',
      h('header.hero', h('p.kicker', 'Das F1-Quiz mit Augenzwinkern'), h('h1', 'Boxenfunk'),
        h('p.lead', `${loadQuestions().length} Fragen zu Weltmeistern, Funksprüchen, Pannen und allem dazwischen.`)),
      h('nav.modes',
        h('a.mode', { href: '#/solo' }, h('h3', 'Solo'), h('p', '10, 20 oder 30 Fragen gegen die Uhr – mit Zeitbonus und Bestenliste.'), h('span.tag.go', 'Start')),
        soon('Ein Gerät, viele Fahrer', 'Pass-and-Play für 2–8 Spieler, reihum.'),
        soon('Party per Handy', 'Host zeigt QR-Code, alle spielen im Browser mit.'),
        soon('Grand Prix Jeopardy', 'Board, Buzzer, Safety-Car-Felder und Finale Runde.')),
      h('p.links', h('a', { href: '#/bestenliste' }, 'Bestenliste')),
      storageAvailable() ? null : h('p.notice', { role: 'status' }, 'Hinweis: Dein Browser erlaubt kein Speichern. Bestenliste und Einstellungen gehen beim Schließen verloren.'),
      h('footer.legal', 'Inoffizielles Fanprojekt – steht in keiner Verbindung zur Formel 1, zur FIA oder zu den Teams.')),
  };
}
