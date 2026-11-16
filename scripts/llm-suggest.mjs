#!/usr/bin/env node
// OPTIONAL: Lässt Claude neue Spaßfragen vorschlagen und trockene Generator-Erklärungen lockerer formulieren.
// Die Ergebnisse landen AUSSCHLIESSLICH in data/questions/review/ – dieser Ordner wird nie ins Spiel gebündelt.
// Ein Mensch prüft die Fakten und verschiebt, was taugt, von Hand nach curated/.
//
//   ANTHROPIC_API_KEY=… node scripts/llm-suggest.mjs
// Ohne Schlüssel (oder mit LLM_SUGGESTIONS=off) tut das Skript nichts und endet erfolgreich.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { toReviewQuestions } from './lib/review.mjs';
import { seeded, pick } from './lib/templates.mjs';
import { validateQuestions } from './validate.mjs';

if (!process.env.ANTHROPIC_API_KEY || process.env.LLM_SUGGESTIONS === 'off') {
  console.log('LLM-Schritt übersprungen (kein ANTHROPIC_API_KEY gesetzt oder LLM_SUGGESTIONS=off).');
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const date = new Date().toISOString().slice(0, 10);
const read = (folder) => readdirSync(join(root, 'data/questions', folder)).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(root, 'data/questions', folder, f), 'utf8')).questions ?? []);
const curated = read('curated');
const generated = read('generated');
const categories = JSON.parse(readFileSync(join(root, 'data/categories.json'), 'utf8'));
const rnd = seeded(date);
const style = pick(curated.filter((q) => q.tags.includes('spass') && (q.type === 'mc' || q.type === 'tf')), 8, rnd);
const dry = pick(generated.filter((q) => q.id.startsWith('gen-wm-') || q.id.startsWith('gen-sieg-')), 10, rnd);

const Output = z.object({
  suggestions: z.array(z.object({
    type: z.enum(['mc', 'tf']),
    category: z.string(),
    difficulty: z.number(),
    question: z.string(),
    options: z.array(z.string()),
    answerIndex: z.number(),
    answerBool: z.boolean(),
    explanation: z.string(),
  })),
  rephrased: z.array(z.object({ id: z.string(), explanation: z.string() })),
});

const system = `Du schreibst Fragen für „Boxenfunk“, ein deutschsprachiges Formel-1-Quiz mit Augenzwinkern.

Ton: locker und witzig, aber fair. Jede Frage bekommt eine kurze Erklärung (ein bis zwei Sätze), die nach der Auflösung erscheint – witzig oder lehrreich.
Regeln:
- Nur Fakten, bei denen du dir sicher bist. Lieber eine Frage weniger als eine wacklige. Ein Mensch prüft alles nach, aber mach es ihm leicht.
- Zitate nur kurz. Nichts Beleidigendes. Keine Häme über Unfälle mit Verletzten oder Todesfälle.
- Keine Fragen zu Dingen, die sich laufend ändern (aktuelle Tabellenstände, laufende Rekorde ohne Stichtag).
- Themen: Funksprüche, Teamchef-Sprüche, Pannen, kuriose Regeln und Strafen, Drive to Survive, Filme und Spiele, Promis im Fahrerlager, Technik im Alltag, Fitness der Fahrer.
- Typ „mc“: vier Optionen, genau eine richtig; die falschen plausibel, gern eine augenzwinkernde. Typ „tf“: eine Aussage, die wahr oder falsch ist.
- Bei „mc“ answerIndex setzen (0-basiert) und answerBool auf false; bei „tf“ answerBool setzen, options leer lassen und answerIndex auf 0.
- difficulty von 1 (weiß jeder Gelegenheitszuschauer) bis 5 (Nerd-Wissen).`;

const user = `Kategorien (id – Titel):
${categories.map((c) => `${c.id} – ${c.title}`).join('\n')}

So klingen vorhandene Spaßfragen:
${JSON.stringify(style.map(({ type, category, difficulty, question, options, answer, explanation }) => ({ type, category, difficulty, question, options, answer, explanation })), null, 1)}

Diese Fragen gibt es schon – bitte nichts davon wiederholen:
${curated.map((q) => `- ${q.question}`).join('\n')}

Aufgabe 1: Schlage 8 neue Spaßfragen vor, verteilt über verschiedene Kategorien.

Aufgabe 2: Die folgenden automatisch erzeugten Fragen haben sehr trockene Erklärungen. Formuliere jede Erklärung lockerer, ohne neue Fakten zu erfinden – benutze nur, was in der vorhandenen Erklärung steht. Gib id und neue Erklärung zurück.
${JSON.stringify(dry.map(({ id, question, explanation }) => ({ id, question, explanation })), null, 1)}`;

const client = new Anthropic();
let response;
try {
  response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: zodOutputFormat(Output) },
  });
} catch (error) {
  // Der LLM-Schritt ist Kür: Ein Fehler hier darf das Fragen-Update nicht scheitern lassen.
  if (error instanceof Anthropic.AuthenticationError) console.log('LLM-Schritt übersprungen: Der API-Schlüssel wurde abgelehnt.');
  else if (error instanceof Anthropic.RateLimitError) console.log('LLM-Schritt übersprungen: Rate-Limit erreicht.');
  else if (error instanceof Anthropic.APIError) console.log(`LLM-Schritt übersprungen: API-Fehler ${error.status}.`);
  else console.log(`LLM-Schritt übersprungen: ${error instanceof Error ? error.message : error}`);
  process.exit(0);
}
if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
  console.log(`LLM-Schritt ohne Ergebnis (stop_reason: ${response.stop_reason}).`);
  process.exit(0);
}

const questions = toReviewQuestions(response.parsed_output, { date, categories: categories.map((c) => c.id), existing: [...curated, ...generated] });
const errors = validateQuestions(questions, 'review');
if (errors.length) { console.log(`LLM-Vorschläge verworfen – sie bestehen die Schema-Prüfung nicht:\n- ${errors.slice(0, 10).join('\n- ')}`); process.exit(0); }
if (!questions.length) { console.log('Keine brauchbaren Vorschläge.'); process.exit(0); }
mkdirSync(join(root, 'data/questions/review'), { recursive: true });
const file = join(root, 'data/questions/review', `llm-${date}.json`);
writeFileSync(file, '{"questions":[\n' + questions.map((q) => JSON.stringify(q)).join(',\n') + '\n]}\n');
console.log(`${questions.length} Vorschläge nach data/questions/review/llm-${date}.json geschrieben (ungeprüft, nicht im Spiel).`);
