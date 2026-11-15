#!/usr/bin/env node
// Erzeugt aus data/sources/f1-circuits.geojson (MIT, bacinger/f1-circuits)
// die Streckenumrisse (assets/tracks/*.svg) und die Bildfragen
// data/questions/auto-umrisse.json. Aufruf: node scripts/build-tracks.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const geo = JSON.parse(readFileSync(join(root, 'data/sources/f1-circuits.geojson'), 'utf8'));

// id -> [Anzeigename, Schwierigkeit]
const NAMES = {
  'au-1953': ['Melbourne (Albert Park)', 3], 'bh-2002': ['Sakhir (Bahrain)', 3], 'cn-2004': ['Shanghai', 4],
  'es-1991': ['Barcelona', 3], 'mc-1929': ['Monaco', 2], 'ca-1978': ['Montreal', 3],
  'fr-1969': ['Le Castellet (Paul Ricard)', 4], 'at-1969': ['Spielberg (Red Bull Ring)', 3], 'gb-1948': ['Silverstone', 2],
  'de-1932': ['Hockenheim', 3], 'hu-1986': ['Budapest (Hungaroring)', 3], 'be-1925': ['Spa-Francorchamps', 2],
  'it-1922': ['Monza', 2], 'sg-2008': ['Singapur', 3], 'ru-2014': ['Sotschi', 4], 'jp-1962': ['Suzuka', 2],
  'us-2012': ['Austin (COTA)', 3], 'mx-1962': ['Mexiko-Stadt', 4], 'br-1940': ['São Paulo (Interlagos)', 3],
  'ae-2009': ['Abu Dhabi (Yas Marina)', 3], 'it-1953': ['Imola', 3], 'de-1927': ['Nürburgring (GP-Strecke)', 4],
  'pt-2008': ['Portimão', 4], 'it-1914': ['Mugello', 4], 'my-1999': ['Sepang', 4], 'tr-2005': ['Istanbul', 4],
  'nl-1948': ['Zandvoort', 3], 'fr-1960': ['Magny-Cours', 5], 'pt-1972': ['Estoril', 5],
  'br-1977': ['Rio de Janeiro (Jacarepaguá)', 5], 'sa-2021': ['Dschidda', 3], 'us-2022': ['Miami', 3],
  'qa-2004': ['Lusail (Katar)', 4], 'es-2026': ['Madrid (Madring)', 4], 'az-2016': ['Baku', 3],
  'us-2023': ['Las Vegas', 3], 'us-1909': ['Indianapolis (GP-Kurs)', 5], 'ar-1952': ['Buenos Aires', 5],
  'za-1961': ['Kyalami', 5], 'us-1956': ['Watkins Glen', 5],
};

// deterministischer Zufall, damit das Ergebnis reproduzierbar bleibt
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const W = 400, H = 300, PAD = 24;
mkdirSync(join(root, 'assets/tracks'), { recursive: true });
const feats = geo.features.filter((f) => NAMES[f.properties.id]);
const questions = [];

for (const f of feats) {
  const p = f.properties;
  const pts = f.geometry.coordinates;
  const lat0 = pts.reduce((a, c) => a + c[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([lon, lat]) => [lon * k, -lat]);
  const xs = xy.map((c) => c[0]), ys = xy.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const P = xy.map(([x, y]) => [(ox + (x - minX) * sc).toFixed(1), (oy + (y - minY) * sc).toFixed(1)]);
  const d = 'M' + P.map((c) => c.join(' ')).join('L') + 'Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#f4f4f6" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${P[0][0]}" cy="${P[0][1]}" r="6" fill="#ff3b30"/></svg>\n`;
  writeFileSync(join(root, 'assets/tracks', `${p.id}.svg`), svg);

  const [name, difficulty] = NAMES[p.id];
  const rand = rng(hash(p.id));
  const others = feats.filter((o) => o !== f).map((o) => NAMES[o.properties.id][0]);
  const distract = [];
  while (distract.length < 3) {
    const c = others[Math.floor(rand() * others.length)];
    if (!distract.includes(c)) distract.push(c);
  }
  questions.push({
    id: `umriss-${p.id}`, type: 'image', difficulty, year: Math.max(p.firstgp, 1950),
    question: 'Welche Strecke ist das?', image: `assets/tracks/${p.id}.svg`,
    options: [name, ...distract], answer: 0,
    explanation: `${p.Name} – ${(p.length / 1000).toFixed(3).replace('.', ',')} km lang, erster Grand Prix dort: ${p.firstgp}. Der rote Punkt markiert Start/Ziel.`,
  });
}
writeFileSync(join(root, 'data/questions/auto-umrisse.json'),
  JSON.stringify({ category: 'umrisse', source: 'scripts/build-tracks.mjs', questions }, null, 1) + '\n');
console.log(`${questions.length} Streckenumrisse erzeugt.`);
