// Zugriff auf die Jolpica-F1-API (Ergast-Nachfolger) mit Plattencache und Rücksicht auf die Limits.
// Limits laut Doku (Stand 11/2026): 4 Anfragen/Sekunde, 500 pro Stunde – wir bleiben weit darunter.
// Nutzungsbedingungen: nicht-kommerziell, Daten unter CC BY-NC-SA 4.0.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createApi({ base = 'https://api.jolpi.ca/ergast/f1', cacheDir, offline = false, minGapMs = 700, fetchImpl = fetch, log = () => {} } = {}) {
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  let last = 0;
  const stats = { network: 0, cached: 0 };

  /** Holt `path` (z. B. "2024/driverstandings.json?limit=5"). ttlHours = wie lange der Cache gilt (Infinity = für immer). */
  async function get(path, ttlHours = 12) {
    const file = cacheDir && join(cacheDir, createHash('sha1').update(path).digest('hex').slice(0, 16) + '.json');
    if (file && existsSync(file)) {
      const ageH = (Date.now() - statSync(file).mtimeMs) / 3_600_000;
      if (offline || ageH <= ttlHours) { stats.cached++; return JSON.parse(readFileSync(file, 'utf8')); }
    }
    if (offline) throw new Error(`Nicht im Cache (offline): ${path}`);
    for (let attempt = 0; ; attempt++) {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      let res;
      try { res = await fetchImpl(`${base}/${path}`, { headers: { 'User-Agent': 'f1-quiz-question-generator', Accept: 'application/json' } }); }
      catch (e) { if (attempt >= 3) throw new Error(`Netzwerkfehler bei ${path}: ${e.message}`); await sleep(2000 * (attempt + 1)); continue; }
      if (res.ok) {
        const data = (await res.json()).MRData;
        if (!data) throw new Error(`Unerwartete Antwort bei ${path}`);
        stats.network++;
        if (file) writeFileSync(file, JSON.stringify(data));
        return data;
      }
      // 429 = gedrosselt: Wartezeit des Servers beachten; 5xx: ein paar Versuche mit wachsender Pause
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const pause = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000 * 2 ** attempt;
        log(`  ${res.status} bei ${path} – warte ${Math.round(pause / 1000)} s`);
        await sleep(Math.min(pause, 120_000));
        continue;
      }
      throw new Error(`API-Fehler ${res.status} bei ${path}`);
    }
  }
  return { get, stats };
}
