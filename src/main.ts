import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/titillium-web/latin-400.css';
import '@fontsource/titillium-web/latin-600.css';
import './styles/main.css';
import { creditsView } from './ui/credits';
import { h, type View } from './ui/dom';
import { highscoresView } from './ui/highscores';
import { homeView } from './ui/home';
import { speaker } from './ui/icons';
import { soloGameView, soloSetupView } from './ui/solo';
import { setSound, soundOn } from './ui/sound';

// Hash-Routing, weil GitHub Pages keine Unterpfade für Single-Page-Apps kennt.
const routes: Record<string, () => View> = {
  '': homeView,
  solo: soloSetupView,
  'solo/spiel': soloGameView,
  bestenliste: highscoresView,
  credits: creditsView,
};

const soundBtn = h('button.tool', { type: 'button', onclick: () => { setSound(!soundOn()); drawSound(); } });
function drawSound(): void {
  soundBtn.replaceChildren(speaker(soundOn()), h('span', soundOn() ? 'Ton an' : 'Ton aus'));
  soundBtn.setAttribute('aria-pressed', String(soundOn()));
  soundBtn.setAttribute('aria-label', soundOn() ? 'Ton ist an – ausschalten' : 'Ton ist aus – einschalten');
}
drawSound();

const outlet = h('div.outlet');
document.getElementById('app')!.append(
  h('header.topbar', h('a.brand', { href: '#/', 'aria-label': 'Boxenfunk – Startseite' }, 'Boxen', h('span', 'funk')), soundBtn),
  outlet,
  h('footer.legal', h('span', 'Inoffizielles Fanprojekt – keine Verbindung zur Formel 1, zur FIA oder zu den Teams.'), ' ', h('a', { href: '#/credits' }, 'Credits & Lizenzen')));

let current: View | null = null;
function render(): void {
  current?.dispose?.();
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const make = routes[path] ?? (() => ({ el: h('main.page', h('h1', 'Falsch abgebogen'), h('p', 'Diese Seite gibt es nicht.'), h('a.btn', { href: '#/' }, 'Zur Startseite')) }));
  current = make();
  outlet.replaceChildren(current.el);
  document.body.classList.toggle('in-game', path === 'solo/spiel');
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
render();
