// Kurze Soundeffekte per WebAudio – keine Audiodateien, abschaltbar.
import { load, save } from '../storage/store';

export type Sfx = 'light' | 'go' | 'ok' | 'bad' | 'tick' | 'purple' | 'finish';
let enabled = load('sound', true);
let ctx: AudioContext | null = null;

export const soundOn = (): boolean => enabled;
export function setSound(on: boolean): void { enabled = on; save('sound', on); if (on) sfx('ok'); }

function tone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = 'square', vol = 0.07): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + 0.02);
}

export function sfx(name: Sfx): void {
  if (!enabled) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const c = (ctx ??= new Ctor());
    if (c.state === 'suspended') void c.resume();
    switch (name) {
      case 'light': tone(c, 440, 0, 0.12); break;
      case 'go': tone(c, 880, 0, 0.45, 'square', 0.08); break;
      case 'ok': tone(c, 660, 0, 0.1); tone(c, 990, 0.09, 0.2); break;
      case 'bad': tone(c, 200, 0, 0.16, 'sawtooth'); tone(c, 150, 0.14, 0.28, 'sawtooth'); break;
      case 'tick': tone(c, 1200, 0, 0.04, 'square', 0.035); break;
      case 'purple': tone(c, 660, 0, 0.08); tone(c, 880, 0.08, 0.08); tone(c, 1320, 0.16, 0.3); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.13, 0.22)); break;
    }
  } catch { /* Audio nicht verfügbar – Spiel läuft ohne Ton */ }
}

export function vibrate(ms: number | number[]): void {
  try { navigator.vibrate?.(ms); } catch { /* nicht unterstützt */ }
}
