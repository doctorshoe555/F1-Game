#!/usr/bin/env node
// Prüft alle Fragendateien in data/questions/ und schreibt data/questions/index.json
// (GitHub Pages kann keine Verzeichnisse auflisten – die App lädt die Dateien über den Index).
//   node scripts/validate.mjs          prüfen + Index schreiben
//   node scripts/validate.mjs --check  nur prüfen; Fehler, falls der Index veraltet ist (für CI)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data/questions');
const checkOnly = process.argv.includes('--check');
const cats = JSON.parse(readFileSync(join(root, 'data/categories.json'), 'utf8'));
const catIds = new Set(cats.map((c) => c.id));
const TYPES = ['mc', 'tf', 'estimate', 'image', 'order'];
const ALLOWED = new Set(['id', 'type', 'category', 'difficulty', 'year', 'fun', 'question', 'image', 'options', 'answer', 'accept', 'tolerance', 'unit', 'items', 'explanation']);

const errors = [];
const seen = new Map();
const stats = {};
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
let total = 0;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const uniq = (a) => new Set(a).size === a.length;

for (const file of files) {
  let data;
  try { data = JSON.parse(readFileSync(join(dir, file), 'utf8')); }
  catch (e) { errors.push(`${file}: kein gültiges JSON (${e.message})`); continue; }
  if (!Array.isArray(data.questions)) { errors.push(`${file}: Feld "questions" (Array) fehlt`); continue; }
  data.questions.forEach((q, i) => {
    const where = `${file} #${i + 1}${q && q.id ? ` (${q.id})` : ''}`;
    const err = (m) => errors.push(`${where}: ${m}`);
    if (!q || typeof q !== 'object') return err('kein Objekt');
    for (const k of Object.keys(q)) if (!ALLOWED.has(k)) err(`unbekanntes Feld "${k}"`);
    if (!isStr(q.id) || !/^[a-z0-9-]+$/.test(q.id)) err('id fehlt oder enthält unerlaubte Zeichen (a-z, 0-9, -)');
    else if (seen.has(q.id)) err(`id doppelt vergeben (auch in ${seen.get(q.id)})`);
    else seen.set(q.id, file);
    if (!TYPES.includes(q.type)) return err(`type muss einer von ${TYPES.join(', ')} sein`);
    const cat = q.category || data.category;
    if (!catIds.has(cat)) err(`Kategorie "${cat}" steht nicht in data/categories.json`);
    if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) err('difficulty muss eine ganze Zahl von 1 bis 5 sein');
    if (q.year !== undefined && (!Number.isInteger(q.year) || q.year < 1900 || q.year > 2100)) err('year ist kein plausibles Jahr');
    if (q.fun !== undefined && typeof q.fun !== 'boolean') err('fun muss true/false sein');
    if (!isStr(q.question)) err('question fehlt');
    if (!isStr(q.explanation)) err('explanation fehlt');
    if (q.accept !== undefined && !(Array.isArray(q.accept) && q.accept.every(isStr))) err('accept muss eine Liste von Texten sein');
    if (q.type === 'mc' || q.type === 'image') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || !q.options.every(isStr)) err('options: 2–6 Texte nötig');
      else {
        if (!uniq(q.options)) err('options enthält Dubletten');
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err('answer muss der Index der richtigen Option sein');
      }
    }
    if (q.type === 'image') {
      if (!isStr(q.image)) err('image fehlt');
      else if (!/^https?:/.test(q.image) && !existsSync(join(root, q.image))) err(`Bilddatei ${q.image} nicht gefunden`);
    }
    if (q.type === 'tf' && typeof q.answer !== 'boolean') err('answer muss true oder false sein');
    if (q.type === 'estimate') {
      if (typeof q.answer !== 'number' || !Number.isFinite(q.answer)) err('answer muss eine Zahl sein');
      if (typeof q.tolerance !== 'number' || !(q.tolerance > 0)) err('tolerance (> 0) fehlt');
    }
    if (q.type === 'order') {
      if (!Array.isArray(q.items) || q.items.length < 3 || q.items.length > 6 || !q.items.every(isStr)) err('items: 3–6 Texte in richtiger Reihenfolge nötig');
      else if (!uniq(q.items)) err('items enthält Dubletten');
    }
    stats[cat] = stats[cat] || { n: 0, d: [0, 0, 0, 0, 0], fun: 0 };
    stats[cat].n++; if (q.difficulty >= 1 && q.difficulty <= 5) stats[cat].d[q.difficulty - 1]++; if (q.fun) stats[cat].fun++;
    total++;
  });
}

console.log('Kategorie            Fragen  Stufe 1–5        Spaß');
for (const c of cats) {
  const s = stats[c.id];
  if (s) console.log(`${c.id.padEnd(20)} ${String(s.n).padStart(5)}   ${s.d.join(' / ').padEnd(16)} ${s.fun}`);
}
console.log(`Gesamt: ${total} Fragen in ${files.length} Dateien.`);

const index = JSON.stringify({ files, count: total }, null, 1) + '\n';
const indexPath = join(dir, 'index.json');
if (checkOnly) {
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== index) errors.push('data/questions/index.json ist veraltet – bitte "node scripts/validate.mjs" ausführen und committen');
} else if (!errors.length) writeFileSync(indexPath, index);

if (errors.length) {
  console.error(`\n${errors.length} Fehler:\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log('Alles gültig.');
