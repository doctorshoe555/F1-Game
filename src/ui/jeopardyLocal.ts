// Grand Prix Jeopardy an einem Gerät: Aufstellung, Einstellungen und Spiel ohne Netz.
import { actJeopardy, buildBoards, createJeopardy, DEFAULT_JEOPARDY, hostJeopardy, startJeopardy, tickJeopardy, type JeopardySettings, type JeopardyState } from '../core/jeopardy';
import { loadQuestions } from '../core/questions';
import { recordJeopardy } from '../storage/history';
import { autosave, listSaves, newId, type SaveEntry } from '../storage/saves';
import { load, save } from '../storage/store';
import { saveMenu } from './classicGame';
import { finalRoster, loadRoster, rosterEditor } from './classicSetup';
import { h, type View } from './dom';
import { jeopardyFields, jeopardyScreen, type JRender } from './jeopardyScreen';
import { startLights } from './lights';
import { sfx } from './sound';
import { keepAwake } from './timer';

interface LocalGame { id: string; state: JeopardyState; ui: { ready: string | null }; lights: boolean }
let cur: LocalGame | null = null;

export function loadLocalJeopardy(entry: SaveEntry): boolean {
  if (entry.kind !== 'jeopardy' || !('kind' in entry.state) || !entry.state.local) return false;
  cur = { id: entry.auto ? entry.id : newId(), state: entry.state, ui: { ready: null }, lights: false };
  autosave(cur.id, cur.state);
  return true;
}

export function jeopardySetupView(): View {
  const stored = load<{ settings?: Partial<JeopardySettings>; roster?: unknown }>('jeopardy.local', {});
  const set: JeopardySettings = { ...DEFAULT_JEOPARDY, ...stored.settings };
  const roster = loadRoster(stored.roster);
  const el = h('main.page');
  let error = '';
  function draw(): void {
    const built = buildBoards(loadQuestions(), set);
    el.replaceChildren(
      h('a.back', { href: '#/' }, '← Startseite'), h('h1', 'Grand Prix Jeopardy'),
      h('p.lead', 'Alle an einem Gerät: Gebuzzert wird per Schaltfläche oder mit den Tasten 1–8. Für Handys als Buzzer eröffne stattdessen einen Raum unter „Party per Handy“.'),
      rosterEditor(roster, draw), ...jeopardyFields(set, draw, true),
      h('p.pool', { role: 'status' }, built.boards.length < set.rounds ? `Der Fragenpool reicht nur für ${built.boards.length} Runde(n).` : `${set.rounds * set.categories * 5} Felder${set.final ? ' plus Finale Runde' : ''}.`),
      h('p.form-error', { role: 'alert' }, error),
      h('button.btn.primary.big', {
        type: 'button', disabled: !built.boards.length,
        onclick: () => {
          const players = finalRoster(roster);
          if (!players) { error = 'Zwei Fahrer haben denselben Namen – bitte ändern.'; draw(); return; }
          save('jeopardy.local', { settings: set, roster });
          const lobby: JeopardyState = { ...createJeopardy(true), players: players.map((p, i) => ({ id: `p${i + 1}`, name: p.name, color: p.color, avatar: '', score: 0, correct: 0, streak: 0, connected: true })) };
          cur = { id: newId(), state: startJeopardy(lobby, set, loadQuestions(), Date.now()), ui: { ready: null }, lights: true };
          autosave(cur.id, cur.state);
          location.hash = '#/jeopardy/spiel';
        },
      }, 'Spiel starten'));
    error = '';
  }
  draw();
  return { el };
}

export function jeopardyGameView(): View {
  if (!cur) { const auto = listSaves().find((e) => e.auto && e.kind === 'jeopardy' && 'kind' in e.state && e.state.local); if (auto) loadLocalJeopardy(auto); }
  if (!cur) { location.hash = '#/jeopardy'; return { el: h('main.page') }; }
  const game = cur;
  const el = h('main.page.wide.tv.jeopardy');
  const awake = keepAwake();
  let render: JRender | null = null;
  let lights: ReturnType<typeof startLights> | null = null;

  function commit(next: JeopardyState): void {
    if (next === game.state) return;
    const before = game.state;
    game.state = next;
    autosave(game.id, next);
    if (next.phase !== before.phase) {
      if (next.phase === 'answer') sfx('light');
      else if (next.phase === 'reveal') sfx(next.cur?.log.some((l) => l.ok) ? 'ok' : 'bad');
      else if (next.phase === 'wager') sfx('purple');
      else if (next.phase === 'done') { sfx('finish'); recordJeopardy(game.id, next); }
    }
    draw();
  }
  function draw(): void {
    render?.stop(); render = null;
    if (game.lights && game.state.phase === 'board') {
      lights = startLights(() => { game.lights = false; lights = null; draw(); });
      el.replaceChildren(lights.el);
      return;
    }
    render = jeopardyScreen({
      s: game.state, ui: game.ui, redraw: draw,
      act: (id, a) => commit(tickJeopardy(actJeopardy(game.state, id, a, Date.now()), Date.now())),
      host: (a) => commit(hostJeopardy(game.state, a, Date.now())),
      exits: [h('a.btn.primary', { href: '#/jeopardy' }, 'Revanche'), h('a.btn', { href: '#/historie' }, 'Historie'), h('a.btn', { href: '#/' }, 'Startseite')],
    });
    el.replaceChildren(...render.nodes, ...(game.state.phase === 'done' ? [] : [saveMenu(() => game.state)]));
  }
  const loop = window.setInterval(() => commit(tickJeopardy(game.state, Date.now())), 100);
  const onKey = (e: KeyboardEvent): void => { if (!(e.target instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey && !e.altKey) render?.key(e); };
  document.addEventListener('keydown', onKey);
  draw();
  return { el, dispose: () => { clearInterval(loop); render?.stop(); lights?.dispose(); awake(); document.removeEventListener('keydown', onKey); } };
}
