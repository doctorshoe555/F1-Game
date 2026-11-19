// Darstellung einer Frage: Eingabe (je nach Typ) und Auflösung.
import { reportUrl } from '../config';
import { categoryById } from '../core/questions';
import { fmtEstimate, solutionText } from '../core/scoring';
import type { Outcome } from '../core/classic';
import type { Answer, Dealt } from '../core/types';
import { fmt, h } from './dom';

const LETTERS = 'ABCDEF';

/** Zahl aus Nutzereingabe („1,8“, „1.200“, „7 004“) lesen; NaN bei Unsinn. */
export function parseNumber(raw: string): number {
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, ''); // deutsche Tausenderpunkte
  s = s.replace(',', '.');
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

function imageBox(d: Dealt): HTMLElement | null {
  const img = d.q.image;
  if (!img) return null;
  const box = h('figure.q-image');
  const el = h('img', { src: img.url, alt: 'Bild zur Frage', loading: 'lazy', decoding: 'async' });
  el.addEventListener('error', () => box.replaceChildren(h('div.q-image-missing', '🖼️ Bild konnte nicht geladen werden')));
  box.append(el);
  return box;
}

export function difficultyDots(n: number): HTMLElement {
  return h('span.dots', { title: `Schwierigkeit ${n} von 5`, 'aria-label': `Schwierigkeit ${n} von 5` },
    [1, 2, 3, 4, 5].map((i) => h(i <= n ? 'i.on' : 'i')));
}

export function questionHead(d: Dealt): HTMLElement {
  const cat = categoryById(d.q.category);
  return h('div.q-head', h('span.q-cat', `${cat.emoji} ${cat.title}`), difficultyDots(d.q.difficulty));
}

/** Eingabe-Ansicht. onAnswer wird genau einmal aufgerufen. */
export function questionInput(d: Dealt, onAnswer: (a: Answer) => void): { el: HTMLElement; key: (e: KeyboardEvent) => void } {
  const q = d.q;
  let done = false;
  const submit = (a: Answer): void => { if (!done) { done = true; onAnswer(a); } };
  const body = h('div.q-body', h('h2.q-text', q.question), imageBox(d));
  let key: (e: KeyboardEvent) => void = () => {};

  if (q.type === 'mc' || q.type === 'image') {
    body.append(h('div.options', d.shown.map((opt, i) =>
      h('button.option', { type: 'button', onclick: () => submit({ kind: 'choice', index: i }) }, h('b', LETTERS[i]), h('span', opt)))));
    key = (e) => {
      const k = e.key.toUpperCase();
      const i = /^[1-6]$/.test(k) ? +k - 1 : LETTERS.indexOf(k);
      if (i >= 0 && i < d.shown.length && k.length === 1) submit({ kind: 'choice', index: i });
    };
  } else if (q.type === 'tf') {
    body.append(h('div.options.two',
      h('button.option', { type: 'button', onclick: () => submit({ kind: 'bool', value: true }) }, h('b', 'W'), h('span', 'Wahr')),
      h('button.option', { type: 'button', onclick: () => submit({ kind: 'bool', value: false }) }, h('b', 'F'), h('span', 'Falsch'))));
    key = (e) => { const k = e.key.toUpperCase(); if (k === 'W' || k === 'F') submit({ kind: 'bool', value: k === 'W' }); };
  } else if (q.type === 'estimate') {
    const input = h('input.num', { type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: 'Deine Schätzung', 'aria-label': 'Deine Schätzung' });
    const err = h('p.form-error', { role: 'alert' });
    const go = (): void => {
      const v = parseNumber(input.value);
      if (Number.isNaN(v)) { err.textContent = 'Bitte eine Zahl eingeben.'; input.focus(); return; }
      submit({ kind: 'number', value: v });
    };
    body.append(h('form.estimate', { onsubmit: (e: Event) => { e.preventDefault(); go(); } },
      h('div.estimate-row', input, q.unit ? h('span.unit', q.unit) : null), err,
      h('button.btn.primary', { type: 'submit' }, 'Schätzung abgeben')),
      h('p.hint', 'Je näher dran, desto mehr Punkte.'));
    setTimeout(() => input.focus(), 50);
  } else {
    const order = [...d.shown];
    const list = h('ol.order');
    const draw = (): void => {
      list.replaceChildren(...order.map((it, i) => h('li', h('span.order-text', it),
        h('button.icon', { type: 'button', disabled: i === 0, 'aria-label': `${it} nach oben`, onclick: () => move(i, -1) }, '▲'),
        h('button.icon', { type: 'button', disabled: i === order.length - 1, 'aria-label': `${it} nach unten`, onclick: () => move(i, 1) }, '▼'))));
    };
    const move = (i: number, dir: number): void => { [order[i], order[i + dir]] = [order[i + dir], order[i]]; draw(); };
    draw();
    body.append(list, h('button.btn.primary', { type: 'button', onclick: () => submit({ kind: 'order', items: [...order] }) }, 'Reihenfolge abgeben'));
  }
  return { el: body, key };
}

/** Auflösung: zeigt richtige Lösung, eigene Antwort und Erklärung. */
export function questionReveal(d: Dealt, o: Outcome): HTMLElement {
  const q = d.q;
  const a = o.answer;
  const body = h('div.q-body', h('h2.q-text', q.question), imageBox(d));

  if (q.type === 'mc' || q.type === 'image' || q.type === 'tf') {
    const shown = q.type === 'tf' ? ['Wahr', 'Falsch'] : d.shown;
    const right = q.type === 'tf' ? (q.answer ? 0 : 1) : d.correctIndex;
    const chosen = a?.kind === 'choice' ? a.index : a?.kind === 'bool' ? (a.value ? 0 : 1) : -1;
    body.append(h(q.type === 'tf' ? 'div.options.two' : 'div.options', shown.map((opt, i) => {
      const state = i === right ? 'right' : i === chosen ? 'wrong' : 'dim';
      const mark = i === right ? '✓ richtig' : i === chosen ? '✗ deine Antwort' : '';
      return h(`div.option.${state}`, h('b', q.type === 'tf' ? opt[0] : LETTERS[i]), h('span', opt), mark ? h('em', mark) : null);
    })));
  } else if (q.type === 'estimate') {
    body.append(h('div.solution', h('span', 'Richtig ist'), h('strong', solutionText(d))),
      h('p.your', a?.kind === 'number'
        ? `Deine Schätzung: ${fmtEstimate(q, a.value)}${q.unit ? ' ' + q.unit : ''} – Abweichung ${fmt(o.verdict.off ?? 0)}`
        : 'Keine Schätzung abgegeben.'));
  } else {
    const mine = a?.kind === 'order' ? a.items : null;
    body.append(h('ol.order.solved', q.items!.map((it, i) => {
      const ok = mine ? mine[i] === it : false;
      return h(`li.${mine ? (ok ? 'right' : 'wrong') : 'dim'}`, h('span.order-text', it),
        mine ? h('em', ok ? '✓' : `✗ bei dir: ${mine[i]}`) : null);
    })));
  }
  body.append(h('aside.explain', h('b', 'Boxenfunk: '), q.explanation));
  body.append(h('p.report', h('a', { href: reportUrl(q, solutionText(d)), target: '_blank', rel: 'noopener' }, 'Frage falsch? Melden')));
  return body;
}
