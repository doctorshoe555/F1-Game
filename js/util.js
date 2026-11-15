// Kleine Helfer: DOM, Zufall, Speicher, Töne.
export const $ = (sel, el = document) => el.querySelector(sel);

/** h('div.card', {onclick}, kind1, kind2 …) – winziger DOM-Baukasten */
export function h(spec, attrs, ...kids) {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const fmt = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
export const uid = () => Math.random().toString(36).slice(2, 10);

export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem('boxenfunk.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem('boxenfunk.' + key, JSON.stringify(val)); } catch { /* Speicher voll/gesperrt */ } },
  del(key) { try { localStorage.removeItem('boxenfunk.' + key); } catch { /* egal */ } },
};

// ---- Freitext-Vergleich -------------------------------------------------
export function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

// ---- Töne (WebAudio, keine Dateien nötig) --------------------------------
let ctx;
export const sound = { on: store.get('sound', true) };
function tone(freq, start, dur, type = 'square', vol = 0.08) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
}
export function sfx(name) {
  if (!sound.on) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (name === 'ok') { tone(660, 0, 0.12); tone(990, 0.1, 0.2); }
    else if (name === 'bad') { tone(220, 0, 0.18, 'sawtooth'); tone(160, 0.15, 0.3, 'sawtooth'); }
    else if (name === 'buzz') { tone(440, 0, 0.25, 'sawtooth', 0.12); }
    else if (name === 'tick') { tone(1200, 0, 0.04, 'square', 0.04); }
    else if (name === 'go') { tone(520, 0, 0.1); tone(780, 0.12, 0.1); tone(1040, 0.24, 0.3); }
  } catch { /* Audio nicht verfügbar */ }
}

// ---- Countdown-Balken: alle Elemente mit data-deadline laufen automatisch ----
// data-deadline = Zeitstempel (Date.now-Basis), data-total = Dauer in ms
let clockOffset = 0; // Host-Zeit minus lokale Zeit (nur auf Spieler-Handys ≠ 0)
export const setClockOffset = (o) => { clockOffset = o; };
export const hostNow = () => Date.now() + clockOffset;
function frame() {
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    const left = Math.max(0, +el.dataset.deadline - hostNow());
    const total = +el.dataset.total || 1;
    const bar = el.firstElementChild;
    if (bar) bar.style.width = clamp((left / total) * 100, 0, 100) + '%';
    el.classList.toggle('low', left < Math.min(5000, total / 3));
    const lab = el.querySelector('span'); if (lab) lab.textContent = Math.ceil(left / 1000);
  });
  requestAnimationFrame(frame);
}
if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(frame);
export const timerBar = (deadline, total) => (deadline ? h('div.timer', { 'data-deadline': deadline, 'data-total': total }, h('i'), h('span')) : null);
