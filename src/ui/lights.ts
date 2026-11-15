// Startampel: fünf rote Lichter gehen nacheinander an, dann aus – los.
import { h } from './dom';
import { sfx } from './sound';

export function startLights(onDone: () => void): { el: HTMLElement; dispose: () => void } {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const lamps = [1, 2, 3, 4, 5].map(() => h('div.lamp-col', h('i.lamp'), h('i.lamp.red')));
  const label = h('p.lights-label', { 'aria-live': 'assertive' }, 'Startaufstellung …');
  let timers: number[] = [];
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    onDone();
  };
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); finish(); } };
  document.addEventListener('keydown', onKey);
  const el = h('section.lights', { onclick: finish },
    h('div.gantry', { role: 'img', 'aria-label': 'Startampel mit fünf roten Lichtern' }, lamps), label,
    h('button.btn.ghost', { type: 'button' }, 'Überspringen'));

  const step = reduced ? 120 : 550;
  lamps.forEach((col, i) => timers.push(window.setTimeout(() => { col.classList.add('on'); sfx('light'); }, step * (i + 1))));
  const out = step * 5 + (reduced ? 200 : 500 + Math.random() * 900);
  timers.push(window.setTimeout(() => {
    lamps.forEach((c) => c.classList.remove('on'));
    el.classList.add('go'); label.textContent = 'Lights out – los!'; sfx('go');
  }, out));
  timers.push(window.setTimeout(finish, out + (reduced ? 200 : 650)));
  return { el, dispose: () => { finished = true; timers.forEach(clearTimeout); timers = []; document.removeEventListener('keydown', onKey); } };
}
