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
import { classicGameView } from './ui/classicGame';
import { partySetupView, soloSetupView } from './ui/classicSetup';
import { historyView } from './ui/history';
import { hostView } from './ui/host';
import { playerJoinView } from './ui/player';
import { savesView } from './ui/saves';
import { setSound, soundOn } from './ui/sound';

// Hash-Routing, weil GitHub Pages keine Unterpfade für Single-Page-Apps kennt.
const routes: Record<string, (arg?: string) => View> = {
  '': homeView,
  solo: soloSetupView,
  party: partySetupView,
  spiel: classicGameView,
  spielstaende: savesView,
  historie: historyView,
  bestenliste: highscoresView,
  credits: creditsView,
  host: hostView,
  join: playerJoinView,
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
  const [first, arg] = path.split('/');
  const notFound = (): View => ({ el: h('main.page', h('h1', 'Falsch abgebogen'), h('p', 'Diese Seite gibt es nicht.'), h('a.btn', { href: '#/' }, 'Zur Startseite')) });
  current = routes[path] ? routes[path]() : routes[first] && (first === 'join') ? routes[first](arg) : notFound();
  outlet.replaceChildren(current.el);
  document.body.classList.toggle('in-game', path === 'spiel' || first === 'join' || first === 'host');
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
render();
