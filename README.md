# Boxenfunk – das F1-Quiz

Ein F1-Quiz mit Augenzwinkern, als rein statische Web-App für GitHub Pages.
Inoffizielles Fanprojekt – keine Verbindung zur Formel 1, zur FIA oder zu den Teams.

> **Stand: Etappe (a)** – Solo-Modus mit kuratierten Fragen. Design-Feinschliff, Speicherstände,
> Mehrspieler, Jeopardy und der Fragen-Generator folgen in den nächsten Etappen.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver, Adresse steht im Terminal
npm test           # Tests der Spiellogik und der Fragendateien
npm run validate   # Fragen gegen das JSON-Schema prüfen
npm run build      # statische Seite nach dist/
```

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/core/` | Spiellogik als reine Funktionen: Fragen ziehen, Punkte, Rundenablauf |
| `src/storage/` | Speicherzugriff mit Fallback, Bestenliste |
| `src/ui/` | Bildschirme (Start, Solo, Bestenliste) |
| `data/questions/curated/` | handgeschriebene Fragen |
| `data/questions/generated/` | automatisch erzeugte Fragen (bisher: Streckenumrisse) |
| `data/questions/review/` | Vorschläge, die nie ungeprüft ins Spiel kommen |
| `data/schema/question.schema.json` | Schema aller Fragendateien |
| `public/assets/` | Streckenumrisse und Flaggen als SVG |
| `scripts/` | `validate.mjs`, `build-tracks.mjs` |

## Fragen ergänzen

Neue Frage in eine Datei unter `data/questions/curated/` eintragen und `npm run validate` ausführen.
Pflichtfelder: `id`, `type` (`mc`, `tf`, `estimate`, `image`, `order`), `category`, `difficulty` (1–5),
`tags`, `question`, `explanation`, `source`, `generated`, `lastVerified`. Je nach Typ kommen
`options` + `answer`, `tolerance` + `unit`, `items` (in richtiger Reihenfolge) oder `image` dazu.
Das Tag `spass` markiert Spaßfragen, `year` steuert den Zeitraum-Filter, `validUntil` lässt
Fragen zu veränderlichen Fakten automatisch auslaufen.

## Datenquellen und Lizenzen

- Streckenumrisse: erzeugt aus [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT), siehe `data/sources/`.
- Flaggen-Grafiken: selbst erstellt.
