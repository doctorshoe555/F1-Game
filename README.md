# Boxenfunk – das F1-Quiz

Ein F1-Quiz mit Augenzwinkern, als rein statische Web-App für GitHub Pages.
Inoffizielles Fanprojekt – keine Verbindung zur Formel 1, zur FIA oder zu den Teams.

> **Stand: Etappe (d)** – Solo, Pass-and-Play und „Party per Handy“ (Host mit QR-Code, Mitspielen im
> Browser). Jeopardy und der Fragen-Generator folgen.

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
