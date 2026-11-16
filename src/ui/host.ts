// Host-Ansicht für „Party per Handy“: Lobby mit QR-Code, Fragen, Auflösung und Rangliste für den großen Bildschirm.
// Der Host ist die einzige Wahrheit über den Spielstand; Handys bekommen nur fertige Ansichten.
import qrcode from 'qrcode-generator';
import { PLAYER_COLORS } from '../core/colors';
import { categoryById, filterPool, loadQuestions, pickQuestions } from '../core/questions';
import { backToLobby, createRace, isRaceState, nextQuestion, playerView, raceDeadline, resolveQuestion, startRace, submitAnswer, tickRace, type RaceState } from '../core/race';
import { joinRoster, rankPlayers, setConnected } from '../core/roster';
import { fmtEstimate, solutionText } from '../core/scoring';
import { compensate } from '../net/clock';
import { isClientMsg, newRoomCode, type HostMsg } from '../net/protocol';
import { createHost, netKind, type HostStatus, type HostTransport } from '../net/transport';
import { markSeen, seenIds } from '../storage/highscores';
import { recordRace } from '../storage/history';
import { newId } from '../storage/saves';
import { load, remove, save } from '../storage/store';
import { filterFields, poolNote, radios, type Filters } from './classicSetup';
import { fmt, h, type View } from './dom';
import { stopwatch } from './icons';
import { difficultyDots } from './questionView';
import { sfx } from './sound';
import { keepAwake, timerBar } from './timer';

interface HostSession { code: string; state: RaceState; tokens: Record<string, string>; raceId?: string }
const KEY = 'host.session';
const HEARTBEAT_TIMEOUT = 6500;
const LETTERS = 'ABCDEF';
const hex = (id: string): string => (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;
const secs = (ms: number): string => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

export function joinUrl(code: string): string {
  return `${location.origin}${location.pathname}${location.search}#/join/${code}`;
}

function qrSvg(text: string): HTMLElement {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const box = h('div.qr', { role: 'img', 'aria-label': 'QR-Code zum Beitreten' });
  box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  return box;
}

export function hostView(): View {
  const stored = load<HostSession | null>(KEY, null);
  const restored = !!stored && typeof stored.code === 'string' && isRaceState(stored.state) && stored.state.players.length > 0;
  let ses: HostSession = restored
    ? { code: stored!.code, raceId: stored!.raceId, tokens: stored!.tokens ?? {}, state: { ...stored!.state, players: stored!.state.players.map((p) => ({ ...p, connected: false })) } }
    : { code: newRoomCode(), state: createRace(), tokens: {} };
  let status: HostStatus = { s: 'connecting' };
  let transport: HostTransport | null = null;
  const connOf = new Map<string, string>();   // Verbindung → Spieler-id
  const lastSeen = new Map<string, number>();
  const filters: Filters = (({ length: _l, ...f }) => f)(ses.state.settings);
  let length = ses.state.settings.length;
  let timer: ReturnType<typeof timerBar> | null = null;
  let key: (e: KeyboardEvent) => void = () => {};
  const el = h('main.page.wide.tv');
  const awake = keepAwake();

  const send = (conn: string, msg: HostMsg): void => transport?.send(conn, msg);
  function pushViews(): void {
    for (const [conn, id] of connOf) { const v = playerView(ses.state, id); if (v) send(conn, { t: 'view', v }); }
  }
  function commit(next: RaceState, tokens = ses.tokens): void {
    if (next === ses.state && tokens === ses.tokens) return;
    const before = ses.state;
    ses = { ...ses, state: next, tokens };
    if (next.phase === 'question' && before.phase === 'lobby') ses.raceId = newId();
    if (next.phase === 'done' && ses.raceId) recordRace(ses.raceId, next);
    save(KEY, ses);
    if (before.phase !== next.phase || before.index !== next.index) {
      if (next.phase === 'question') sfx('go'); else if (next.phase === 'reveal') sfx('ok'); else if (next.phase === 'done') sfx('finish');
    }
    pushViews();
    draw();
  }

  function onMessage(conn: string, raw: unknown): void {
    if (!isClientMsg(raw)) return;
    const now = Date.now();
    lastSeen.set(conn, now);
    if (raw.t === 'ping') { send(conn, { t: 'pong', c: raw.c, h: Date.now() }); return; }
    if (raw.t === 'hello') {
      const r = joinRoster(ses.state.players, ses.tokens, { token: raw.token, name: String(raw.name ?? ''), color: String(raw.color ?? ''), avatar: String(raw.avatar ?? '').slice(0, 8) }, () => crypto.randomUUID());
      if (r.status !== 'new' && r.status !== 'rejoined') { send(conn, { t: 'reject', reason: r.status }); return; }
      // dieselbe Person auf einer neuen Verbindung: alte Zuordnung lösen
      for (const [c, id] of connOf) if (id === r.player.id && c !== conn) connOf.delete(c);
      connOf.set(conn, r.player.id);
      send(conn, { t: 'welcome', id: r.player.id, token: r.token });
      if (r.status === 'new') sfx('light');
      const same = r.players === ses.state.players;
      commit(same ? ses.state : { ...ses.state, players: r.players }, r.tokens);
      if (same) pushViews();
      return;
    }
    const id = connOf.get(conn);
    if (!id) return;
    if (raw.t === 'answer') {
      const at = compensate(raw.at, now, ses.state.startedAt);
      commit(tickRace(submitAnswer(ses.state, id, raw.index, raw.a, at - ses.state.startedAt), now));
    } else if (raw.t === 'bye') drop(conn);
  }
  function drop(conn: string): void {
    const id = connOf.get(conn);
    connOf.delete(conn); lastSeen.delete(conn);
    if (id && ![...connOf.values()].includes(id)) commit({ ...ses.state, players: setConnected(ses.state.players, id, false) });
  }
  function open(): void {
    transport?.close();
    connOf.clear(); lastSeen.clear();
    status = { s: 'connecting' };
    transport = createHost(ses.code, {
      status(st) {
        // Frischer Raum und der Code ist zufällig vergeben: einfach einen neuen würfeln.
        if (st.s === 'error' && st.reason === 'code-taken' && !ses.state.players.length) { ses = { ...ses, code: newRoomCode() }; open(); return; }
        status = st; draw();
      },
      message: onMessage,
      closed: drop,
    });
  }
  const loop = window.setInterval(() => {
    const now = Date.now();
    for (const [conn, seen] of lastSeen) if (now - seen > HEARTBEAT_TIMEOUT) drop(conn);
    commit(tickRace(ses.state, now));
  }, 250);

  function start(): void {
    const pool = filterPool(loadQuestions(), filters);
    const picked = pickQuestions(pool, length, filters.level, seenIds());
    markSeen(picked.map((q) => q.id));
    commit(startRace(ses.state, { ...filters, length }, picked, Date.now()));
  }
  function newRoom(): void { remove(KEY); ses = { code: newRoomCode(), state: createRace(), tokens: {} }; open(); draw(); }

  // ---------- Darstellung ----------
  function chips(): HTMLElement {
    const s = ses.state;
    return h('ul.chips', s.players.map((p) => {
      const answered = s.phase === 'question' && !!s.answers[p.id];
      return h(`li${p.connected ? '' : '.off'}${answered ? '.ok' : ''}`, { style: `--team:${hex(p.color)}` },
        h('span.avatar', { 'aria-hidden': 'true' }, p.avatar), h('span', p.name),
        h('em', !p.connected ? 'getrennt' : answered ? '✓' : s.phase === 'question' ? '…' : ''));
    }));
  }
  function tower(): HTMLElement {
    const rows = rankPlayers(ses.state.players);
    const top = rows[0]?.player.score ?? 0;
    return h('ol.tower', rows.map((r) => {
      const res = ses.state.results?.[r.player.id];
      return h(r.player.connected ? 'li' : 'li.off',
        h('span.pos', { 'aria-label': `Platz ${r.place}` }, String(r.place)), h('i.team', { style: `background:${hex(r.player.color)}` }),
        h('span.name', h('span', `${r.player.avatar} ${r.player.name}`), ses.state.best?.id === r.player.id ? h('em.purple', { title: 'Schnellste Runde' }, 'FL') : null),
        h('span.meta', res ? (res.gained > 0 ? `+${fmt(res.gained)}` : res.answer === null ? 'keine Antwort' : '±0') : `${r.player.correct} richtig`),
        h('span.pts', fmt(r.player.score)), h('span.gap', r.place === 1 ? 'Spitze' : `−${fmt(top - r.player.score)}`));
    }));
  }
  function banner(): HTMLElement | null {
    if (status.s === 'open') return null;
    if (status.s === 'connecting') return h('p.notice', { role: 'status' }, 'Verbinde mit dem Vermittlungsdienst …');
    const text = status.reason === 'code-taken' ? `Der Raum ${ses.code} ist bereits geöffnet – vermutlich in einem anderen Tab oder Fenster. Schließe ihn dort oder eröffne einen neuen Raum.`
      : status.reason === 'unsupported' ? 'Dieser Browser unterstützt die nötige Verbindungstechnik (WebRTC) nicht.'
      : 'Keine Verbindung zum Vermittlungsdienst. Bereits verbundene Handys spielen weiter; neue Spieler können gerade nicht beitreten.';
    return h('p.notice.bad', { role: 'alert' }, text, ' ', h('button.btn', { type: 'button', onclick: open }, 'Erneut versuchen'));
  }

  function lobby(): HTMLElement[] {
    const s = ses.state;
    const pool = filterPool(loadQuestions(), filters).length;
    const n = Math.min(length, pool);
    const url = joinUrl(ses.code);
    return [
      h('div.lobby',
        h('section.room', h('p.kicker', 'Raum-Code'), h('p.code', { 'aria-label': `Raum-Code ${ses.code.split('').join(' ')}` }, ses.code), qrSvg(url),
          h('p.hint', 'QR-Code scannen oder auf dem Handy öffnen:'), h('p.url', url),
          netKind() === 'local' ? h('p.notice', 'Testmodus „lokal“: Verbindungen funktionieren nur zwischen Tabs dieses Browsers.') : null),
        h('section.grid-side', h('h2', `Startaufstellung (${s.players.length})`),
          s.players.length ? h('ul.chips.big', s.players.map((p) => h(p.connected ? 'li' : 'li.off', { style: `--team:${hex(p.color)}` },
            h('span.avatar', { 'aria-hidden': 'true' }, p.avatar), h('span', p.name), p.connected ? null : h('em', 'getrennt'),
            h('button.icon.small', { type: 'button', 'aria-label': `${p.name} entfernen`, onclick: () => { for (const [c, id] of connOf) if (id === p.id) connOf.delete(c); const { [p.id]: _t, ...rest } = ses.tokens; commit({ ...s, players: s.players.filter((x) => x.id !== p.id) }, rest); } }, '✕'))))
            : h('p.hint', 'Noch niemand da. Sobald jemand den Code scannt, erscheint er hier.'),
          h('details.settings', { open: !s.players.length ? undefined : true },
            h('summary', 'Rennen einstellen'),
            radios('len', 'Länge', [10, 20, 30].map((v) => ({ value: v, title: `${v} Fragen` })), length, (v) => { length = v; draw(); }),
            ...filterFields(filters, draw), poolNote(pool, length)),
          h('button.btn.primary.big', { type: 'button', disabled: !s.players.length || n === 0, onclick: start }, s.players.length ? `Rennen starten (${n} Fragen)` : 'Warte auf Spieler …'))),
    ];
  }

  function question(): HTMLElement[] {
    const s = ses.state;
    const d = s.deck[s.index];
    const q = d.q;
    const cat = categoryById(q.category);
    const end = raceDeadline(s);
    if (end) timer = timerBar(end, s.settings.seconds * 1000, Date.now, (left) => { if (left <= 3 && left > 0) sfx('tick'); });
    const online = s.players.filter((p) => p.connected);
    const body = q.type === 'mc' || q.type === 'image' ? h('div.options', d.shown.map((o, i) => h('div.option', h('b', LETTERS[i]), h('span', o))))
      : q.type === 'tf' ? h('div.options.two', h('div.option', h('b', 'W'), h('span', 'Wahr')), h('div.option', h('b', 'F'), h('span', 'Falsch')))
      : q.type === 'order' ? h('div', h('p.hint', 'Bringt diese Elemente auf dem Handy in die richtige Reihenfolge:'), h('ul.pills', d.shown.map((o) => h('li', o))))
      : h('p.lead', `Schätzt auf euren Handys${q.unit ? ` (in ${q.unit})` : ''} – wer am nächsten dran ist, bekommt einen Bonus.`);
    key = () => {};
    return [
      h('header.game-head', h('span.count', h('small', 'Frage'), ` ${s.index + 1}`, h('small', `/${s.deck.length}`)),
        h('span.q-cat', `${cat.emoji} ${cat.title}`), difficultyDots(q.difficulty),
        h('span.score', `${online.filter((p) => s.answers[p.id]).length}/${online.length}`, h('small', ' Antworten'))),
      timer?.el ?? h('div'),
      h('h1.q-text', q.question),
      q.image ? h('figure.q-image', h('img', { src: q.image.url, alt: 'Bild zur Frage' })) : h('div'),
      body, chips(),
      h('div.actions', h('button.btn', { type: 'button', onclick: () => commit(resolveQuestion(ses.state)) }, 'Jetzt auflösen')),
    ];
  }

  function reveal(): HTMLElement[] {
    const s = ses.state;
    const d = s.deck[s.index];
    const q = d.q;
    const res = s.results ?? {};
    const name = (id: string): string => s.players.find((p) => p.id === id)?.name ?? '?';
    const picks = (test: (a: NonNullable<(typeof res)[string]['answer']>) => boolean): string[] => Object.entries(res).filter(([, r]) => r.answer !== null && test(r.answer)).map(([id]) => name(id));
    let body: HTMLElement;
    if (q.type === 'mc' || q.type === 'image' || q.type === 'tf') {
      const shown = q.type === 'tf' ? ['Wahr', 'Falsch'] : d.shown;
      const right = q.type === 'tf' ? (q.answer ? 0 : 1) : d.correctIndex;
      body = h(q.type === 'tf' ? 'div.options.two' : 'div.options', shown.map((o, i) => {
        const who = picks((a) => (a.kind === 'choice' ? a.index === i : a.kind === 'bool' ? (a.value ? 0 : 1) === i : false));
        return h(`div.option.${i === right ? 'right' : 'dim'}`, h('b', q.type === 'tf' ? o[0] : LETTERS[i]),
          h('span', o, who.length ? h('small.who-picked', who.join(', ')) : null), i === right ? h('em', '✓ richtig') : null);
      }));
    } else if (q.type === 'estimate') {
      const guesses = Object.entries(res).filter(([, r]) => r.answer?.kind === 'number').sort((a, b) => (a[1].verdict.off ?? 0) - (b[1].verdict.off ?? 0));
      body = h('div', h('div.solution', h('span', 'Richtig ist'), h('strong', solutionText(d))),
        h('ul.pills', guesses.map(([id, r]) => h(r.closest ? 'li.best' : 'li', `${name(id)}: ${fmtEstimate(q, (r.answer as { value: number }).value)}`, r.closest ? ' – am nächsten dran' : ''))));
    } else {
      body = h('div', h('ol.order.solved', q.items!.map((it) => h('li.right', h('span.order-text', it)))),
        h('p.hint', `Komplett richtig: ${Object.entries(res).filter(([, r]) => r.verdict.correct).map(([id]) => name(id)).join(', ') || 'niemand'}`));
    }
    const fastest = Object.entries(res).find(([, r]) => r.fastest);
    const last = s.index + 1 >= s.deck.length;
    const next = h('button.btn.primary.big', { type: 'button', onclick: () => commit(nextQuestion(ses.state, Date.now())) }, last ? 'Zur Siegerehrung' : 'Nächste Frage');
    key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next.click(); } };
    return [
      h('header.game-head', h('span.count', h('small', 'Frage'), ` ${s.index + 1}`, h('small', `/${s.deck.length}`)), h('span.score', h('small', 'Auflösung'))),
      h('div.reveal-cols',
        h('section', h('h1.q-text', q.question), q.image ? h('figure.q-image', h('img', { src: q.image.url, alt: 'Bild zur Frage' })) : null, body,
          fastest ? h('div.fastest', { role: 'status' }, stopwatch(), h('strong', `Schnellste Runde: ${name(fastest[0])}`), h('span', secs(fastest[1].timeMs ?? 0))) : null,
          h('aside.explain', h('b', 'Boxenfunk: '), q.explanation)),
        h('section', h('h2', 'Zwischenstand'), tower(), next)),
    ];
  }

  function done(): HTMLElement[] {
    const rows = rankPlayers(ses.state.players);
    const winners = rows.filter((r) => r.place === 1).map((r) => r.player.name);
    const best = ses.state.best;
    key = () => {};
    return [
      h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Zielflagge'),
      h('h1', winners.length > 1 ? `Totes Rennen: ${winners.join(' & ')}` : `${winners[0] ?? 'Niemand'} gewinnt!`),
      tower(),
      best ? h('div.fastest', stopwatch(), h('strong', `Schnellste Runde des Rennens: ${ses.state.players.find((p) => p.id === best.id)?.name ?? '?'}`), h('span', secs(best.timeMs))) : h('div'),
      h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => commit(backToLobby(ses.state)) }, 'Revanche (gleiche Fahrer)'),
        h('button.btn', { type: 'button', onclick: newRoom }, 'Neuer Raum'), h('a.btn', { href: '#/' }, 'Startseite')),
    ];
  }

  function draw(): void {
    timer?.stop(); timer = null;
    const s = ses.state;
    const parts: (HTMLElement | null)[] = [
      banner(),
      s.phase !== 'lobby' ? h('p.room-tag', 'Raum ', h('b', ses.code), ' · Nachzügler: ', joinUrl(ses.code).replace(/^https?:\/\//, '')) : null,
      ...(s.phase === 'lobby' ? lobby() : s.phase === 'question' ? question() : s.phase === 'reveal' ? reveal() : done()),
      s.phase === 'lobby' || s.phase === 'done' ? null : h('details.game-menu', h('summary', 'Rennen abbrechen'),
        h('p.hint', 'Der Raum bleibt bestehen; alle Fahrer landen wieder in der Lobby.'),
        h('button.btn', { type: 'button', onclick: () => commit(backToLobby(ses.state)) }, 'Zurück in die Lobby')),
    ];
    el.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
  }

  const onKey = (e: KeyboardEvent): void => { if (!(e.target instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey) key(e); };
  document.addEventListener('keydown', onKey);
  open();
  draw();
  return {
    el,
    dispose: () => {
      clearInterval(loop); timer?.stop(); awake(); document.removeEventListener('keydown', onKey);
      for (const conn of connOf.keys()) send(conn, { t: 'closed' });
      transport?.close();
    },
  };
}
