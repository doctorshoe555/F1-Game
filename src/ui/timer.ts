import { h } from './dom';

/** Countdown-Balken. `now` liefert die maßgebliche Uhr (auf Handys: Host-Zeit). */
export function timerBar(deadline: number, totalMs: number, now: () => number = Date.now, onSecond?: (left: number) => void): { el: HTMLElement; stop: () => void } {
  const bar = h('i');
  const label = h('span');
  const el = h('div.timer', { role: 'timer', 'aria-label': 'Restzeit' }, bar, label);
  let raf = 0;
  let last = -1;
  const tick = (): void => {
    const left = Math.max(0, deadline - now());
    bar.style.width = `${Math.min(100, (left / totalMs) * 100)}%`;
    const whole = Math.ceil(left / 1000);
    if (whole !== last) { if (last !== -1) onSecond?.(whole); last = whole; label.textContent = String(whole); }
    el.classList.toggle('low', left < 5000);
    if (left > 0) raf = requestAnimationFrame(tick);
  };
  tick();
  return { el, stop: () => cancelAnimationFrame(raf) };
}

/** Bildschirm wach halten (wo der Browser es erlaubt). */
export function keepAwake(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let off = false;
  const req = async (): Promise<void> => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (!off && wl && document.visibilityState === 'visible') lock = await wl.request('screen');
    } catch { /* nicht unterstützt oder abgelehnt */ }
  };
  const onVis = (): void => { if (document.visibilityState === 'visible') void req(); };
  document.addEventListener('visibilitychange', onVis);
  void req();
  return () => { off = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => {}); };
}
