// Großer Bildschirm für Grand Prix Jeopardy – für den Host (Handys buzzern) und für das Spiel an einem Gerät.
import { PLAYER_COLORS } from '../core/colors';
import { CATEGORIES } from '../core/questions';
import {
  cellOf, HOST, maxFinalWager, maxSafetyWager, MIN_WAGER, phrase, saidText,
  type JAction, type JeopardySettings, type JeopardyState, type JHostAction,
} from '../core/jeopardy';
import { publicQuestion } from '../core/race';
import { rankPlayers, type NetPlayer } from '../core/roster';
import { fmtEstimate, solutionText } from '../core/scoring';
import type { Answer, Dealt, Question } from '../core/types';
import { fmt, h } from './dom';
import { questionInput, parseNumber } from './questionView';
import { radios } from './classicSetup';
import { timerBar } from './timer';

const hex = (id: string): string => (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;

export interface JCtx {
  s: JeopardyState;
  act(id: string, a: JAction): void;
  host(a: JHostAction): void;
  redraw(): void;
  /** Merkt sich über Neuzeichnungen hinweg, wer bei verdeckten Eingaben gerade das Gerät hat (nur lokal). */
  ui: { ready: string | null };
  /** Schaltflächen für die Siegerehrung (Revanche, Startseite …) */
  exits: HTMLElement[];
}
export interface JRender { nodes: HTMLElement[]; key: (e: KeyboardEvent) => void; stop: () => void }

/** Einstellungsfelder für die Lobby bzw. das lokale Setup. */
export function jeopardyFields(set: JeopardySettings, redraw: () => void, local: boolean): HTMLElement[] {
  const on = <K extends keyof JeopardySettings>(k: K) => (v: JeopardySettings[K]): void => { set[k] = v; redraw(); };
  return [
    radios('jcat', 'Kategorien pro Runde', [{ value: 5, title: '5' }, { value: 6, title: '6' }], set.categories, on('categories')),
    radios('jrnd', 'Runden', [{ value: 1, title: 'Eine Runde', hint: '100–500' }, { value: 2, title: 'Zwei Runden', hint: 'zweite mit doppelten Werten' }], set.rounds, on('rounds')),
    radios('jfin', 'Finale Runde', [{ value: 1, title: 'Mit Finale', hint: 'alle setzen geheim' }, { value: 0, title: 'Ohne Finale' }], set.final ? 1 : 0, (v) => { set.final = v === 1; redraw(); }),
    radios('jjudge', 'Antworten', [
      { value: 'mc', title: 'Auswahl', hint: local ? 'Antwort antippen' : 'Antwort am Handy antippen' },
      { value: 'text', title: 'Freitext', hint: 'eintippen, automatisch geprüft' },
      { value: 'gm', title: 'Spielleiter', hint: 'laut antworten, Host wertet per Klick' },
    ], set.judge, on('judge')),
    radios('jgag', 'Gag: Antwort als Frage formulieren', [{ value: 0, title: 'Aus' }, { value: 1, title: 'An', hint: '„Wer oder was ist …?“ – nur fürs Flair' }], set.asQuestion ? 1 : 0, (v) => { set.asQuestion = v === 1; redraw(); }),
  ];
}

const asDealt = (d: Dealt): Dealt => { const p = publicQuestion(d); return { q: { ...p, tags: [], explanation: '', source: '', generated: false, lastVerified: '' } as unknown as Question, shown: p.shown, correctIndex: -1 }; };

export function jeopardyScreen(ctx: JCtx): JRender {
  const { s, act, host } = ctx;
  const stops: (() => void)[] = [];
  let key: (e: KeyboardEvent) => void = () => {};
  const name = (id: string | null): string => s.players.find((p) => p.id === id)?.name ?? 'Host';
  const pl = (id: string | null): NetPlayer | undefined => s.players.find((p) => p.id === id);
  const c = s.cur;
  const cell = cellOf(s);
  const cat = c ? s.board[c.ci] : null;
  const enterKey = (btn: HTMLButtonElement): void => { key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } }; };
  const timer = (deadline: number | null, total: number): HTMLElement | null => {
    if (!deadline) return null;
    const t = timerBar(deadline, total); stops.push(t.stop); return t.el;
  };

  /** Punktetafel: alle Spieler mit Stand; hebt Wähler bzw. aktiven Spieler hervor. */
  function podiums(active: string | null, marks: Record<string, string> = {}): HTMLElement {
    return h('ul.podiums', s.players.map((p, i) => h(`li${p.id === active ? '.active' : ''}${p.connected ? '' : '.off'}${c?.locked.includes(p.id) ? '.locked' : ''}`, { style: `--team:${hex(p.color)}` },
      h('span.pod-name', s.local ? h('kbd', String(i + 1)) : h('span.avatar', { 'aria-hidden': 'true' }, p.avatar), ' ', p.name),
      h(p.score < 0 ? 'strong.neg' : 'strong', fmt(p.score)),
      h('em', marks[p.id] ?? (!p.connected ? 'getrennt' : c?.locked.includes(p.id) ? 'gesperrt' : '')))));
  }
  const clueHead = (): HTMLElement => h('header.clue-head', h('span.q-cat', `${cat!.emoji} ${cat!.title}`), h('span.clue-value', c!.safety ? `Safety Car · Einsatz ${fmt(c!.stake)}` : fmt(c!.value)));
  const clueBody = (d: Dealt, showItems: boolean): HTMLElement[] => [
    h('h1.q-text', d.q.question),
    d.q.image ? h('figure.q-image', h('img', { src: d.q.image.url, alt: 'Bild zur Frage' })) : h('div'),
    showItems && d.q.type === 'order' ? h('ul.pills', d.shown.map((o) => h('li', o))) : h('div'),
  ];
  const skipBtn = (label: string): HTMLElement => h('button.btn', { type: 'button', onclick: () => host({ k: 'skip' }) }, label);

  /** Verdeckte Eingabe reihum an einem Gerät: erst Gerät übergeben, dann eingeben. */
  function privateTurn(pending: NetPlayer[], what: string, input: (p: NetPlayer) => HTMLElement): HTMLElement {
    const p = pending[0];
    if (!p) return h('p.hint', 'Alle fertig …');
    if (ctx.ui.ready !== p.id) {
      const go = h('button.btn.primary.big', { type: 'button', onclick: () => { ctx.ui.ready = p.id; ctx.redraw(); } }, 'Bereit – die anderen schauen weg');
      enterKey(go);
      return h('section.handover', { style: `--team:${hex(p.color)}` }, h('p.kicker', `${what}: Gerät an`), h('h1', p.name), h('p.hint', `Noch ${pending.length} von ${s.players.length} offen.`), go);
    }
    return h('section.handover.private', { style: `--team:${hex(p.color)}` }, h('p.kicker', `${p.name} – ${what}`), input(p));
  }
  function wagerForm(min: number, max: number, submit: (amount: number) => void): HTMLElement {
    const input = h('input.num', { type: 'text', inputMode: 'numeric', autocomplete: 'off', placeholder: `${min}–${max}`, 'aria-label': `Einsatz von ${min} bis ${max}` });
    const err = h('p.form-error', { role: 'alert' });
    const go = (v: number): void => { if (!Number.isFinite(v) || v < min || v > max) { err.textContent = `Bitte einen Einsatz von ${min} bis ${max} eingeben.`; return; } submit(Math.round(v)); };
    setTimeout(() => input.focus(), 30);
    return h('form.wager', { onsubmit: (e: Event) => { e.preventDefault(); go(parseNumber(input.value)); } },
      h('div.estimate-row', input, h('span.unit', 'Punkte')), err,
      h('div.actions', h('button.btn.primary', { type: 'submit' }, 'Einsatz setzen'),
        h('button.btn', { type: 'button', onclick: () => go(min) }, `Minimum (${min})`), h('button.btn', { type: 'button', onclick: () => go(max) }, `Alles (${fmt(max)})`)));
  }
  function textForm(submit: (text: string) => void): HTMLElement {
    const input = h('input', { type: 'text', autocomplete: 'off', maxLength: 80, placeholder: s.settings.asQuestion ? 'Wer oder was ist …?' : 'Antwort eintippen', 'aria-label': 'Antwort' });
    setTimeout(() => input.focus(), 30);
    return h('form.inline', { onsubmit: (e: Event) => { e.preventDefault(); if (input.value.trim()) submit(input.value); } }, input, h('button.btn.primary', { type: 'submit' }, 'Antworten'));
  }
  const gmPeek = (d: Dealt): HTMLElement => h('details.peek', h('summary', 'Lösung für den Spielleiter einblenden'), h('p', h('strong', solutionText(d))));

  function board(): HTMLElement[] {
    const chooser = pl(s.chooser);
    return [
      h('header.clue-head', h('span.q-cat', `Runde ${s.round}${s.round > 1 ? ' – doppelte Werte' : ''}`),
        h('span.chooser', chooser ? h('i.swatch', { style: `background:${hex(chooser.color)}` }) : null, ` ${name(s.chooser)} wählt`)),
      h('div.jboard', { style: `--cols:${s.board.length}`, role: 'grid', 'aria-label': 'Jeopardy-Board' },
        s.board.map((catx, ci) => h('div.jcol', { role: 'row' },
          h('div.jcat', { role: 'columnheader' }, h('span', { 'aria-hidden': 'true' }, catx.emoji), h('b', catx.title)),
          catx.cells.map((x, ri) => (x.used ? h('div.jcell.used', { role: 'gridcell', 'aria-label': `${catx.title} ${x.value}: gespielt` })
            : h('button.jcell', { type: 'button', role: 'gridcell', 'aria-label': `${catx.title} für ${x.value}`, onclick: () => act(HOST, { k: 'pick', ci, ri }) }, String(x.value))))))),
      podiums(s.chooser),
      h('p.hint', s.local ? 'Feld antippen, das der Wähler nennt.' : `${name(s.chooser)} wählt auf dem Handy – der Host kann auch hier ein Feld anklicken.`),
    ];
  }

  function wager(): HTMLElement[] {
    const id = c!.buzzer!;
    return [clueHead(), h('section.safety', h('div.safety-lights', { 'aria-hidden': 'true' }, h('i'), h('i')), h('h1', 'Safety Car!'),
      h('p.lead', `${name(id)} spielt dieses Feld allein und bestimmt den Einsatz selbst.`)),
      s.local ? wagerForm(MIN_WAGER, maxSafetyWager(s, id), (amount) => act(id, { k: 'wager', amount })) : h('p.lead', `${name(id)} setzt gerade auf dem Handy …`),
      podiums(id), h('div.actions', skipBtn('Feld überspringen'))];
  }

  function buzz(): HTMLElement[] {
    const d = cell!.d;
    const lamp = h('div.buzz-state', { role: 'status' });
    let raf = 0;
    const upd = (): void => {
      const open = Date.now() >= c!.openAt;
      lamp.className = `buzz-state${open ? ' open' : ''}`;
      lamp.textContent = open ? (c!.pending.length ? 'Gebuzzert …' : 'Buzzer frei!') : 'Buzzer gesperrt – erst lesen';
      if (!open) raf = requestAnimationFrame(upd);
    };
    upd(); stops.push(() => cancelAnimationFrame(raf));
    if (s.local) key = (e) => { const i = '12345678'.indexOf(e.key); const p = i >= 0 ? s.players[i] : undefined; if (p) act(p.id, { k: 'buzz', at: Date.now() }); };
    return [clueHead(), ...clueBody(d, true), lamp, timer(c!.deadline, s.settings.buzzSeconds * 1000) ?? h('div'),
      s.local ? h('div.buzzers', s.players.map((p, i) => h('button.buzzer', { type: 'button', disabled: c!.locked.includes(p.id), style: `--team:${hex(p.color)}`, onclick: () => act(p.id, { k: 'buzz', at: Date.now() }) }, h('kbd', String(i + 1)), p.name))) : h('div'),
      podiums(null, Object.fromEntries(c!.log.map((l) => [l.id, `${l.delta}`]))),
      h('div.actions', skipBtn('Niemand weiß es – auflösen'))];
  }

  function answer(): HTMLElement[] {
    const d = cell!.d;
    const id = c!.buzzer!;
    const p = pl(id)!;
    let control: HTMLElement;
    if (c!.input === 'voice') {
      const yes = h('button.btn.good', { type: 'button', onclick: () => host({ k: 'judge', ok: true }) }, '✓ Richtig');
      const no = h('button.btn.bad', { type: 'button', onclick: () => host({ k: 'judge', ok: false }) }, '✗ Falsch');
      key = (e) => { if (e.key.toLowerCase() === 'r') yes.click(); else if (e.key.toLowerCase() === 'f') no.click(); };
      control = h('div', h('p.lead', `${p.name} antwortet laut${s.settings.asQuestion ? ' – als Frage formuliert, versteht sich' : ''}. Spielleiter wertet (Tasten R / F):`), h('div.actions.judge', yes, no), gmPeek(d));
    } else if (!s.local) {
      control = h('p.lead', `${p.name} antwortet auf dem Handy …`);
    } else if (c!.input === 'text') {
      control = textForm((text) => act(id, { k: 'answer', a: { kind: 'text', text } }));
    } else {
      const input = questionInput(asDealt(d), (a: Answer) => act(id, { k: 'answer', a }));
      key = (e) => { if (!(e.target instanceof HTMLInputElement)) input.key(e); };
      control = h('div.local-answer', [...input.el.children].filter((n) => !n.matches('.q-text, .q-image')) as HTMLElement[]);
    }
    return [clueHead(), h('div.on-turn', { style: `--team:${hex(p.color)}`, role: 'status' }, h('span', 'Am Zug'), h('strong', p.name)),
      ...clueBody(d, c!.input === 'voice' || !s.local), timer(c!.deadline, c!.input === 'text' ? 30_000 : s.settings.answerSeconds * 1000) ?? h('div'), control,
      h('div.actions', skipBtn('Als falsch werten'))];
  }

  function allplay(): HTMLElement[] {
    const d = cell!.d;
    const pending = s.players.filter((p) => !(p.id in c!.estimates));
    return [clueHead(), h('p.kicker', 'Schätzfrage – alle spielen, die beste Schätzung bekommt die Punkte'), ...clueBody(d, false),
      timer(c!.deadline, 30_000) ?? h('div'),
      s.local ? privateTurn(pending, 'Schätzung', (p) => {
        const input = questionInput(asDealt(d), (a: Answer) => { ctx.ui.ready = null; if (a?.kind === 'number') act(p.id, { k: 'estimate', value: a.value }); });
        return h('div', [...input.el.children].filter((n) => !n.matches('.q-text, .q-image')) as HTMLElement[]);
      }) : podiums(null, Object.fromEntries(s.players.map((p) => [p.id, p.id in c!.estimates ? '✓ geschätzt' : p.connected ? '…' : 'getrennt']))),
      h('div.actions', skipBtn('Jetzt auflösen'))];
  }

  function reveal(): HTMLElement[] {
    const d = cell!.d;
    const next = h('button.btn.primary.big', { type: 'button', onclick: () => host({ k: 'continue' }) }, 'Weiter');
    enterKey(next);
    const flippable = c!.input !== 'allplay';
    return [clueHead(), h('h1.q-text', d.q.question), d.q.image ? h('figure.q-image', h('img', { src: d.q.image.url, alt: 'Bild zur Frage' })) : h('div'),
      h('div.solution', h('span', 'Richtig ist'), h('strong', phrase(s, solutionText(d)))),
      c!.log.length ? h('ul.jlog', c!.log.map((l, i) => h(l.ok ? 'li.right' : 'li.wrong',
        h('span', h('b', name(l.id)), `: ${c!.input === 'allplay' ? fmtEstimate(d.q, Number(l.said)) : l.said} `, l.ok ? '✓' : '✗', l.formError ? h('em', ' Formfehler – zählt trotzdem 😉') : null),
        h('strong', `${l.delta > 0 ? '+' : ''}${fmt(l.delta)}`),
        flippable ? h('button.btn.tiny', { type: 'button', title: 'Wertung korrigieren', onclick: () => host({ k: 'flip', i }) }, l.ok ? 'doch falsch' : 'doch richtig') : null)))
        : h('p.hint', 'Niemand hat sich getraut.'),
      h('aside.explain', h('b', 'Boxenfunk: '), d.q.explanation), podiums(s.chooser), next];
  }

  function roundEnd(): HTMLElement[] {
    const next = h('button.btn.primary.big', { type: 'button', onclick: () => host({ k: 'nextRound' }) }, `Runde ${s.round + 1} starten`);
    enterKey(next);
    const last = [...s.players].sort((a, b) => a.score - b.score)[0];
    return [h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', `Runde ${s.round} ist durch`), h('h1', 'Boxenstopp'),
      h('p.lead', `In Runde ${s.round + 1} sind alle Felder doppelt so viel wert – und ${last?.name ?? 'der Letzte'} darf zuerst wählen.`), tower(), next];
  }

  const finalCat = (): string => { const q = s.finalQ!.q; const k = CATEGORIES.find((x) => x.id === q.category); return k ? `${k.emoji} ${k.title}` : q.category; };
  function finalWager(): HTMLElement[] {
    const f = s.fin!;
    const pending = s.players.filter((p) => !(p.id in f.wagers));
    return [h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Finale Runde'), h('h1', finalCat()),
      h('p.lead', 'Ihr kennt nur die Kategorie. Jeder setzt geheim – bis zum eigenen Punktestand, mindestens aber bis 500.'), timer(f.deadline, 45_000) ?? h('div'),
      s.local ? privateTurn(pending, 'Geheimer Einsatz', (p) => wagerForm(0, maxFinalWager(s, p.id), (amount) => { ctx.ui.ready = null; act(p.id, { k: 'finalWager', amount }); }))
        : podiums(null, Object.fromEntries(s.players.map((p) => [p.id, p.id in f.wagers ? '✓ gesetzt' : p.connected ? '…' : 'getrennt']))),
      h('div.actions', skipBtn('Weiter zur Frage'))];
  }
  function finalAnswer(): HTMLElement[] {
    const f = s.fin!;
    const d = s.finalQ!;
    const pending = s.players.filter((p) => !(p.id in f.answers));
    return [h('p.kicker', `Finale Runde · ${finalCat()}`), ...clueBody(d, false), timer(f.deadline, 45_000) ?? h('div'),
      s.local ? privateTurn(pending, 'Antwort', (p) => {
        const done = (a: Answer): void => { ctx.ui.ready = null; act(p.id, { k: 'finalAnswer', a }); };
        if (f.input === 'text') return textForm((text) => done({ kind: 'text', text }));
        const input = questionInput(asDealt(d), done);
        return h('div', [...input.el.children].filter((n) => !n.matches('.q-text, .q-image')) as HTMLElement[]);
      }) : podiums(null, Object.fromEntries(s.players.map((p) => [p.id, p.id in f.answers ? '✓ geantwortet' : p.connected ? '…' : 'getrennt']))),
      h('div.actions', skipBtn('Antworten einsammeln'))];
  }
  function finalJudge(): HTMLElement[] {
    const f = s.fin!;
    const d = s.finalQ!;
    const ok = h('button.btn.primary.big', { type: 'button', onclick: () => host({ k: 'finalConfirm' }) }, 'Wertung übernehmen');
    return [h('p.kicker', 'Finale Runde – Wertung durch den Spielleiter'), h('h1.q-text', d.q.question),
      h('div.solution', h('span', 'Richtig ist'), h('strong', phrase(s, solutionText(d)))),
      h('ul.jlog', s.players.map((p) => h(f.verdicts[p.id] ? 'li.right' : 'li.wrong',
        h('span', h('b', p.name), `: ${saidText(d, f.answers[p.id] ?? null)}`), h('strong', f.verdicts[p.id] ? '✓ richtig' : '✗ falsch'),
        h('button.btn.tiny', { type: 'button', onclick: () => host({ k: 'finalVerdict', id: p.id, ok: !f.verdicts[p.id] }) }, f.verdicts[p.id] ? 'doch falsch' : 'doch richtig')))),
      h('p.hint', 'Die Vorschläge stammen vom automatischen Textvergleich. Die Einsätze werden erst nach der Übernahme aufgedeckt.'), ok];
  }
  function finalReveal(): HTMLElement[] {
    const f = s.fin!;
    const d = s.finalQ!;
    const next = h('button.btn.primary.big', { type: 'button', onclick: () => host({ k: 'continue' }) }, 'Zur Siegerehrung');
    enterKey(next);
    return [h('p.kicker', 'Finale Runde – Auflösung'), h('h1.q-text', d.q.question), h('div.solution', h('span', 'Richtig ist'), h('strong', phrase(s, solutionText(d)))),
      h('ul.jlog', s.players.map((p) => h(f.verdicts[p.id] ? 'li.right' : 'li.wrong',
        h('span', h('b', p.name), `: ${saidText(d, f.answers[p.id] ?? null)} `, f.verdicts[p.id] ? '✓' : '✗', ` · Einsatz ${fmt(f.wagers[p.id] ?? 0)}`),
        h('strong', `${(f.deltas[p.id] ?? 0) > 0 ? '+' : ''}${fmt(f.deltas[p.id] ?? 0)}`)))),
      h('aside.explain', h('b', 'Boxenfunk: '), d.q.explanation), tower(), next];
  }
  function tower(): HTMLElement {
    const rows = rankPlayers(s.players);
    const top = rows[0]?.player.score ?? 0;
    return h('ol.tower', rows.map((r) => h(r.player.connected ? 'li' : 'li.off', h('span.pos', { 'aria-label': `Platz ${r.place}` }, String(r.place)), h('i.team', { style: `background:${hex(r.player.color)}` }),
      h('span.name', h('span', `${s.local ? '' : r.player.avatar + ' '}${r.player.name}`)), h('span.meta', `${r.player.correct} richtig`), h('span.pts', fmt(r.player.score)), h('span.gap', r.place === 1 ? 'Spitze' : `−${fmt(top - r.player.score)}`))));
  }
  function done(): HTMLElement[] {
    const winners = rankPlayers(s.players).filter((r) => r.place === 1).map((r) => r.player.name);
    return [h('div.chequer', { 'aria-hidden': 'true' }), h('p.kicker', 'Zielflagge'), h('h1', winners.length > 1 ? `Totes Rennen: ${winners.join(' & ')}` : `${winners[0] ?? 'Niemand'} gewinnt!`),
      tower(), h('div.actions', ctx.exits)];
  }

  const screens: Record<string, () => HTMLElement[]> = { board, wager, buzz, answer, allplay, reveal, roundEnd, finalWager, finalAnswer, finalJudge, finalReveal, done };
  const nodes = (screens[s.phase] ?? (() => []))();
  return { nodes, key: (e) => key(e), stop: () => stops.forEach((f) => f()) };
}
