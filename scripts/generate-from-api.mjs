#!/usr/bin/env node
// Erzeugt Statistik-Fragen automatisch aus der offenen Jolpica-F1-API (Nachfolger von Ergast)
// und schreibt sie nach data/questions/auto-statistik.json.
//   node scripts/generate-from-api.mjs
// Läuft wöchentlich per GitHub Action (.github/workflows/update-questions.yml).
// Handgeschriebene Dateien werden nie angefasst – nur Dateien mit dem Präfix "auto-".
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BOXENFUNK_API_BASE || 'https://api.jolpi.ca/ergast/f1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': 'f1-quiz-question-generator' } });
    if (res.ok) { await sleep(400); return (await res.json()).MRData; }
    if (attempt >= 4) throw new Error(`API-Fehler ${res.status} bei ${path}`);
    await sleep(2000 * (attempt + 1));
  }
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const rand = rng(20260101);
const pick = (arr, n, exclude = []) => {
  const pool = [...new Set(arr)].filter((x) => !exclude.includes(x));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};
const name = (d) => `${d.givenName} ${d.familyName}`;
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ageDifficulty = (year, now) => (year >= now - 6 ? 2 : year >= 2000 ? 3 : year >= 1980 ? 4 : 5);

const GP_DE = {
  Australian: 'Australien', Bahrain: 'Bahrain', Chinese: 'China', Japanese: 'Japan', 'Saudi Arabian': 'Saudi-Arabien',
  Miami: 'Miami', 'Emilia Romagna': 'der Emilia-Romagna', Monaco: 'Monaco', Spanish: 'Spanien', Canadian: 'Kanada',
  Austrian: 'Österreich', British: 'Großbritannien', Belgian: 'Belgien', Hungarian: 'Ungarn', Dutch: 'den Niederlanden',
  Italian: 'Italien', Azerbaijan: 'Aserbaidschan', Singapore: 'Singapur', 'United States': 'den USA (Austin)',
  'Mexico City': 'Mexiko-Stadt', 'São Paulo': 'São Paulo', 'Las Vegas': 'Las Vegas', Qatar: 'Katar', 'Abu Dhabi': 'Abu Dhabi',
  German: 'Deutschland', French: 'Frankreich', Portuguese: 'Portugal', Turkish: 'der Türkei', Madrid: 'Madrid',
};
const gpName = (raceName) => { const k = raceName.replace(/ Grand Prix$/, ''); return GP_DE[k] || k; };

const questions = [];

// 1) Fahrer-Weltmeister aller Jahre
const ds = (await api('driverstandings/1.json?limit=100')).StandingsTable.StandingsLists
  .map((l) => ({ year: +l.season, round: +l.round, champ: name(l.DriverStandings[0].Driver), team: l.DriverStandings[0].Constructors.at(-1)?.name }));
// 2) Konstrukteurs-Weltmeister
const cs = (await api('constructorstandings/1.json?limit=100')).StandingsTable.StandingsLists
  .map((l) => ({ year: +l.season, champ: l.ConstructorStandings[0].Constructor.name }));

// Die letzte Saison gilt erst als beendet, wenn alle geplanten Rennen gefahren sind.
const latest = Math.max(...ds.map((s) => s.year));
const schedule = (await api(`${latest}/races.json?limit=100`)).RaceTable.Races;
const finished = ds.filter((s) => s.year < latest || s.round >= schedule.length);
const now = Math.max(...finished.map((s) => s.year));

const allChamps = finished.map((s) => s.champ);
for (const s of finished) {
  const near = finished.filter((o) => Math.abs(o.year - s.year) <= 8).map((o) => o.champ);
  let wrong = pick(near, 3, [s.champ]);
  if (wrong.length < 3) wrong = wrong.concat(pick(allChamps, 3 - wrong.length, [s.champ, ...wrong]));
  questions.push({
    id: `auto-wm-${s.year}`, type: 'mc', category: 'weltmeister', difficulty: ageDifficulty(s.year, now), year: s.year,
    question: `Wer wurde ${s.year} Formel-1-Weltmeister?`, options: [s.champ, ...wrong], answer: 0,
    explanation: `${s.champ} holte den Titel ${s.year}${s.team ? ` im ${s.team}` : ''}.`,
  });
}
const allTeams = cs.map((s) => s.champ);
for (const s of cs.filter((c) => c.year <= now)) {
  const near = cs.filter((o) => Math.abs(o.year - s.year) <= 10).map((o) => o.champ);
  let wrong = pick(near, 3, [s.champ]);
  if (wrong.length < 3) wrong = wrong.concat(pick(allTeams, 3 - wrong.length, [s.champ, ...wrong]));
  questions.push({
    id: `auto-kwm-${s.year}`, type: 'mc', category: 'weltmeister', difficulty: Math.min(5, ageDifficulty(s.year, now) + 1), year: s.year,
    question: `Welches Team gewann ${s.year} die Konstrukteurs-Weltmeisterschaft?`, options: [s.champ, ...wrong], answer: 0,
    explanation: `${s.year} ging der Konstrukteurstitel an ${s.champ}.`,
  });
}
// 3) Sortierfragen: Weltmeister chronologisch
const firstTitle = new Map();
for (const s of finished) if (!firstTitle.has(s.champ)) firstTitle.set(s.champ, s.year);
const champList = [...firstTitle.entries()];
for (let i = 0; i < 8; i++) {
  const four = pick(champList, 4).sort((a, b) => a[1] - b[1]);
  questions.push({
    id: `auto-order-${i + 1}`, type: 'order', category: 'weltmeister', difficulty: 4,
    question: 'Sortiere nach dem Jahr des ersten WM-Titels – der früheste zuerst.', items: four.map((c) => c[0]),
    explanation: four.map((c) => `${c[0]} ${c[1]}`).join(', ') + '.',
  });
}
// 4) Rennsieger der letzten beiden Saisons (laufende Saison inklusive)
for (const year of [...new Set([now, latest])]) {
  const races = (await api(`${year}/results/1.json?limit=100`)).RaceTable.Races;
  const field = (await api(`${year}/driverstandings.json?limit=100`)).StandingsTable.StandingsLists[0]
    ?.DriverStandings.slice(0, 10).map((d) => name(d.Driver)) || [];
  for (const r of races) {
    const res = r.Results?.[0];
    if (!res) continue;
    const winner = name(res.Driver);
    const wrong = pick(field, 3, [winner]);
    if (wrong.length < 3) continue;
    questions.push({
      id: `auto-sieg-${year}-${slug(r.raceName)}`, type: 'mc', category: 'saison', difficulty: 3, year,
      question: `Wer gewann ${year} den Großen Preis von ${gpName(r.raceName)}?`, options: [winner, ...wrong], answer: 0,
      explanation: `${winner} siegte im ${res.Constructor.name} auf dem Kurs „${r.Circuit.circuitName}“.`,
    });
  }
}

const out = { source: 'scripts/generate-from-api.mjs (Jolpica-F1-API)', generated: new Date().toISOString().slice(0, 10), questions };
writeFileSync(join(root, 'data/questions/auto-statistik.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`${questions.length} Fragen erzeugt (Stand: Saison ${latest}).`);
