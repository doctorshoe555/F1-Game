#!/usr/bin/env node
// Erzeugt die Statistik-Fragen in data/questions/generated/ neu – aus der Jolpica-F1-API.
//   node scripts/update-questions.mjs             holen (mit Cache), bauen, prüfen, schreiben
//   node scripts/update-questions.mjs --dry-run   nichts schreiben, nur berichten
//   node scripts/update-questions.mjs --offline   nur den Cache benutzen (kein Netz)
// Kuratierte Fragen und generated/umrisse.json (aus build-tracks.mjs) werden nie angefasst.
// Schlägt irgendetwas fehl (Netz, Validierung), bleibt der bisherige Stand unverändert.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApi } from './lib/jolpica.mjs';
import { buildAll, dedupe, keepVerifiedDates, splitFiles } from './lib/templates.mjs';
import { validateQuestions } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWN_FILES = ['statistik.json', 'saison.json', 'rekorde.json', 'strecken.json'];
/** Fahrer für die Karriere-Statistik (ids der API). */
const CAREER_IDS = ['hamilton', 'michael_schumacher', 'max_verstappen', 'vettel', 'prost', 'senna', 'alonso', 'mansell', 'stewart', 'clark', 'lauda', 'fangio',
  'piquet', 'rosberg', 'damon_hill', 'hakkinen', 'raikkonen', 'button', 'ricciardo', 'bottas', 'leclerc', 'norris', 'russell', 'sainz', 'piastri', 'perez'];
const HOUR = 1, FOREVER = Infinity;
const name = (d) => `${d.givenName} ${d.familyName}`;

/** Holt alle nötigen Daten und bringt sie in das Modell, das die Templates erwarten. */
export async function collect(api, log = () => {}, today = new Date().toISOString().slice(0, 10)) {
  const years = (await api.get('seasons.json?limit=100', 24 * HOUR)).SeasonTable.Seasons.map((s) => Number(s.season));
  const latest = Math.max(...years);
  const schedule = (await api.get(`${latest}/races.json?limit=100`, 24 * HOUR)).RaceTable.Races;
  const lastRace = (await api.get(`${latest}/last/results.json?limit=40`, 6 * HOUR)).RaceTable.Races[0];
  const round = lastRace ? Number(lastRace.round) : 0;
  const latestComplete = schedule.length > 0 && round >= schedule.length;
  log(`Saison ${latest}: ${round} von ${schedule.length} Rennen gefahren${latestComplete ? ' (abgeschlossen)' : ''}.`);

  const seasons = [];
  for (const year of years) {
    const complete = year < latest || latestComplete;
    // Abgeschlossene Saisons ändern sich nicht mehr → dauerhaft im Cache
    const ttl = year < latest - 1 ? FOREVER : 6 * HOUR;
    const ds = (await api.get(`${year}/driverstandings.json?limit=5`, ttl)).StandingsTable.StandingsLists[0];
    const cs = year >= 1958 ? (await api.get(`${year}/constructorstandings.json?limit=5`, ttl)).StandingsTable.StandingsLists[0] : null;
    seasons.push({
      year, complete,
      drivers: (ds?.DriverStandings ?? []).map((d) => ({ id: d.Driver.driverId, name: name(d.Driver), team: d.Constructors.at(-1)?.name ?? '', points: Number(d.points), wins: Number(d.wins) })),
      constructors: (cs?.ConstructorStandings ?? []).map((c) => ({ name: c.Constructor.name, points: Number(c.points) })),
    });
  }

  const races = {};
  const raceYears = [...new Set([latestComplete ? latest : latest - 1, latest])].filter((y) => years.includes(y));
  for (const year of raceYears) {
    const list = (await api.get(`${year}/results/1.json?limit=100`, year < latest ? FOREVER : 6 * HOUR)).RaceTable.Races;
    races[year] = list.filter((r) => r.Results?.[0]).map((r) => ({ round: Number(r.round), gp: r.raceName, circuit: r.Circuit.circuitName, winner: { id: r.Results[0].Driver.driverId, name: name(r.Results[0].Driver) }, team: r.Results[0].Constructor.name }));
  }

  const grid = lastRace ? { year: latest, round, drivers: lastRace.Results.map((x) => ({ id: x.Driver.driverId, name: name(x.Driver), team: x.Constructor.name })) } : null;
  const active = new Set(grid?.drivers.map((d) => d.id) ?? []);
  const careers = [];
  for (const id of CAREER_IDS) {
    const ttl = active.has(id) ? 6 * HOUR : 24 * 30 * HOUR;
    const wins = await api.get(`drivers/${id}/results/1.json?limit=1`, ttl);
    const poles = await api.get(`drivers/${id}/grid/1/results.json?limit=1`, ttl);
    const d = wins.RaceTable.Races[0]?.Results?.[0]?.Driver ?? poles.RaceTable.Races[0]?.Results?.[0]?.Driver;
    if (!d) { log(`  Hinweis: keine Daten für Fahrer-id „${id}“ – übersprungen.`); continue; }
    careers.push({ id, name: name(d), wins: Number(wins.total), poles: Number(poles.total) });
  }
  // Ablaufdatum für „aktuelle“ Fakten: letztes Rennen der laufenden Saison; in der Winterpause bis kurz nach dem nächsten Saisonstart
  const finale = schedule.at(-1)?.date ?? null;
  const seasonEnd = finale && finale >= today ? finale : `${latest + 1}-03-31`;
  return { seasons, races, careers, grid, seasonEnd };
}

const readQuestions = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).questions ?? [] : []);

export async function run({ dryRun = false, offline = false, today = new Date().toISOString().slice(0, 10), log = console.log } = {}) {
  const api = createApi({ cacheDir: join(root, '.cache/jolpica'), offline, log });
  const data = await collect(api, log, today);
  log(`API: ${api.stats.network} Anfragen, ${api.stats.cached} aus dem Cache.`);

  const genDir = join(root, 'data/questions/generated');
  const curatedDir = join(root, 'data/questions/curated');
  const curated = readdirSync(curatedDir).filter((f) => f.endsWith('.json')).flatMap((f) => readQuestions(join(curatedDir, f)));
  // Auch fremde generierte Dateien (Streckenumrisse) zählen für die Dubletten-Prüfung
  const foreign = readdirSync(genDir).filter((f) => f.endsWith('.json') && !OWN_FILES.includes(f)).flatMap((f) => readQuestions(join(genDir, f)));
  const previous = OWN_FILES.flatMap((f) => readQuestions(join(genDir, f)));

  const fresh = keepVerifiedDates(dedupe(buildAll(data, today), [...curated, ...foreign]), previous);
  const errors = validateQuestions(fresh, 'generated');
  if (errors.length) throw new Error(`Erzeugte Fragen sind ungültig – nichts geschrieben:\n- ${errors.slice(0, 20).join('\n- ')}`);
  if (fresh.length < 50) throw new Error(`Nur ${fresh.length} Fragen erzeugt – das sieht nach einem Datenproblem aus. Nichts geschrieben.`);

  const files = splitFiles(fresh);
  const before = new Map(previous.map((q) => [q.id, JSON.stringify(q)]));
  const added = fresh.filter((q) => !before.has(q.id)).length;
  const changed = fresh.filter((q) => before.has(q.id) && before.get(q.id) !== JSON.stringify(q)).length;
  const removed = previous.filter((q) => !fresh.some((f) => f.id === q.id)).length;
  log(`${fresh.length} Fragen: ${added} neu, ${changed} geändert, ${removed} entfallen.`);
  for (const [f, qs] of Object.entries(files)) log(`  ${f.padEnd(16)} ${qs.length}`);
  if (dryRun) { log('Probelauf – nichts geschrieben.'); return { fresh, added, changed, removed }; }
  for (const f of OWN_FILES) {
    const target = join(genDir, f);
    if (files[f]) writeFileSync(target, '{"questions":[\n' + files[f].map((q) => JSON.stringify(q)).join(',\n') + '\n]}\n');
    else if (existsSync(target)) rmSync(target);
  }
  return { fresh, added, changed, removed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ dryRun: process.argv.includes('--dry-run'), offline: process.argv.includes('--offline') }).catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
}
