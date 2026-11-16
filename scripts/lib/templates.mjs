// Fragen-Templates: reine Funktionen, die aus aufbereiteten Daten Fragen bauen (ohne Netz, testbar).
//
// Datenmodell (siehe collect() in update-questions.mjs):
//   seasons: [{ year, complete, drivers: [{ id, name, team, points, wins }], constructors: [{ name, points }] }]  (jeweils die Top 5)
//   races:   { [year]: [{ round, gp, circuit, winner: { id, name }, team }] }
//   careers: [{ id, name, wins, poles }]
//   grid:    { year, round, drivers: [{ id, name, team }] }   aktuelles Fahrerfeld
//   seasonEnd: 'YYYY-MM-DD' Datum des letzten Rennens der laufenden Saison (oder null)

export const SOURCE = 'https://api.jolpi.ca (Jolpica-F1, CC BY-NC-SA 4.0)';

/** Deterministischer Zufall aus einem Text – gleiche Eingabe, gleiche Fragen (keine unnötigen Änderungen im Repo). */
export function seeded(text) {
  let s = [...text].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
export function pick(list, n, rnd, exclude = []) {
  const pool = [...new Set(list)].filter((x) => !exclude.includes(x));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const GP_DE = {
  Australian: 'Australien', Bahrain: 'Bahrain', Chinese: 'China', Japanese: 'Japan', 'Saudi Arabian': 'Saudi-Arabien', Miami: 'Miami',
  'Emilia Romagna': 'der Emilia-Romagna', Monaco: 'Monaco', Spanish: 'Spanien', Canadian: 'Kanada', Austrian: 'Österreich', British: 'Großbritannien',
  Belgian: 'Belgien', Hungarian: 'Ungarn', Dutch: 'den Niederlanden', Italian: 'Italien', Azerbaijan: 'Aserbaidschan', Singapore: 'Singapur',
  'United States': 'den USA', 'Mexico City': 'Mexiko-Stadt', Mexican: 'Mexiko', 'São Paulo': 'São Paulo', Brazilian: 'Brasilien', 'Las Vegas': 'Las Vegas',
  Qatar: 'Katar', 'Abu Dhabi': 'Abu Dhabi', German: 'Deutschland', French: 'Frankreich', Portuguese: 'Portugal', Turkish: 'der Türkei',
  Russian: 'Russland', Styrian: 'der Steiermark', Eifel: 'der Eifel', Tuscan: 'der Toskana', Sakhir: 'Sakhir', Madrid: 'Madrid', Barcelona: 'Barcelona',
  '70th Anniversary': 'zum 70. Jubiläum', Malaysian: 'Malaysia', Korean: 'Südkorea', Indian: 'Indien', European: 'Europa',
};
export const gpName = (raceName) => { const k = raceName.replace(/ Grand Prix$/, ''); return GP_DE[k] ?? k; };

const base = (today) => ({ source: SOURCE, generated: true, lastVerified: today });
const ageDifficulty = (year, newest) => (year >= newest - 5 ? 2 : year >= 2000 ? 3 : year >= 1980 ? 4 : 5);
/** Antwortoptionen stabil mischen und den Index der richtigen merken. */
function mc(id, right, wrong) {
  const rnd = seeded(id);
  const options = pick([right, ...wrong], 4, rnd);
  return { options, answer: options.indexOf(right) };
}

/** Weltmeister, Konstrukteurs-Weltmeister und Vizeweltmeister je Saison. Distraktoren: die Nächstplatzierten derselben Saison. */
export function championQuestions({ seasons }, today) {
  const done = seasons.filter((s) => s.complete);
  const newest = Math.max(...done.map((s) => s.year));
  const out = [];
  for (const s of done) {
    const [champ, second, ...rest] = s.drivers;
    if (champ && s.drivers.length >= 4) {
      const id = `gen-wm-${s.year}`;
      out.push({
        id, type: 'mc', category: 'statistik', difficulty: ageDifficulty(s.year, newest), year: s.year, tags: ['weltmeister'],
        question: `Wer wurde ${s.year} Formel-1-Weltmeister?`, ...mc(id, champ.name, s.drivers.slice(1, 4).map((d) => d.name)),
        explanation: `${champ.name} holte den Titel ${s.year}${champ.team ? ` im ${champ.team}` : ''} mit ${fmtPts(champ.points)} Punkten – vor ${second.name}.`, ...base(today),
      });
      if (s.year >= newest - 19 && rest.length >= 3) {
        const vid = `gen-vize-${s.year}`;
        out.push({
          id: vid, type: 'mc', category: 'statistik', difficulty: Math.min(5, ageDifficulty(s.year, newest) + 1), year: s.year, tags: ['weltmeister'],
          question: `Wer wurde ${s.year} Vizeweltmeister hinter ${champ.name}?`, ...mc(vid, second.name, rest.slice(0, 3).map((d) => d.name)),
          explanation: `${second.name} wurde ${s.year} Zweiter mit ${fmtPts(second.points)} Punkten – ${fmtPts(champ.points - second.points)} hinter ${champ.name}.`, ...base(today),
        });
      }
    }
    if (s.constructors.length >= 4) {
      const id = `gen-kwm-${s.year}`;
      const [c1, c2] = s.constructors;
      out.push({
        id, type: 'mc', category: 'statistik', difficulty: Math.min(5, ageDifficulty(s.year, newest) + 1), year: s.year, tags: ['konstrukteure'],
        question: `Welches Team gewann ${s.year} die Konstrukteurs-Weltmeisterschaft?`, ...mc(id, c1.name, s.constructors.slice(1, 4).map((c) => c.name)),
        explanation: `${s.year} ging der Konstrukteurstitel an ${c1.name} – vor ${c2.name}.`, ...base(today),
      });
    }
  }
  return out;
}
const fmtPts = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** „Wie viele WM-Titel hat …?“ für Mehrfach-Weltmeister, plus Sortierfragen nach dem ersten Titel. */
export function titleQuestions({ seasons, grid, seasonEnd }, today) {
  const titles = new Map();
  for (const s of seasons.filter((x) => x.complete)) {
    const c = s.drivers[0];
    if (!c) continue;
    const t = titles.get(c.id) ?? { id: c.id, name: c.name, years: [] };
    t.years.push(s.year); titles.set(c.id, t);
  }
  const active = new Set(grid?.drivers.map((d) => d.id) ?? []);
  const out = [];
  for (const t of titles.values()) {
    if (t.years.length < 2) continue;
    const n = t.years.length;
    const id = `gen-titel-${slug(t.id)}`;
    const nums = n === 2 ? [1, 2, 3, 4] : [n - 1, n, n + 1, n + 2];
    out.push({
      id, type: 'mc', category: 'statistik', difficulty: 3, year: t.years.at(-1), tags: ['weltmeister'],
      question: `Wie viele WM-Titel hat ${t.name} gewonnen?`, options: nums.map(String), answer: nums.indexOf(n),
      explanation: `${n} Titel: ${t.years.join(', ')}.`, ...base(today),
      // Bei aktiven Fahrern kann ein Titel dazukommen → Frage läuft zum Saisonende aus und wird neu erzeugt.
      ...(active.has(t.id) && seasonEnd ? { validUntil: seasonEnd } : {}),
    });
  }
  const first = [...titles.values()].map((t) => ({ name: t.name, year: Math.min(...t.years) }));
  for (let k = 1; k <= 6 && first.length >= 8; k++) {
    const id = `gen-reihe-wm-${k}`;
    const four = pick(first, 4, seeded(id)).sort((a, b) => a.year - b.year);
    out.push({
      id, type: 'order', category: 'statistik', difficulty: 4, tags: ['weltmeister'],
      question: 'Sortiere nach dem Jahr des ersten WM-Titels – der früheste zuerst.', items: four.map((x) => x.name),
      explanation: four.map((x) => `${x.name} ${x.year}`).join(', ') + '.', ...base(today),
    });
  }
  return out;
}

/** Rennsieger und Strecken der genannten Saisons. Distraktoren: andere Sieger und Spitzenfahrer derselben Saison. */
export function raceQuestions({ seasons, races }, today) {
  const out = [];
  for (const [y, list] of Object.entries(races)) {
    const year = Number(y);
    const season = seasons.find((s) => s.year === year);
    const field = [...new Set([...list.map((r) => r.winner.name), ...(season?.drivers.map((d) => d.name) ?? [])])];
    const circuits = [...new Set(list.map((r) => r.circuit))];
    for (const r of list) {
      const id = `gen-sieg-${year}-${String(r.round).padStart(2, '0')}`;
      const wrong = pick(field, 3, seeded(id), [r.winner.name]);
      if (wrong.length === 3) out.push({
        id, type: 'mc', category: 'saison', difficulty: 3, year, tags: ['rennsieger'],
        question: `Wer gewann ${year} den Großen Preis von ${gpName(r.gp)}?`, ...mc(id, r.winner.name, wrong),
        explanation: `${r.winner.name} siegte im ${r.team} auf der Strecke „${r.circuit}“.`, ...base(today),
      });
      // Streckenfrage nur, wenn der Rennname die Strecke nicht schon verrät und die Saison abgeschlossen ist
      const sid = `gen-strecke-${year}-${String(r.round).padStart(2, '0')}`;
      const others = pick(circuits, 3, seeded(sid), [r.circuit]);
      const gp = r.gp.replace(/ Grand Prix$/, '').toLowerCase();
      if (season?.complete && others.length === 3 && !r.circuit.toLowerCase().includes(gp)) out.push({
        id: sid, type: 'mc', category: 'strecken', difficulty: 2, year, tags: ['strecke'],
        question: `Auf welcher Strecke wurde ${year} der Große Preis von ${gpName(r.gp)} gefahren?`, ...mc(sid, r.circuit, others),
        explanation: `Gefahren wurde auf „${r.circuit}“; es gewann ${r.winner.name}.`, ...base(today),
      });
    }
  }
  return out;
}

/** Schätzfragen zu Siegen und Poles sowie Sortierfragen nach Siegen. Aktive Fahrer → Ablaufdatum. */
export function careerQuestions({ careers, grid, seasonEnd }, today) {
  const active = new Set(grid?.drivers.map((d) => d.id) ?? []);
  const stand = grid ? ` (Stand: Saison ${grid.year} nach ${grid.round} Rennen)` : '';
  const expiry = (ids) => (ids.some((id) => active.has(id)) && seasonEnd ? { validUntil: seasonEnd } : {});
  const out = [];
  for (const c of careers) {
    const note = `${c.name}: ${c.wins} Siege und ${c.poles} Pole-Positions${active.has(c.id) ? stand : ''}.`;
    for (const [kind, n, unit, text] of [['siege', c.wins, 'Siege', 'Grands Prix hat'], ['poles', c.poles, 'Poles', 'Pole-Positions hat']]) {
      if (n < 5) continue;
      out.push({
        id: `gen-${kind}-${slug(c.id)}`, type: 'estimate', category: 'rekorde', difficulty: n >= 40 ? 3 : 4, tags: ['statistik'],
        question: kind === 'siege' ? `Wie viele ${text} ${c.name} gewonnen?` : `Wie viele ${text} ${c.name} geholt?`,
        answer: n, tolerance: Math.max(4, Math.round(n * 0.5)), unit, explanation: note, ...base(today), ...expiry([c.id]),
      });
    }
  }
  const ranked = careers.filter((c) => c.wins >= 5);
  for (let k = 1; k <= 6 && ranked.length >= 8; k++) {
    const id = `gen-reihe-siege-${k}`;
    const rnd = seeded(id);
    let four = [];
    // vier Fahrer mit deutlich unterschiedlichen Siegzahlen (mindestens 3 Abstand), sonst wäre es Glückssache
    for (let t = 0; t < 40; t++) {
      four = pick(ranked, 4, rnd).sort((a, b) => b.wins - a.wins);
      if (four.length === 4 && four.every((c, i) => i === 0 || four[i - 1].wins - c.wins >= 3)) break;
      four = [];
    }
    if (four.length === 4) out.push({
      id, type: 'order', category: 'rekorde', difficulty: 4, tags: ['statistik'],
      question: 'Sortiere nach der Zahl der Grand-Prix-Siege – die meisten zuerst.', items: four.map((c) => c.name),
      explanation: four.map((c) => `${c.name} ${c.wins}`).join(', ') + `${four.some((c) => active.has(c.id)) ? stand : ''}.`, ...base(today), ...expiry(four.map((c) => c.id)),
    });
  }
  return out;
}

/** „Aktuelle“ Fakten: amtierender Weltmeister und Fahrerpaarungen. Alle mit Ablaufdatum. */
export function currentQuestions({ seasons, grid, seasonEnd }, today) {
  const out = [];
  const done = seasons.filter((s) => s.complete);
  const last = done.at(-1);
  if (last?.drivers.length >= 4) {
    const id = 'gen-amtierend';
    out.push({
      id, type: 'mc', category: 'saison', difficulty: 1, year: last.year, tags: ['weltmeister', 'aktuell'],
      question: 'Wer ist amtierender Formel-1-Weltmeister?', ...mc(id, last.drivers[0].name, last.drivers.slice(1, 4).map((d) => d.name)),
      explanation: `${last.drivers[0].name} gewann die WM ${last.year}.`, ...base(today),
      // gilt, bis der nächste Champion feststeht – spätestens mit dem letzten Rennen der Folgesaison
      validUntil: seasonEnd && seasonEnd > `${last.year}-12-31` ? seasonEnd : `${last.year + 1}-12-31`,
    });
  }
  if (grid?.drivers.length >= 8) {
    const until = `${grid.year + 1}-03-31`;
    const teams = [...new Set(grid.drivers.map((d) => d.team))];
    for (const d of grid.drivers) {
      const id = `gen-team-${grid.year}-${slug(d.id)}`;
      out.push({
        id, type: 'mc', category: 'saison', difficulty: 2, year: grid.year, tags: ['aktuell', 'fahrerfeld'],
        question: `Für welches Team fährt ${d.name} in der Saison ${grid.year}?`, ...mc(id, d.team, pick(teams, 3, seeded(id + 'x'), [d.team])),
        explanation: `${d.name} startet ${grid.year} für ${d.team} (Stand nach ${grid.round} Rennen).`, ...base(today), validUntil: until,
      });
    }
    for (const team of teams) {
      const pair = grid.drivers.filter((d) => d.team === team).sort((a, b) => a.name.localeCompare(b.name));
      if (pair.length !== 2) continue;
      const id = `gen-kollege-${grid.year}-${slug(pair[0].id)}`;
      const wrong = pick(grid.drivers.filter((d) => d.team !== team).map((d) => d.name), 3, seeded(id + 'x'));
      out.push({
        id, type: 'mc', category: 'saison', difficulty: 3, year: grid.year, tags: ['aktuell', 'fahrerfeld'],
        question: `Wer ist in der Saison ${grid.year} Teamkollege von ${pair[0].name}?`, ...mc(id, pair[1].name, wrong),
        explanation: `${pair[0].name} und ${pair[1].name} fahren ${grid.year} gemeinsam für ${team} (Stand nach ${grid.round} Rennen).`, ...base(today), validUntil: until,
      });
    }
  }
  return out;
}

export function buildAll(data, today) {
  return [...championQuestions(data, today), ...titleQuestions(data, today), ...raceQuestions(data, today), ...careerQuestions(data, today), ...currentQuestions(data, today)];
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
/** Entfernt doppelte ids und Fragen, die es wortgleich schon kuratiert gibt. */
export function dedupe(generated, curated = []) {
  const taken = new Set(curated.map((q) => norm(q.question)));
  const ids = new Set(curated.map((q) => q.id));
  const out = [];
  for (const q of generated) {
    // Sortierfragen teilen sich bewusst den Fragetext – dort zählt nur die id
    const key = q.type === 'order' ? `${norm(q.question)}|${q.items.join('|')}` : norm(q.question);
    if (ids.has(q.id) || taken.has(key)) continue;
    ids.add(q.id); taken.add(key); out.push(q);
  }
  return out;
}

/** Unveränderte Fragen behalten ihr altes lastVerified – so entsteht nur dann ein Diff, wenn sich wirklich etwas geändert hat. */
export function keepVerifiedDates(fresh, previous = []) {
  const old = new Map(previous.map((q) => [q.id, q]));
  const same = (a, b) => JSON.stringify({ ...a, lastVerified: '' }) === JSON.stringify({ ...b, lastVerified: '' });
  return fresh.map((q) => { const p = old.get(q.id); return p && same(p, q) ? { ...q, lastVerified: p.lastVerified } : q; });
}

/** Verteilt die Fragen auf Dateien (nach Kategorie), stabil sortiert. */
export function splitFiles(questions) {
  const files = {};
  for (const q of [...questions].sort((a, b) => a.id.localeCompare(b.id))) (files[`${q.category}.json`] ??= []).push(q);
  return files;
}
