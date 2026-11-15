// Spielansicht für Solo und Pass-and-Play.
import { answerClassic, currentDealt, currentPlayer, deadline, nextClassic, ranking, readyClassic, type ClassicState } from '../core/classic';
import { PLAYER_COLORS } from '../core/colors';
import { levelById } from '../core/questions';
import type { Answer } from '../core/types';
import { highscoresFor } from '../storage/highscores';
import { exportSave, saveNamed } from '../storage/saves';
import { fmt, h, type View } from './dom';
import { scoreTable } from './highscores';
import { levelTyre, stopwatch } from './icons';
import { startLights } from './lights';
import { questionHead, questionInput, questionReveal } from './questionView';
import { restoreSession, updateSession } from './session';
import { sfx } from './sound';

const secs = (ms: number): string => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const hex = (colorId: string): string => (PLAYER_COLORS.find((c) => c.id === colorId) ?? PLAYER_COLORS[0]).hex;

export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rangliste eines laufenden oder beendeten Spiels als Timing Tower. */
function standings(g: ClassicState, active: number | null): HTMLElement {
  const rows = ranking(g);
  const top = rows[0].player.score;
  return h('ol.tower', rows.map((r) => h(r.index === active ? 'li.me' : 'li',
    h('span.pos', { 'aria-label': `Platz ${r.place}` }, String(r.place)),
    h('i.team', { style: `background:${hex(r.player.color)}` }),
    h('span.name', h('span', r.player.name), g.fastest?.player === r.index ? h('em.purple', { title: 'Schnellste Runde' }, 'FL') : null),
    h('span.meta', `${r.player.correct}/${r.player.answered}`),
    h('span.pts', fmt(r.player.score)),
    h('span.gap', r.place === 1 ? 'Spitze' : `−${fmt(top - r.player.score)}`))));
}

export function classicGameView(): View {
  const ses = restoreSession();
  if (!ses) { location.hash = '#/'; return { el: h('main.page') }; }
  const el = h('main.page.game');
  let raf = 0;
  let lights: ReturnType<typeof startLights> | null = null;
  let finishPlayed = false;
  let key: (e: KeyboardEvent) => void = () => {};
  const onKey = (e: KeyboardEvent): void => { if (!e.ctrlKey && !e.metaKey && !e.altKey) key(e); };
  document.addEventListener('keydown', onKey);
  const typing = (t: EventTarget | null): boolean => t instanceof HTMLInputElement || t instanceof HTMLSelectElement;

  const update = (next: ClassicState): void => { updateSession(next); draw(); };
  const answer = (a: Answer): void => {
    const next = answerClassic(ses.state, a, Date.now());
    const o = next.last;
    if (o) sfx(o.fastestLap ? 'purple' : o.verdict.correct ? 'ok' : 'bad');
    update(next);
  };

  /** Aufklappbares Menü: benannt speichern, exportieren, pausieren. */
  function menu(): HTMLElement {
    const name = h('input', { type: 'text', maxLength: 40, placeholder: 'Name des Spielstands', 'aria-label': 'Name des Spielstands' });
    const note = h('p.hint', { role: 'status' });
    return h('details.game-menu', h('summary', 'Speichern & Pause'),
      h('p.hint', 'Das Spiel wird nach jedem Schritt automatisch gesichert. Du kannst es jederzeit schließen und später fortsetzen.'),
      h('form.inline', { onsubmit: (e: Event) => { e.preventDefault(); const s = saveNamed(name.value, ses!.state); note.textContent = `Gespeichert als „${s.name}“.`; name.value = ''; } },
        name, h('button.btn', { type: 'submit' }, 'Speichern unter')),
      note,
      h('div.actions',
        h('button.btn', { type: 'button', onclick: () => download(`boxenfunk-spielstand-${new Date().toISOString().slice(0, 10)}.json`, exportSave({ id: ses!.id, name: 'Exportierter Spielstand', auto: false, kind: 'classic', updatedAt: new Date().toISOString(), summary: '', state: ses!.state })) }, 'Als Datei exportieren'),
        h('a.btn', { href: '#/' }, 'Pause – zur Startseite')));
  }

  function draw(): void {
    cancelAnimationFrame(raf);
    const g = ses!.state;
    const multi = g.players.length > 1;
    if (ses!.lights && g.phase !== 'done') {
      key = () => {};
      lights = startLights(() => { ses!.lights = false; lights = null; if (g.phase === 'question') updateSession({ ...ses!.state, startedAt: Date.now() }); draw(); });
      el.replaceChildren(lights.el);
      return;
    }
    if (g.phase === 'done') {
      if (!finishPlayed) { finishPlayed = true; sfx('finish'); }
      el.replaceChildren(result(g)); key = () => {}; window.scrollTo(0, 0); return;
    }
    const pi = currentPlayer(g);
    const me = g.players[pi];
    const d = currentDealt(g)!;
    const head = h('header.game-head',
      h('span.count', h('small', 'Frage'), ` ${g.index + 1}`, h('small', `/${g.deck.length}`)),
      h(me.streak >= 3 ? 'span.drs.open' : 'span.drs', { 'aria-label': me.streak >= 3 ? `DRS offen: ${me.streak} richtige in Folge` : 'DRS geschlossen', title: 'Öffnet ab drei richtigen Antworten in Folge' },
        'DRS', me.streak >= 3 ? h('small', `×${me.streak}`) : null),
      h('span.score', { 'aria-label': `${me.name}: ${me.score} Punkte` },
        multi ? h('span.who', h('i.swatch', { style: `background:${hex(me.color)}` }), me.name) : null, fmt(me.score), h('small', ' Pkt.')));

    if (g.phase === 'handover') {
      const ready = h('button.btn.primary.big', { type: 'button', onclick: () => update(readyClassic(ses!.state, Date.now())) }, 'Bereit – Frage zeigen');
      key = (e) => { if (!typing(e.target) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ready.click(); } };
      el.replaceChildren(head,
        h('section.handover', { style: `--team:${hex(me.color)}` }, h('p.kicker', 'Gerät weitergeben an'), h('h1', me.name),
          h('p.hint', g.settings.seconds ? `Die Uhr (${g.settings.seconds} s) läuft, sobald du auf „Bereit“ tippst.` : 'Ohne Zeitlimit.'), ready),
        h('h2', 'Zwischenstand'), standings(g, pi), menu());
    } else if (g.phase === 'question') {
      const input = questionInput(d, answer);
      key = (e) => { if (!typing(e.target)) input.key(e); };
      const end = deadline(g);
      const bar = h('i');
      const left$ = h('span');
      let lastTick = 99;
      const timer = end ? h('div.timer', { role: 'timer', 'aria-label': 'Restzeit' }, bar, left$) : null;
      el.replaceChildren(...[head, timer, questionHead(d), input.el].filter((n): n is HTMLElement => n !== null));
      if (end) {
        const total = g.settings.seconds * 1000;
        const tick = (): void => {
          const left = end - Date.now();
          if (left <= 0) { answer(null); return; }
          bar.style.width = `${(left / total) * 100}%`;
          const whole = Math.ceil(left / 1000);
          if (whole !== lastTick) { if (whole <= 3 && lastTick !== 99) sfx('tick'); lastTick = whole; left$.textContent = String(whole); }
          timer!.classList.toggle('low', left < 5000);
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
    } else {
      const o = g.last!;
      const v = o.verdict;
      const status = o.timedOut ? ['bad', '⏱ Zeit abgelaufen'] : v.correct ? ['good', '✓ Richtig'] : v.accuracy > 0 ? ['part', '≈ Knapp daneben'] : ['bad', '✗ Leider falsch'];
      const last = g.index + 1 >= g.deck.length;
      const nextBtn = h('button.btn.primary.big', { type: 'button', onclick: () => update(nextClassic(ses!.state, Date.now())) }, last ? 'Zum Ergebnis' : multi ? 'Weiter – Gerät weitergeben' : 'Nächste Frage');
      key = (e) => { if (!typing(e.target) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextBtn.click(); } };
      el.replaceChildren(...[head,
        h(`div.verdict.${status[0]}`, { role: 'status' }, h('strong', status[1]), h('span', o.gained > 0 ? `+${fmt(o.gained)} Punkte` : 'keine Punkte')),
        o.fastestLap ? h('div.fastest', { role: 'status' }, stopwatch(), h('strong', 'Schnellste Runde'), h('span', secs(o.timeMs))) : null,
        questionHead(d), questionReveal(d, o), nextBtn, menu()].filter((n): n is HTMLElement => n !== null));
      nextBtn.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }

  function result(g: ClassicState): HTMLElement {
    const level = levelById(g.settings.level);
    const info = h('p.hint.with-ico', levelTyre(level.id), `${level.title} · ${g.settings.seconds ? g.settings.seconds + ' s pro Frage' : 'ohne Timer'}`);
    const fastest = h('div.purple', h('strong', g.fastest ? secs(g.fastest.timeMs) : '–'),
      h('span', g.fastest && g.players.length > 1 ? `schnellste Runde: ${g.players[g.fastest.player].name}` : 'schnellste Runde'));
    if (g.players.length > 1) {
      const rows = ranking(g);
      const winners = rows.filter((r) => r.place === 1).map((r) => r.player.name);
      return h('section.result', h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Zielflagge'),
        h('h1', winners.length > 1 ? `Totes Rennen: ${winners.join(' & ')}` : `${winners[0]} gewinnt!`),
        standings(g, null),
        h('div.stats', h('div', h('strong', fmt(rows[0].player.score)), h('span', 'Punkte des Siegers')),
          h('div', h('strong', String(Math.max(...g.players.map((p) => p.bestStreak)))), h('span', 'längste Serie')), fastest),
        info, h('p.saved', { role: 'status' }, 'Das Rennen steht jetzt in der Historie.'),
        h('div.actions', h('a.btn.primary', { href: '#/party' }, 'Revanche'), h('a.btn', { href: '#/historie' }, 'Historie'), h('a.btn', { href: '#/' }, 'Startseite')));
    }
    const me = g.players[0];
    const quota = me.correct / g.deck.length;
    const verdict = quota >= 0.9 ? 'Weltmeisterlich!' : quota >= 0.7 ? 'Podium! Stark gefahren.' : quota >= 0.4 ? 'Solide Punkteränge.' : 'Bwoah. Nächstes Mal wird es besser.';
    const rank = ses!.rank;
    const list = highscoresFor(g.deck.length);
    const mine = rank ? list[rank - 1]?.date : undefined;
    return h('section.result', h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', `Zielflagge für ${me.name}`), h('h1', verdict),
      h('div.stats', h('div', h('strong', fmt(me.score)), h('span', 'Punkte')), h('div', h('strong', `${me.correct}/${g.deck.length}`), h('span', 'richtig')),
        h('div', h('strong', String(me.bestStreak)), h('span', 'beste Serie')), fastest),
      info,
      h('p.saved', { role: 'status' }, rank ? `Platz ${rank} der Bestenliste (${g.deck.length} Fragen).` : rank === 0 ? 'Für die Top 20 hat es diesmal nicht gereicht.' : ''),
      h('h2', `Bestenliste – ${g.deck.length} Fragen`), scoreTable(list, mine),
      h('div.actions', h('a.btn.primary', { href: '#/solo' }, 'Neue Runde'), h('a.btn', { href: '#/historie' }, 'Historie'), h('a.btn', { href: '#/' }, 'Startseite')));
  }

  draw();
  return { el, dispose: () => { lights?.dispose(); cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); } };
}
