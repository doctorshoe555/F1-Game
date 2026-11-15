#!/usr/bin/env node
// Prüft alle Fragendateien gegen data/schema/question.schema.json und auf inhaltliche
// Stimmigkeit (eindeutige ids, bekannte Kategorie, Antwortindex, vorhandene Bilder).
//   node scripts/validate.mjs            curated/ + generated/ (das, was im Spiel landet)
//   node scripts/validate.mjs --review   zusätzlich review/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Liefert { errors, total, stats }. Wird auch von den Tests benutzt. */
export function validateAll({ folders = ['curated', 'generated'] } = {}) {
  const schema = JSON.parse(readFileSync(join(root, 'data/schema/question.schema.json'), 'utf8'));
  const cats = JSON.parse(readFileSync(join(root, 'data/categories.json'), 'utf8'));
  const catIds = new Set(cats.map((c) => c.id));
  const check = new Ajv({ allErrors: true }).compile(schema);
  const errors = [], seen = new Map(), stats = {};
  let total = 0;

  for (const folder of folders) {
    const dir = join(root, 'data/questions', folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const rel = `${folder}/${file}`;
      let data;
      try { data = JSON.parse(readFileSync(join(dir, file), 'utf8')); }
      catch (e) { errors.push(`${rel}: kein gültiges JSON (${e.message})`); continue; }
      if (!check(data)) {
        for (const e of check.errors) {
          const m = /^\/questions\/(\d+)/.exec(e.instancePath);
          const id = m && data.questions?.[+m[1]]?.id;
          if (e.keyword === 'if') continue;
          errors.push(`${rel}${id ? ` (${id})` : ''}: ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''}`);
        }
      }
      for (const q of Array.isArray(data.questions) ? data.questions : []) {
        if (!q || typeof q !== 'object') continue;
        const err = (m) => errors.push(`${rel} (${q.id}): ${m}`);
        if (seen.has(q.id)) err(`id doppelt vergeben (auch in ${seen.get(q.id)})`); else seen.set(q.id, rel);
        if (!catIds.has(q.category)) err(`Kategorie "${q.category}" steht nicht in data/categories.json`);
        if ((q.type === 'mc' || q.type === 'image') && Array.isArray(q.options) && Number.isInteger(q.answer) && q.answer >= q.options.length) err('answer zeigt auf keine vorhandene Option');
        if (q.image?.url && !/^https:\/\//.test(q.image.url) && !existsSync(join(root, 'public', q.image.url))) err(`Bilddatei public/${q.image.url} fehlt`);
        if (q.validFrom && q.validUntil && q.validFrom > q.validUntil) err('validFrom liegt nach validUntil');
        if (folder === 'curated' && q.generated) err('generated=true gehört nach generated/');
        if (folder === 'generated' && q.generated === false) err('in generated/ muss generated=true sein');
        const s = (stats[q.category] ||= { n: 0, d: [0, 0, 0, 0, 0], fun: 0 });
        s.n++; if (q.difficulty >= 1 && q.difficulty <= 5) s.d[q.difficulty - 1]++; if (q.tags?.includes('spass')) s.fun++;
        total++;
      }
    }
  }
  return { errors, total, stats, cats };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folders = ['curated', 'generated', ...(process.argv.includes('--review') ? ['review'] : [])];
  const { errors, total, stats, cats } = validateAll({ folders });
  console.log('Kategorie            Fragen  Stufe 1–5            Spaß');
  for (const c of cats) {
    const s = stats[c.id];
    if (s) console.log(`${c.id.padEnd(20)} ${String(s.n).padStart(5)}   ${s.d.join(' / ').padEnd(20)} ${s.fun}`);
  }
  console.log(`Gesamt: ${total} Fragen.`);
  if (errors.length) { console.error(`\n${errors.length} Fehler:\n- ` + errors.join('\n- ')); process.exit(1); }
  console.log('Alles gültig.');
}
