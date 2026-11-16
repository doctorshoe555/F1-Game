// Handy-Ansicht: beitreten, antworten, Ergebnis sehen. Zeigt nur, was der Host schickt.
import { PLAYER_COLORS } from '../core/colors';
import type { JAction, JScreen, JView } from '../core/jeopardy';
import type { PlayerView, PublicQuestion, Screen } from '../core/race';
import type { Answer, Dealt, Question } from '../core/types';
import { estimateOffset, type PingSample } from '../net/clock';
import { cleanRoomCode, type ClientMsg, type HostMsg, type RejectReason } from '../net/protocol';
import { createClient, netKind, type ClientStatus, type ClientTransport } from '../net/transport';
import * as store from '../storage/store';
import { fmt, h, type View } from './dom';
import { stopwatch } from './icons';
import { parseNumber, questionHead, questionInput } from './questionView';
import { sfx, vibrate } from './sound';
import { keepAwake, timerBar } from './timer';

// Im Testmodus „lokal“ teilen sich alle Tabs denselben Speicher. Damit trotzdem jeder Tab ein eigener
// Spieler ist, liegen Profil und Token dort je Tab (sessionStorage) statt je Gerät.
const perTab = netKind() === 'local';
function load<T>(key: string, fallback: T): T {
  if (!perTab) return store.load(key, fallback);
  try { const raw = sessionStorage.getItem('boxenfunk.' + key); return raw == null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
}
function save(key: string, value: unknown): void {
  if (!perTab) { store.save(key, value); return; }
  try { sessionStorage.setItem('boxenfunk.' + key, JSON.stringify(value)); } catch { /* egal */ }
}
function remove(key: string): void {
  if (!perTab) { store.remove(key); return; }
  try { sessionStorage.removeItem('boxenfunk.' + key); } catch { /* egal */ }
}

export const AVATARS = ['🏎️', '🏁', '🦁', '🐂', '🐎', '🦊', '🚀', '🧊', '🍾', '🔧', '🎧', '🐢'];
interface Profile { name: string; color: string; avatar: string }
const hex = (id: string): string => (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;
const REJECT: Record<RejectReason, string> = {
  'name-taken': 'Dieser Name ist im Raum schon vergeben und gerade verbunden. Nimm bitte einen anderen.',
  full: 'Der Raum ist voll (12 Fahrer).',
  'bad-name': 'Bitte gib einen Namen ein.',
};

/** Baut aus der öffentlichen Frage ein Objekt, das die normale Eingabe-Ansicht versteht (ohne Lösung). */
function asDealt(q: PublicQuestion): Dealt {
  return { q: { ...q, tags: [], explanation: '', source: '', generated: false, lastVerified: '' } as unknown as Question, shown: q.shown, correctIndex: -1 };
}

export function playerJoinView(arg?: string): View {
  let code = cleanRoomCode(arg ?? '');
  const profile: Profile = { name: '', color: PLAYER_COLORS[0].id, avatar: AVATARS[0], ...load<Partial<Profile>>('join.profile', {}) };
  const el = h('main.page.phone');
  let transport: ClientTransport | null = null;
  let net: ClientStatus | null = null;
  let view: PlayerView | JView | null = null;
  type AnyScreen = Screen | JScreen;
  let error = '';
  let lastScreen = '';
  let sentFor = -1;                 // Index der Frage, für die schon geantwortet wurde (sofortige Rückmeldung)
  let offset = 0;                   // Host-Uhr minus eigene Uhr
  let samples: PingSample[] = [];
  let pingTimer = 0;
  let timer: ReturnType<typeof timerBar> | null = null;
  let awake: (() => void) | null = null;
  const hostNow = (): number => Date.now() + offset;
  const tokenKey = (): string => `join.token.${code}`;
  const send = (m: ClientMsg): void => transport?.send(m);
  const actJ = (a: JAction): void => { send({ t: 'act', a }); lastScreen = ''; };
  let sentKey = '';                 // verhindert, dass eine schon abgeschickte Jeopardy-Eingabe noch einmal angeboten wird

  function leave(clearToken: boolean): void {
    send({ t: 'bye' });
    transport?.close(); transport = null; net = null; view = null; lastScreen = '';
    clearTimeout(pingTimer); timer?.stop(); awake?.(); awake = null;
    if (clearToken) remove(tokenKey());
  }
  function ping(): void {
    clearTimeout(pingTimer);
    send({ t: 'ping', c: Date.now() });
    // anfangs dicht messen, danach alle 2 s als Lebenszeichen
    pingTimer = window.setTimeout(ping, samples.length < 5 ? 300 : 2000);
  }
  function connect(): void {
    error = '';
    save('join.profile', profile);
    awake ??= keepAwake();
    transport?.close();
    transport = createClient(code, {
      status(st) {
        net = st;
        if (st.s === 'open') { samples = []; send({ t: 'hello', token: load<string | undefined>(tokenKey(), undefined), ...profile }); ping(); }
        draw();
      },
      message(raw) {
        const m = raw as HostMsg;
        if (!m || typeof m.t !== 'string') return;
        if (m.t === 'welcome') save(tokenKey(), m.token);
        else if (m.t === 'reject') { error = REJECT[m.reason] ?? 'Beitritt abgelehnt.'; leave(true); draw(); }
        else if (m.t === 'pong') {
          samples = [...samples.slice(-9), { sentAt: m.c, receivedAt: Date.now(), hostTime: m.h }];
          offset = estimateOffset(samples)?.offset ?? offset;
        } else if (m.t === 'view') { view = m.v; draw(); }
        else if (m.t === 'closed') { net = { s: 'retrying', reason: 'lost' }; draw(); }
      },
    });
  }

  // ---------- Formular ----------
  function form(): HTMLElement[] {
    const codeIn = h('input.code-input', { type: 'text', value: code, maxLength: 4, placeholder: 'ABCD', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, id: 'join-code', oninput: () => { code = cleanRoomCode(codeIn.value); codeIn.value = code; } });
    const nameIn = h('input', { type: 'text', value: profile.name, maxLength: 16, placeholder: 'Dein Name', autocomplete: 'nickname', id: 'join-name', oninput: () => { profile.name = nameIn.value; } });
    return [
      h('h1', 'Mitfahren'),
      h('form', { onsubmit: (e: Event) => { e.preventDefault(); if (code.length !== 4) { error = 'Der Raum-Code hat vier Buchstaben.'; draw(); return; } if (!profile.name.trim()) { error = REJECT['bad-name']; draw(); return; } connect(); draw(); } },
        h('div.field', h('label.legend', { for: 'join-code' }, 'Raum-Code'), codeIn),
        h('div.field', h('label.legend', { for: 'join-name' }, 'Dein Name'), nameIn,
          h('p.hint', 'Mit demselben Namen kommst du nach einem Verbindungsabbruch wieder ins Spiel und behältst deine Punkte.')),
        h('fieldset.field', h('legend', 'Avatar'), h('div.choices', AVATARS.map((a) =>
          h('label.choice.emoji', h('input', { type: 'radio', name: 'avatar', checked: a === profile.avatar, onchange: () => { profile.avatar = a; } }), h('span', a))))),
        h('fieldset.field', h('legend', 'Teamfarbe'), h('div.choices', PLAYER_COLORS.map((c) =>
          h('label.choice', h('input', { type: 'radio', name: 'color', checked: c.id === profile.color, onchange: () => { profile.color = c.id; } }),
            h('span', h('i.swatch', { style: `background:${c.hex}` }), c.name))))),
        h('p.form-error', { role: 'alert' }, error),
        h('button.btn.primary.big', { type: 'submit' }, 'Beitreten')),
    ];
  }

  // ---------- Spiel ----------
  // ---------- Jeopardy ----------
  function wagerForm(min: number, max: number, onSet: (amount: number) => void): HTMLElement {
    const input = h('input.num', { type: 'text', inputMode: 'numeric', autocomplete: 'off', placeholder: `${min}–${max}`, 'aria-label': `Einsatz von ${min} bis ${max}` });
    const err = h('p.form-error', { role: 'alert' });
    const go = (v: number): void => { if (!Number.isFinite(v) || v < min || v > max) { err.textContent = `Bitte ${min} bis ${max} eingeben.`; return; } onSet(Math.round(v)); };
    return h('form.wager', { onsubmit: (e: Event) => { e.preventDefault(); go(parseNumber(input.value)); } },
      h('div.estimate-row', input, h('span.unit', 'Punkte')), err, h('button.btn.primary.big', { type: 'submit' }, 'Einsatz setzen'),
      h('div.actions', h('button.btn', { type: 'button', onclick: () => go(min) }, `Minimum (${min})`), h('button.btn', { type: 'button', onclick: () => go(max) }, `Alles (${fmt(max)})`)));
  }
  function textForm(asQuestion: boolean, onText: (text: string) => void): HTMLElement {
    const input = h('input', { type: 'text', autocomplete: 'off', maxLength: 80, placeholder: asQuestion ? 'Wer oder was ist …?' : 'Antwort eintippen', 'aria-label': 'Antwort' });
    return h('form', { onsubmit: (e: Event) => { e.preventDefault(); if (input.value.trim()) onText(input.value); } }, input, h('button.btn.primary.big', { type: 'submit' }, 'Antworten'));
  }
  const waitBox = (emoji: string, title: string, text: string): HTMLElement => h('section.wait', h('p.big-emoji', emoji), h('h1', title), h('p.lead', text));
  /** Eingabe nur einmal anbieten: Nach dem Abschicken sofort Wartebildschirm zeigen, bis der Host bestätigt. */
  const once = (k: string, input: () => HTMLElement[], waiting: HTMLElement): HTMLElement[] => (sentKey === k ? [waiting] : input());
  const sent = (k: string, a: JAction): void => { sentKey = k; vibrate(30); actJ(a); draw(); };

  function jbody(s: JScreen): HTMLElement[] | null {
    switch (s.k) {
      case 'jboard':
        if (!s.you) return [waitBox('🗺️', `${s.chooser} wählt`, `Runde ${s.round} – gleich wird gebuzzert.`)];
        return [h('p.kicker', `Runde ${s.round} – du wählst`), h('div.jboard.mini', { style: `--cols:${s.cats.length}` }, s.cats.map((cat, ci) => h('div.jcol',
          h('div.jcat', { title: cat.title }, h('span', { 'aria-hidden': 'true' }, cat.emoji), h('b', cat.title)),
          cat.cells.map((x, ri) => (x.used ? h('div.jcell.used') : h('button.jcell', { type: 'button', 'aria-label': `${cat.title} für ${x.value}`, onclick: () => { vibrate(30); actJ({ k: 'pick', ci, ri }); } }, String(x.value)))))))];
      case 'jwager':
        if (!s.you) return [waitBox('🚨', 'Safety Car!', `${s.who} spielt allein und setzt gerade.`)];
        return once(`w${s.category}${s.max}`, () => [h('section.safety', h('h1', 'Safety Car!'), h('p.lead', `Kategorie „${s.category}“. Du spielst allein – wie viel riskierst du?`)),
          wagerForm(s.min, s.max, (amount) => sent(`w${s.category}${s.max}`, { k: 'wager', amount }))], waitBox('🚨', 'Einsatz gesetzt', 'Gleich kommt deine Frage.'));
      case 'jbuzz': {
        if (s.locked) return [waitBox('🔒', 'Du bist raus', 'Für dieses Feld darfst du nicht mehr buzzern.')];
        const btn = h('button.buzz-btn', { type: 'button' }, 'Warten …');
        let raf = 0;
        const upd = (): void => {
          const now = hostNow();
          const blocked = s.blockedUntil > now;
          const open = now >= s.openAt && !blocked;
          btn.className = `buzz-btn${s.buzzed ? ' done' : open ? ' open' : blocked ? ' blocked' : ''}`;
          btn.textContent = s.buzzed ? 'Gebuzzert!' : blocked ? 'Zu früh! Gesperrt …' : open ? 'BUZZ!' : 'Warten …';
          if (!s.buzzed && btn.isConnected !== false) raf = requestAnimationFrame(upd);
        };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (s.buzzed) return; vibrate(80); sfx('light'); send({ t: 'act', a: { k: 'buzz', at: hostNow() } }); });
        btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !s.buzzed) send({ t: 'act', a: { k: 'buzz', at: hostNow() } }); });
        setTimeout(upd, 0);
        timer = { el: btn, stop: () => cancelAnimationFrame(raf) };
        return [h('p.kicker', `${s.category} · ${s.value}`), h('p.buzz-q', s.question), btn, h('p.hint', 'Erst lesen, dann drücken: Wer zu früh buzzert, ist kurz gesperrt.')];
      }
      case 'janswer':
        if (!s.you) return [waitBox('🎤', `${s.who} ist dran`, s.question)];
        if (s.input === 'voice' || !s.q) return [waitBox('🎤', 'Du bist dran!', `Sag die Antwort laut${s.asQuestion ? ' – am besten als Frage: „Wer oder was ist …?“' : ''}. Der Spielleiter wertet.`)];
        return once(`a${s.q.id}`, () => {
          if (s.deadline) timer = timerBar(s.deadline, s.totalMs, hostNow);
          const d = asDealt(s.q!);
          const parts: HTMLElement[] = [h('p.kicker', 'Du bist dran!'), timer?.el ?? h('div')];
          if (s.input === 'text') return [...parts, h('h2.q-text', s.question), textForm(s.asQuestion, (text) => sent(`a${s.q!.id}`, { k: 'answer', a: { kind: 'text', text } }))];
          return [...parts, questionInput(d, (a: Answer) => sent(`a${s.q!.id}`, { k: 'answer', a })).el];
        }, waitBox('📻', 'Antwort ist drin', 'Mal sehen …'));
      case 'jallplay':
        if (s.answered) return [waitBox('📻', 'Schätzung ist drin', 'Warten auf die anderen …')];
        return once(`e${s.q.id}`, () => {
          if (s.deadline) timer = timerBar(s.deadline, s.totalMs, hostNow);
          return [h('p.kicker', `Schätzfrage für alle · ${s.value}`), timer?.el ?? h('div'),
            questionInput(asDealt(s.q), (a: Answer) => { if (a?.kind === 'number') sent(`e${s.q.id}`, { k: 'estimate', value: a.value }); }).el];
        }, waitBox('📻', 'Schätzung ist drin', 'Warten auf die anderen …'));
      case 'jreveal':
        return [s.delta === null ? h('div.verdict.part', h('strong', 'Auflösung'), h('span', 'du warst nicht dran')) : h(`div.verdict.${s.delta > 0 ? 'good' : s.delta < 0 ? 'bad' : 'part'}`, { role: 'status' }, h('strong', s.delta > 0 ? '✓ Punkte!' : s.delta < 0 ? '✗ Abzug' : '± 0'), h('span', `${s.delta > 0 ? '+' : ''}${fmt(s.delta)} Punkte`)),
          h('div.solution', h('span', 'Richtig ist'), h('strong', s.solution)), h('ul.pills', s.lines.map((l) => h('li', l))), h('aside.explain', h('b', 'Boxenfunk: '), s.explanation)];
      case 'jround': return [waitBox('🛞', 'Boxenstopp', `Runde ${s.round} ist durch. Gleich geht es mit doppelten Werten weiter.`)];
      case 'jfwager':
        if (s.done) return [waitBox('🤫', 'Einsatz gesetzt', 'Geheim, versteht sich. Warten auf die anderen …')];
        return once('fw', () => {
          if (s.deadline) timer = timerBar(s.deadline, s.totalMs, hostNow);
          return [h('p.kicker', 'Finale Runde'), h('h1', s.category), h('p.lead', 'Du kennst nur die Kategorie. Wie viel setzt du – geheim?'), timer?.el ?? h('div'), wagerForm(0, s.max, (amount) => sent('fw', { k: 'finalWager', amount }))];
        }, waitBox('🤫', 'Einsatz gesetzt', 'Warten auf die anderen …'));
      case 'jfanswer':
        if (s.done) return [waitBox('📻', 'Antwort ist drin', 'Warten auf die anderen …')];
        return once('fa', () => {
          if (s.deadline) timer = timerBar(s.deadline, s.totalMs, hostNow);
          const d = asDealt(s.q);
          const parts: HTMLElement[] = [h('p.kicker', 'Finale Runde'), timer?.el ?? h('div')];
          if (s.input === 'text') return [...parts, h('h2.q-text', s.q.question), textForm(s.asQuestion, (text) => sent('fa', { k: 'finalAnswer', a: { kind: 'text', text } }))];
          return [...parts, questionInput(d, (a: Answer) => sent('fa', { k: 'finalAnswer', a })).el];
        }, waitBox('📻', 'Antwort ist drin', 'Warten auf die anderen …'));
      case 'jfwait': return [waitBox('⚖️', 'Der Spielleiter wertet', 'Gleich werden die Einsätze aufgedeckt.')];
      case 'jfreveal':
        return [h(`div.verdict.${s.ok ? 'good' : 'bad'}`, { role: 'status' }, h('strong', s.ok ? '✓ Richtig' : '✗ Falsch'), h('span', `${s.delta > 0 ? '+' : ''}${fmt(s.delta)} Punkte`)),
          h('div.solution', h('span', 'Richtig ist'), h('strong', s.solution)), h('aside.explain', h('b', 'Boxenfunk: '), s.explanation)];
      default: return null;
    }
  }

  function body(s: AnyScreen): HTMLElement[] {
    const j = jbody(s as JScreen);
    if (j) return j;
    return raceBody(s as Screen);
  }
  function raceBody(s: Screen): HTMLElement[] {
    if (s.k === 'lobby') return [h('section.wait', h('p.big-emoji', view!.you.avatar), h('h1', 'Du bist drin!'), h('p.lead', 'Schau auf den großen Bildschirm – gleich geht es los.'))];
    if (s.k === 'done') {
      const won = s.winners.includes(view!.you.name);
      return [h('section.wait', h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Zielflagge'), h('h1', won ? 'Sieg!' : `Platz ${view!.you.place}`),
        h('p.lead', `${fmt(view!.you.score)} Punkte. ${won ? 'Champagner!' : `Gewonnen hat ${s.winners.join(' & ')}.`}`), h('p.hint', 'Bleib dran – vielleicht gibt es eine Revanche.'))];
    }
    const count = h('p.count', h('small', 'Frage'), ` ${s.index + 1}`, h('small', `/${s.total}`));
    if (s.k === 'question') {
      if (s.answered || sentFor === s.index) return [count, h('section.wait', h('p.big-emoji', '📻'), h('h1', 'Antwort ist drin'), h('p.lead', 'Warten auf die anderen …'))];
      const d = asDealt(s.q);
      const input = questionInput(d, (a: Answer) => { sentFor = s.index; send({ t: 'answer', index: s.index, a, at: hostNow() }); vibrate(30); lastScreen = ''; draw(); });
      if (s.deadline) timer = timerBar(s.deadline, s.totalMs, hostNow);
      return [count, timer?.el ?? h('div'), questionHead(d), input.el];
    }
    const st = { right: ['good', '✓ Richtig'], partial: ['part', '≈ Knapp daneben'], wrong: ['bad', '✗ Leider falsch'], none: ['bad', '⏱ Keine Antwort'] }[s.status];
    return [count,
      h(`div.verdict.${st[0]}`, { role: 'status' }, h('strong', st[1]), h('span', s.gained > 0 ? `+${fmt(s.gained)} Punkte` : 'keine Punkte')),
      s.fastest ? h('div.fastest', stopwatch(), h('strong', 'Schnellste Runde'), h('span', 'das warst du')) : h('div'),
      s.closest ? h('p.saved', 'Am nächsten dran – Bonus kassiert.') : h('div'),
      h('div.solution', h('span', 'Richtig ist'), h('strong', s.solution)),
      h('aside.explain', h('b', 'Boxenfunk: '), s.explanation),
      h('p.hint', s.last ? 'Gleich folgt die Siegerehrung.' : 'Die nächste Frage startet der Host.')];
  }

  function draw(): void {
    if (!transport) { timer?.stop(); timer = null; el.replaceChildren(h('a.back', { href: '#/' }, '← Startseite'), ...form()); error = ''; return; }
    const st = net;
    const banner = !st || st.s === 'open' ? null : h('p.notice', { role: 'status' },
      st.s === 'connecting' ? 'Verbinde …' : st.reason === 'no-room' ? `Raum ${code} nicht gefunden. Stimmt der Code und läuft der Host? Ich versuche es weiter …` : 'Verbindung verloren – verbinde neu … Deine Punkte bleiben erhalten.');
    const leaveBtn = h('button.tool', { type: 'button', onclick: () => { leave(true); draw(); } }, 'Raum verlassen');
    if (!view) { el.replaceChildren(...[banner ?? h('p.notice', { role: 'status' }, 'Melde an …'), h('p.hint', `Raum ${code}`), leaveBtn]); return; }
    const you = view.you;
    const head = h('header.you', { style: `--team:${hex(you.color)}` }, h('span.avatar', { 'aria-hidden': 'true' }, you.avatar), h('span.you-name', you.name),
      h('span.you-place', { 'aria-label': `Platz ${you.place} von ${view.players}` }, `P${you.place}`), h('span.score', fmt(you.score), h('small', ' Pkt.')));
    // Den Hauptteil nur neu aufbauen, wenn sich der Bildschirm wirklich ändert – sonst ginge eine halb getippte Eingabe verloren.
    const sig = JSON.stringify(view.screen);
    const main = el.querySelector<HTMLElement>('.phone-body');
    if (sig !== lastScreen || !main) {
      const prev = lastScreen ? (JSON.parse(lastScreen) as AnyScreen) : null;
      const s = view.screen;
      timer?.stop(); timer = null;
      if (s.k === 'question' && !s.answered && (prev?.k !== 'question' || prev.index !== s.index)) { vibrate(60); sfx('go'); }
      if (s.k === 'reveal' && prev?.k !== 'reveal') { vibrate(s.status === 'right' ? [40, 40, 40] : 200); sfx(s.fastest ? 'purple' : s.status === 'right' ? 'ok' : 'bad'); }
      if (s.k === 'done' && prev?.k !== 'done') sfx('finish');
      if (prev && s.k !== prev.k) {
        if (s.k === 'jbuzz') vibrate(40);
        if (s.k === 'janswer' && s.you) { vibrate([60, 40, 60]); sfx('go'); }
        if ((s.k === 'jboard' && s.you) || (s.k === 'jwager' && s.you) || s.k === 'jfwager' || s.k === 'jfanswer' || s.k === 'jallplay') { vibrate(60); sfx('light'); }
        if (s.k === 'jreveal' && s.delta !== null) { vibrate(s.delta > 0 ? [40, 40, 40] : 200); sfx(s.delta > 0 ? 'ok' : 'bad'); }
        if (s.k === 'jfreveal') { vibrate(s.ok ? [40, 40, 40] : 200); sfx(s.ok ? 'ok' : 'bad'); }
        // neue Phase → frühere „schon abgeschickt“-Merker sind erledigt
        if (!['janswer', 'jallplay', 'jfwager', 'jfanswer', 'jwager'].includes(s.k)) sentKey = '';
      }
      lastScreen = sig;
      el.replaceChildren(...[banner, head, h('div.phone-body', body(s)), h('footer.phone-foot', h('span', `Raum ${code}`), leaveBtn)].filter((n): n is HTMLElement => n !== null));
      window.scrollTo(0, 0);
    } else {
      el.querySelector('.you')?.replaceWith(head);
      const old = el.querySelector('.notice');
      if (banner && old) old.replaceWith(banner); else if (banner) el.prepend(banner); else old?.remove();
    }
  }

  // Bekannter Raum (z. B. nach Neuladen): ohne Umweg über das Formular wieder einsteigen.
  if (code.length === 4 && profile.name.trim() && load<string | null>(tokenKey(), null)) connect();
  draw();
  const onVisible = (): void => { if (document.visibilityState === 'visible' && transport && net?.s === 'open') ping(); };
  document.addEventListener('visibilitychange', onVisible);
  return { el, dispose: () => { document.removeEventListener('visibilitychange', onVisible); leave(false); } };
}
