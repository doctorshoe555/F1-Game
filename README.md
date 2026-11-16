# Boxenfunk – das F1-Quiz

Ein Formel-1-Quiz mit Augenzwinkern: echtes Wissen, Funksprüche, Pannen, Teamchef-Sprüche und ein
Jeopardy-Modus mit Buzzern. Läuft als rein statische Web-App auf GitHub Pages – ohne Server, ohne Login,
ohne App-Installation.

Inoffizielles Fanprojekt. Keine Verbindung zur Formel 1, zur FIA, zu Teams oder Fahrern; es werden keine
offiziellen Logos, Marken oder Schriften verwendet.

## Inhalt

- [Spielmodi](#spielmodi)
- [Starten und entwickeln](#starten-und-entwickeln)
- [Veröffentlichen auf GitHub Pages](#veröffentlichen-auf-github-pages)
- [Fragen](#fragen)
- [Automatisches Fragen-Update](#automatisches-fragen-update)
- [Spielstände](#spielstände)
- [Technik](#technik)
- [Datenquellen und Lizenzen](#datenquellen-und-lizenzen)

## Spielmodi

### Solo

10, 20 oder 30 Fragen gegen die Uhr. Für jede richtige Antwort gibt es 500 Punkte plus bis zu 500 Punkte
Zeitbonus. Schätzfragen werden nach Nähe zur Lösung gestaffelt, Sortierfragen geben Teilpunkte. Das Ergebnis
landet in der Bestenliste und in der Historie.

### Ein Gerät, viele Fahrer (Pass-and-Play)

2 bis 8 Spieler beantworten reihum je eine eigene Frage. Vor jeder Frage erscheint „Gerät weitergeben an …“;
die Uhr läuft erst nach „Bereit“.

### Party per Handy

1. Auf dem großen Gerät (Laptop, TV, Tablet) „Party per Handy“ öffnen. Es zeigt Raum-Code und QR-Code.
2. Alle scannen den Code, wählen Name, Avatar und Teamfarbe und sind im Raum.
3. Der Host wählt die Spielart – **Quiz-Rennen** (alle antworten gleichzeitig) oder **Grand Prix Jeopardy** –
   und startet.

**Verbindungsabbruch:** Wer die Verbindung verliert, verbindet sich automatisch neu. Über denselben Link und
denselben Namen kommt man auch von einem anderen Gerät wieder hinein und behält seine Punkte. Lädt der Host
neu, bleiben Raum-Code und Spielstand erhalten.

**Ausprobieren ohne Handy:** Mit `?net=local` (z. B. `http://localhost:5173/?net=local#/host`) laufen Host
und Mitspieler in mehreren Tabs desselben Browsers, ganz ohne Vermittlungsdienst.

### Grand Prix Jeopardy

An **einem Gerät** (Startseite → „Grand Prix Jeopardy“; gebuzzert wird per Schaltfläche oder mit den Tasten
1–8) oder **per Handy** (über „Party per Handy“, dann ist jedes Handy ein Buzzer).

- **Board:** 5 oder 6 Kategorien × 5 Felder (100–500), zufällig aus dem Fragenpool gezogen; in Runde 2 mit
  neuen Kategorien und doppelten Werten. Je höher der Wert, desto schwerer die Frage.
- **Ablauf:** Wer zuletzt richtig lag, wählt das Feld. Nach einer kurzen Lesezeit sind die Buzzer frei; wer
  zu früh drückt, ist kurz gesperrt. Falsch = Punktabzug, danach dürfen die anderen noch einmal buzzern.
- **Safety Car:** In Runde 1 ist ein Feld versteckt, in Runde 2 sind es zwei. Wer es erwischt, spielt allein
  und bestimmt den Einsatz selbst.
- **Schätzfragen** spielen alle: Die beste Schätzung bekommt den Feldwert, Abzug gibt es keinen.
- **Finale Runde:** Alle kennen nur die Kategorie und setzen geheim. Danach kommt die Frage.
- **Antworten:** „Auswahl“ (antippen), „Freitext“ (eintippen; Tippfehler, fehlende Vornamen und die
  Frageform werden verziehen) oder „Spielleiter“ (laut antworten, der Host wertet per Klick oder mit den
  Tasten R und F).
- **Gag-Schalter:** „Antwort als Frage formulieren“ – die Auflösung erscheint als „Wer oder was ist …?“.
- **Korrektur:** In der Auflösung kann der Host jede Wertung umdrehen.

### Schwierigkeit und Filter

| Stufe | Wirkung |
|---|---|
| Sonntagsfahrer | vor allem Schwierigkeit 1–2 |
| Stammgast | Schwerpunkt auf 3, etwas 2 und 4 |
| Boxenfunk-Profi | vor allem 4–5 |
| Bwoah-Modus | alles gemischt, Spaßfragen fünfmal so wahrscheinlich |

Die Stufen sind Gewichtungen auf dem Feld `difficulty`. Zusätzlich lässt sich nach Kategorie und Zeitraum
filtern (z. B. „ab 2000“); zeitlose Fragen bleiben immer dabei. Kürzlich gespielte Fragen kommen seltener.

## Starten und entwickeln

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev               # Entwicklungsserver; Adresse steht im Terminal
npm run dev -- --host     # zusätzlich im WLAN erreichbar (für echte Handys)
npm test                  # Tests für Spiellogik, Fragendateien und Generator
npm run validate          # Fragen gegen das JSON-Schema prüfen
npm run build             # statische Seite nach dist/
npm run preview           # gebaute Seite lokal ansehen (inklusive Offline-Cache)
```

## Veröffentlichen auf GitHub Pages

Der Workflow `.github/workflows/deploy.yml` prüft die Fragen, lässt die Tests laufen, baut die Seite und
veröffentlicht sie bei jedem Push auf `main`.

Einmalig im Repository einstellen:

1. **Settings → Pages → Build and deployment → Source:** „GitHub Actions“.
2. Für das automatische Fragen-Update: **Settings → Actions → General → Workflow permissions:**
   „Allow GitHub Actions to create and approve pull requests“ aktivieren.

Die App benutzt relative Pfade und Hash-Routen (`…/#/admin`), läuft also unter jeder Pages-Adresse ohne
Anpassung. Liegt das Repository woanders als `doctorshoe555/F1-Game`, bitte `REPO_URL` in `src/config.ts`
anpassen – dorthin führen die „Frage falsch?“-Meldungen.

## Fragen

### Aufbau

| Ordner | Inhalt | Im Spiel? |
|---|---|---|
| `data/questions/curated/` | handgeschriebene Fragen, vor allem die mit Augenzwinkern | ja |
| `data/questions/generated/` | automatisch erzeugte Fragen (Statistik, Streckenumrisse) | ja |
| `data/questions/review/` | ungeprüfte Vorschläge (z. B. vom optionalen LLM-Schritt) | **nein** |

Jede Datei hat die Form `{ "questions": [ … ] }` und wird gegen `data/schema/question.schema.json` geprüft.
Die Kategorien stehen in `data/categories.json`.

### Felder

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig, nur `a–z`, `0–9` und `-` |
| `type` | `mc` (Auswahl), `tf` (wahr/falsch), `estimate` (Schätzfrage), `image` (Bildfrage), `order` (sortieren) |
| `category` | id aus `data/categories.json` |
| `difficulty` | 1 (leicht) bis 5 (Nerd-Wissen) |
| `tags` | freie Schlagwörter; `spass` markiert Spaßfragen |
| `question`, `explanation` | Fragetext und die Erklärung, die nach der Auflösung erscheint |
| `options`, `answer` | bei `mc`/`image`: Antwortoptionen und Index der richtigen (ab 0); bei `tf`: `true`/`false`; bei `estimate`: die Zahl |
| `tolerance`, `unit` | nur `estimate`: Abweichung, ab der es 0 Punkte gibt, und die Einheit |
| `items` | nur `order`: die Elemente **in der richtigen Reihenfolge** |
| `image` | nur `image`: `url`, `license`, `author`, `source` – erscheint automatisch auf der Credits-Seite |
| `accept` | optional: weitere Schreibweisen, die im Freitext-Modus als richtig gelten |
| `year` | optional: Bezugsjahr für den Zeitraum-Filter |
| `source`, `generated`, `lastVerified` | Herkunft, ob automatisch erzeugt, und wann zuletzt geprüft |
| `validFrom`, `validUntil` | optional: Frage gilt nur in diesem Zeitraum (für Fakten, die sich ändern) |

### Eine Frage ergänzen

In eine Datei unter `data/questions/curated/` eintragen, zum Beispiel:

```json
{"id":"pan-99","type":"mc","category":"pannen","difficulty":2,"tags":["spass"],
 "question":"Hier steht die Frage?","options":["Richtig","Falsch A","Falsch B","Falsch C"],"answer":0,
 "explanation":"Kurz, witzig oder lehrreich.","source":"kuratiert","generated":false,"lastVerified":"2026-11-16"}
```

Danach `npm run validate` und `npm test` ausführen. Leitlinien für den Ton: etwa 70 % echtes Wissen, 30 %
Augenzwinkern; Zitate kurz halten; nichts Beleidigendes; keine Häme über Unfälle mit Verletzten.

### Im Spiel: „Fragen verwalten“

Im Seitenfuß führt „Fragen verwalten“ zur Admin-Seite (`#/admin`):

- **Durchsuchen:** alle Fragen nach Text, Kategorie, Typ und Herkunft filtern, Antwort und Erklärung ansehen.
- **Melden:** „Frage falsch?“ öffnet ein vorausgefülltes GitHub-Issue. Denselben Link gibt es nach jeder
  Auflösung im Solo- und Pass-and-Play-Spiel.
- **Eigene Fragen:** JSON-Datei importieren (eine Vorlage lässt sich herunterladen), exportieren, löschen.
  Importierte Fragen liegen nur auf dem jeweiligen Gerät und sind sofort in allen Spielmodi dabei.

### Bildfragen

Streckenumrisse und Flaggen sind selbst erzeugte SVGs. `npm run tracks` baut die Umrisse und die zugehörigen
Fragen aus `data/sources/f1-circuits.geojson` neu. Fragen mit Fotos („Welcher Helm?“, „Welches Auto?“) gibt
es noch nicht: Dafür braucht es frei lizenzierte Bilder mit Autor und Lizenz im Feld `image`.

## Automatisches Fragen-Update

`npm run update-questions` (Skript `scripts/update-questions.mjs`) holt Daten aus der Jolpica-F1-API und
erzeugt daraus per Template die Dateien `statistik.json`, `saison.json`, `rekorde.json` und `strecken.json`
in `data/questions/generated/`:

| Template | Beispiel | Distraktoren |
|---|---|---|
| Weltmeister, Vize, Konstrukteure je Saison | „Wer wurde 1982 Formel-1-Weltmeister?“ | die Nächstplatzierten derselben Saison |
| Zahl der Titel | „Wie viele WM-Titel hat Alain Prost gewonnen?“ | benachbarte Zahlen |
| Rennsieger (letzte und laufende Saison) | „Wer gewann 2025 den Großen Preis von Japan?“ | andere Sieger und Spitzenfahrer der Saison |
| Strecken | „Auf welcher Strecke wurde 2025 der Große Preis von … gefahren?“ | andere Strecken der Saison |
| Schätzfragen | „Wie viele Grands Prix hat Ayrton Senna gewonnen?“ | – |
| Sortierfragen | nach erstem Titel, nach Zahl der Siege | – |
| Aktuelles | amtierender Weltmeister, Teams und Teamkollegen der Saison | Fahrer und Teams des aktuellen Felds |

Eigenschaften:

- **Cache und Rücksicht:** Antworten liegen in `.cache/jolpica/`; abgeschlossene Saisons werden nie erneut
  abgefragt. Zwischen zwei Anfragen liegen mindestens 0,7 Sekunden, bei „429 Too Many Requests“ wartet das
  Skript. Ein Lauf ohne Cache braucht rund 200 Anfragen (erlaubt sind 500 pro Stunde).
- **Aktuelle Fakten laufen ab:** Fragen zu aktiven Fahrern, zum amtierenden Weltmeister und zu den
  Fahrerpaarungen tragen `validUntil` und werden bei jedem Lauf neu erzeugt.
- **Keine Dubletten:** Fragen, die es wortgleich schon kuratiert gibt, werden verworfen.
- **Sicherheitsnetz:** Vor dem Schreiben wird alles gegen das Schema geprüft. Schlägt etwas fehl, bleibt der
  alte Stand unverändert.
- **Ruhige Diffs:** Gleiche Daten ergeben exakt dieselben Dateien; `lastVerified` ändert sich nur, wenn sich
  eine Frage ändert.
- Optionen: `--dry-run` (nichts schreiben) und `--offline` (nur Cache).

Weil generierte Fragen eher trocken sind, zieht das Spiel sie nur halb so häufig wie handgeschriebene.

### GitHub Action

`.github/workflows/update-questions.yml` läuft jeden Montagmorgen – also wöchentlich und damit nach jedem
Grand-Prix-Wochenende – und lässt sich von Hand starten (Actions → „Fragen aktualisieren“ → „Run workflow“).
Sie erzeugt die Fragen neu, prüft sie, lässt die Tests laufen und öffnet bei Änderungen einen Pull Request
auf dem Zweig `auto/fragen-update` (ein bereits offener wird aktualisiert). Erst nach dem Mergen kommen die
Fragen ins Spiel.

### Optional: Vorschläge von einem Sprachmodell

`scripts/llm-suggest.mjs` lässt Claude neue Spaßfragen vorschlagen und trockene Generator-Erklärungen
lockerer formulieren. Die Ergebnisse landen **ausschließlich** in `data/questions/review/` und damit nie
ungeprüft im Spiel – ein Mensch prüft die Fakten und übernimmt, was taugt, von Hand nach `curated/`.

- **Einschalten:** Repository-Secret `ANTHROPIC_API_KEY` anlegen. Der Schritt verursacht API-Kosten.
- **Ausschalten:** Secret weglassen oder die Repository-Variable `LLM_SUGGESTIONS` auf `off` setzen.
- Fehler in diesem Schritt (kein Guthaben, Ablehnung, ungültige Ausgabe) lassen das Update nicht scheitern.

## Spielstände

- Laufende Spiele – Solo, Pass-and-Play und Jeopardy samt Board, Einsätzen und Punkten – werden nach jedem
  Schritt automatisch im Browser gesichert und lassen sich über „Weiterspielen“ fortsetzen.
- Unter „Speichern & Pause“ lassen sich benannte Stände anlegen und als JSON-Datei exportieren; die Seite
  „Spielstände“ importiert solche Dateien wieder – etwa auf einem anderen Gerät.
- Ein per Handy gespielter Jeopardy-Stand lässt sich fortsetzen: Der Host eröffnet einen neuen Raum, die
  Fahrer steigen mit ihrem Namen wieder ein.
- „Historie“ zeigt die letzten 100 Spiele und eine Statistik je Fahrername.
- Erlaubt der Browser kein Speichern, läuft alles im Arbeitsspeicher weiter; die App weist darauf hin.
- Alles liegt nur auf dem jeweiligen Gerät. Es gibt keine gemeinsame Online-Bestenliste.

## Technik

### Stack

**Vite + TypeScript ohne UI-Framework.** Die Spiellogik besteht aus reinen, typisierten Funktionen
(`src/core/`) und ist mit Vitest getestet. Die Oberfläche hat wenige Bildschirme, die bei jeder
Zustandsänderung neu gezeichnet werden – dafür lohnt sich kein Framework. Das Ergebnis ist eine kleine
statische Seite.

**PWA:** Nach dem ersten Laden liegen App, Fragen, Schriften und Streckenumrisse im Cache. Solo,
Pass-and-Play und Jeopardy an einem Gerät laufen dann auch ohne Netz; „Party per Handy“ braucht für den
Verbindungsaufbau weiterhin Internet.

### Warum PeerJS (WebRTC) und nicht Firebase oder Supabase?

GitHub Pages hat keinen Server, also müssen die Geräte direkt miteinander reden oder einen fremden Dienst nutzen.

| | PeerJS (gewählt) | Firebase / Supabase |
|---|---|---|
| Einrichtung | keine – kein Konto, keine Schlüssel im Repo | Projekt anlegen, Schlüssel und Zugriffsregeln pflegen |
| Host als Wahrheit | ergibt sich von selbst: Alle Handys hängen sternförmig am Host | müsste über Datenbankregeln erzwungen werden |
| Latenz (Buzzer) | Datenkanal direkt von Gerät zu Gerät | Umweg über den Server |
| Schwächen | öffentlicher Vermittlungsdienst ohne Garantie; manche Mobilfunk- und Firmennetze blockieren WebRTC | Kontingentgrenzen, Abhängigkeit von einem Konto |

Der öffentliche PeerJS-Dienst wird nur für den Verbindungsaufbau gebraucht; danach laufen die Daten direkt
zwischen Host und Handy. Am zuverlässigsten klappt es, wenn alle im selben WLAN sind. Die Transport-Schicht
(`src/net/transport.ts`) ist austauschbar, falls später doch ein anderer Dienst nötig wird.

### Der Host ist die Wahrheit

Der Host hält den gesamten Spielstand und schickt jedem Handy nur seine fertige Ansicht – ohne Lösungen und
ohne fremde Einsätze. Die Handys senden nur Aktionen (Antwort, Buzzer, Einsatz, Feldwahl).

### Fairness bei Buzzer und Zeitwertung

Jedes Handy gleicht seine Uhr laufend mit dem Host ab und meldet, wann getippt wurde. Der Host schreibt die
Netzlaufzeit gut, glaubt den Angaben aber nur in Grenzen: nie nach dem Eintreffen, höchstens 1,5 Sekunden
davor. Beim Buzzern sammelt er 250 Millisekunden lang alle Treffer und wertet den frühesten Zeitstempel –
nicht den, der zuerst ankam. Ohne Server ist das eine gute Näherung, keine Garantie.

### Ordner

| Pfad | Inhalt |
|---|---|
| `src/core/` | Spiellogik: Fragenauswahl, Punkte, Rundenablauf, Quiz-Rennen, Jeopardy, Teilnehmerliste |
| `src/net/` | Verbindung Host ↔ Handys: Transport (PeerJS / lokal), Protokoll, Uhrenabgleich |
| `src/storage/` | Speicherzugriff mit Fallback, Spielstände, Bestenliste, Historie, eigene Fragen |
| `src/ui/` | Bildschirme für Start, Spiel, Host, Handy, Jeopardy, Admin, Credits |
| `data/` | Fragen, Kategorien, Schema, Streckendaten |
| `scripts/` | `update-questions.mjs`, `llm-suggest.mjs`, `validate.mjs`, `build-tracks.mjs` |
| `tests/` | Tests für Spiellogik, Speicher, Fragendateien, Generator und Admin-Funktionen |
| `.github/workflows/` | `deploy.yml` (Bauen und Veröffentlichen), `update-questions.yml` (Fragen-Update) |

## Datenquellen und Lizenzen

| Was | Quelle | Lizenz / Bedingungen |
|---|---|---|
| Statistik-Fragen in `generated/` | [Jolpica-F1-API](https://github.com/jolpica/jolpica-f1) (Nachfolger von Ergast) | Daten unter CC BY-NC-SA 4.0; API nur für **nicht-kommerzielle** Nutzung, 500 Anfragen pro Stunde |
| Streckenumrisse | [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) | MIT (Kopie in `data/sources/`) |
| Flaggen, Icons, Schriftzug | selbst erstellt | – |
| Schriften | Barlow Condensed, Titillium Web | SIL Open Font License 1.1, lokal eingebunden |
| Kuratierte Fragen | handgeschrieben | – |
| Bibliotheken | PeerJS, qrcode-generator | MIT |

Wegen der Jolpica-Bedingungen ist das Projekt in dieser Form nur für nicht-kommerzielle Nutzung geeignet;
wer es kommerziell einsetzen will, muss die Dateien aus der Jolpica-API entfernen oder die Betreiber fragen.

**Geprüft, aber nicht eingebunden:** OpenF1, Wikidata und Wikimedia Commons waren als weitere Quellen
vorgesehen (etwa für frei lizenzierte Fotos). Sie waren aus der Entwicklungsumgebung nicht erreichbar und
sind deshalb weder getestet noch angebunden. Die Templates in `scripts/lib/templates.mjs` arbeiten auf einem
neutralen Datenmodell, sodass sich weitere Quellen ergänzen lassen.

Im Spiel listet die Seite „Credits & Lizenzen“ die Bildnachweise direkt aus den Fragendaten auf.
