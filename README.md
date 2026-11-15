# Boxenfunk – das F1-Quiz

Ein F1-Quiz mit Augenzwinkern, als rein statische Web-App für GitHub Pages.
Inoffizielles Fanprojekt – keine Verbindung zur Formel 1, zur FIA oder zu den Teams.

> **Stand: Etappe (c)** – Solo und Pass-and-Play (2–8 Spieler an einem Gerät) mit Speicherständen,
> Bestenliste und Historie. Mehrspieler per Handy, Jeopardy und der Fragen-Generator folgen.

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
| `src/storage/` | Speicherzugriff mit Fallback, Spielstände, Bestenliste, Historie |
| `src/ui/` | Bildschirme (Start, Einstellungen, Spiel, Spielstände, Historie, Credits) |
| `data/questions/curated/` | handgeschriebene Fragen |
| `data/questions/generated/` | automatisch erzeugte Fragen (bisher: Streckenumrisse) |
| `data/questions/review/` | Vorschläge, die nie ungeprüft ins Spiel kommen |
| `data/schema/question.schema.json` | Schema aller Fragendateien |
| `public/assets/` | Streckenumrisse und Flaggen als SVG |
| `scripts/` | `validate.mjs`, `build-tracks.mjs` |

## Spielstände

- Laufende Spiele werden nach jedem Schritt automatisch im Browser gesichert (localStorage) und lassen sich
  nach Neuladen oder Schließen über „Weiterspielen“ fortsetzen. Beim Fortsetzen startet die Uhr der
  aktuellen Frage neu.
- Unter „Speichern & Pause“ im Spiel lassen sich benannte Stände anlegen und als JSON-Datei exportieren;
  die Seite „Spielstände“ importiert solche Dateien wieder – etwa auf einem anderen Gerät.
- Erlaubt der Browser kein Speichern, läuft alles im Arbeitsspeicher weiter; die App weist darauf hin.
- Bestenliste, Historie und Spielstände liegen nur auf dem jeweiligen Gerät.

## Fragen ergänzen

Neue Frage in eine Datei unter `data/questions/curated/` eintragen und `npm run validate` ausführen.
Pflichtfelder: `id`, `type` (`mc`, `tf`, `estimate`, `image`, `order`), `category`, `difficulty` (1–5),
`tags`, `question`, `explanation`, `source`, `generated`, `lastVerified`. Je nach Typ kommen
`options` + `answer`, `tolerance` + `unit`, `items` (in richtiger Reihenfolge) oder `image` dazu.
Das Tag `spass` markiert Spaßfragen, `year` steuert den Zeitraum-Filter, `validUntil` lässt
Fragen zu veränderlichen Fakten automatisch auslaufen.

## Datenquellen und Lizenzen

- Streckenumrisse: erzeugt aus [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT), siehe `data/sources/`.
- Flaggen-Grafiken und Icons: selbst erstellt.
- Schriften: Barlow Condensed und Titillium Web (SIL Open Font License 1.1), lokal eingebunden.
- Im Spiel listet die Seite „Credits & Lizenzen“ alle Bildnachweise aus den Fragendaten auf.
