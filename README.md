# Boxenfunk – das F1-Quiz

Ein F1-Quiz mit Augenzwinkern, als rein statische Web-App für GitHub Pages.
Inoffizielles Fanprojekt – keine Verbindung zur Formel 1, zur FIA oder zu den Teams.

> **Stand: Etappe (e)** – Solo, Pass-and-Play, „Party per Handy“ und Grand Prix Jeopardy.
> Der Fragen-Generator samt Admin-Seite, PWA und Deploy folgt in Etappe (f).

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
| `src/net/` | Verbindung Host ↔ Handys: Transport (PeerJS / lokal), Protokoll, Uhrenabgleich |
| `src/storage/` | Speicherzugriff mit Fallback, Spielstände, Bestenliste, Historie |
| `src/ui/` | Bildschirme (Start, Einstellungen, Spiel, Spielstände, Historie, Credits) |
| `data/questions/curated/` | handgeschriebene Fragen |
| `data/questions/generated/` | automatisch erzeugte Fragen (bisher: Streckenumrisse) |
| `data/questions/review/` | Vorschläge, die nie ungeprüft ins Spiel kommen |
| `data/schema/question.schema.json` | Schema aller Fragendateien |
| `public/assets/` | Streckenumrisse und Flaggen als SVG |
| `scripts/` | `validate.mjs`, `build-tracks.mjs` |

## Party per Handy

1. Auf dem großen Gerät (Laptop, TV, Tablet) „Party per Handy“ öffnen. Es zeigt Raum-Code und QR-Code.
2. Alle scannen den Code, wählen Name, Avatar und Teamfarbe und sind im Raum – ohne App, ohne Login.
3. Der Host stellt Länge, Stufe und Filter ein und startet. Alle beantworten dieselbe Frage gleichzeitig
   auf dem Handy; der große Bildschirm zeigt Frage, Auflösung und Rangliste.

**Verbindungsabbruch:** Wer die Verbindung verliert, verbindet sich automatisch neu. Über denselben Link
und denselben Namen kommt man auch von einem anderen Gerät wieder hinein und behält seine Punkte. Lädt der
Host neu, bleiben Raum-Code und Spielstand erhalten; die Handys finden von selbst zurück.

**Ausprobieren ohne Netz:** Mit `?net=local` (z. B. `http://localhost:5173/?net=local#/host`) laufen
Host und Mitspieler in mehreren Tabs desselben Browsers, ganz ohne Vermittlungsdienst.

## Grand Prix Jeopardy

Zwei Wege: an **einem Gerät** (Startseite → „Grand Prix Jeopardy“, gebuzzert wird per Schaltfläche oder mit
den Tasten 1–8) oder **per Handy** (Startseite → „Party per Handy“, in der Lobby die Spielart „Grand Prix
Jeopardy“ wählen – dann ist jedes Handy ein Buzzer).

- **Board:** 5 oder 6 Kategorien × 5 Felder (100–500), zufällig aus dem Fragenpool gezogen; in Runde 2 mit
  neuen Kategorien und doppelten Werten. Je höher der Wert, desto schwerer die Frage.
- **Ablauf:** Wer zuletzt richtig lag, wählt das Feld. Nach einer kurzen Lesezeit sind die Buzzer frei; wer
  zu früh drückt, ist kurz gesperrt. Falsch = Punktabzug, danach dürfen die anderen noch einmal buzzern.
- **Safety Car:** In Runde 1 ist ein Feld versteckt, in Runde 2 sind es zwei. Wer es erwischt, spielt allein
  und bestimmt den Einsatz selbst (5 bis zum eigenen Punktestand, mindestens bis zum höchsten Feldwert).
- **Schätzfragen** spielen alle: Die beste Schätzung bekommt den Feldwert, Abzug gibt es keinen.
- **Finale Runde:** Alle kennen nur die Kategorie und setzen geheim (bis zum eigenen Punktestand, mindestens
  bis 500). Danach kommt die Frage.
- **Antworten:** „Auswahl“ (antippen), „Freitext“ (eintippen; Tippfehler, fehlende Vornamen und die
  Frageform werden verziehen – bei langen Lösungen gibt es stattdessen die Auswahl) oder „Spielleiter“
  (laut antworten, der Host wertet per Klick bzw. mit den Tasten R und F).
- **Gag-Schalter:** „Antwort als Frage formulieren“ – die Auflösung erscheint als „Wer oder was ist …?“.
  Wer es vergisst, bekommt nur einen augenzwinkernden Hinweis.
- **Korrektur:** In der Auflösung kann der Host jede Wertung mit „doch richtig“ / „doch falsch“ umdrehen.

**Buzzer-Fairness per Handy:** Der Host wertet nicht den ersten eintreffenden Treffer, sondern sammelt
250 Millisekunden lang und nimmt dann den frühesten Zeitstempel – mit dem unten beschriebenen Ausgleich.

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

### Fairness bei Zeitwertungen

Jedes Handy gleicht seine Uhr laufend mit dem Host ab und meldet, wann getippt wurde. Der Host schreibt die
Netzlaufzeit gut, glaubt den Angaben aber nur in Grenzen: nie nach dem Eintreffen, höchstens 1,5 Sekunden
davor und nie vor Fragenbeginn. Eine verstellte Uhr bringt also wenig. Ohne Server ist das eine gute
Näherung, keine Garantie.

## Spielstände

- Laufende Spiele werden nach jedem Schritt automatisch im Browser gesichert (localStorage) und lassen sich
  nach Neuladen oder Schließen über „Weiterspielen“ fortsetzen. Beim Fortsetzen startet die Uhr der
  aktuellen Frage neu.
- Unter „Speichern & Pause“ im Spiel lassen sich benannte Stände anlegen und als JSON-Datei exportieren;
  die Seite „Spielstände“ importiert solche Dateien wieder – etwa auf einem anderen Gerät.
- Erlaubt der Browser kein Speichern, läuft alles im Arbeitsspeicher weiter; die App weist darauf hin.
- Jeopardy-Spiele (Board, Einsätze, Punkte) werden genauso gesichert. Ein per Handy gespielter Stand lässt
  sich fortsetzen: Der Host eröffnet dafür einen neuen Raum, die Fahrer steigen mit ihrem Namen wieder ein.
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
