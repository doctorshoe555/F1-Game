import './styles/main.css';
import { h, type View } from './ui/dom';
import { highscoresView } from './ui/highscores';
import { homeView } from './ui/home';
import { soloGameView, soloSetupView } from './ui/solo';

// Hash-Routing, weil GitHub Pages keine Unterpfade für Single-Page-Apps kennt.
const routes: Record<string, () => View> = {
  '': homeView,
  solo: soloSetupView,
  'solo/spiel': soloGameView,
  bestenliste: highscoresView,
};

const root = document.getElementById('app')!;
let current: View | null = null;

function render(): void {
  current?.dispose?.();
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const make = routes[path] ?? (() => ({ el: h('main.page', h('h1', 'Falsch abgebogen'), h('p', 'Diese Seite gibt es nicht.'), h('a.btn', { href: '#/' }, 'Zur Startseite')) }));
  current = make();
  root.replaceChildren(current.el);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
render();
