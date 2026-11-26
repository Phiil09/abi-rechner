# Fachabi-Rechner (FOS Bayern)

Web-App (PWA) für das bayerische Fachabitur an der Fachoberschule. Du trägst einzelne Noten ein. Die App berechnet daraus Halbjahresergebnisse, Gesamtergebnisse und den Fachabi-Schnitt nach FOBOSO (Fassung ab 01.08.2026, ohne Fachreferat).

## Starten

Die App braucht einen kleinen Webserver, damit der Offline-Modus und die Installation funktionieren:

```bash
python3 -m http.server 8765 --directory ~/Documents/NOtenApp
```

Dann im Browser `http://localhost:8765` öffnen.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `calc.js` | Rechenlogik (Paragraphen im Kopfkommentar) |
| `presets.js` | Fächer je Ausbildungsrichtung nach Anlage 1 FOBOSO |
| `app.js` | Oberfläche |
| `index.html`, `style.css` | Seite und Design (hell/dunkel) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | PWA: Offline-Cache und Installation |
| `test/tests.js` | Tests der Rechenlogik |

## Tests

Ohne Node, mit der JavaScript-Engine von macOS:

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc calc.js presets.js test/tests.js
```

## Rechenregeln (Kurzfassung)

- Halbjahresergebnis (§ 21): Jede Schulaufgabe zählt so viel wie der gewichtete Schnitt aller kleinen Leistungsnachweise. Zwischenergebnisse werden nicht gerundet, das Ergebnis auf ganze Punkte (§ 19 Abs. 6).
- Prüfung (§ 35 Abs. 2): (2 × schriftlich + mündlich) / 3, unter 1 ergibt 0. Sie zählt dreifach. Schriftliche Prüfungen und die mündliche Prüfung in Englisch sind Pflicht.
- Fachpraktische Ausbildung: Halbjahresergebnis direkt eintragen oder aus (Anleitung + Vertiefung + 2 × Praktikum) / 4 berechnen (§ 13 Abs. 2). Die fpA-Gesamtnote zählt bei den Unterpunktungen mit.
- Einbringung (§ 35 Abs. 5): 4 Prüfungen, fpA (max. 30) und 25 Halbjahre aus 11/2, 12/1, 12/2. 11/1 zählt nur bei Fächern, die in der 11. Klasse enden. Höchstens ein Halbjahr pro Fach darf wegfallen (SWW: 2 + 2 × WPF, GTAG: 1 + 2 × WPF Streichungen).
- Streichen, Schalter „Streichen“ (Fachabi und Abitur getrennt):
  - Aus (Standard): Gestrichen wird erst am Ende der 12. bzw. 13. Klasse, deshalb streicht die App zunächst nichts. Alle einbringbaren Halbjahre zählen mit, auch 11/1 bei Fächern, die in der 11. enden. Damit E und Schnitt vergleichbar bleiben, wird der Halbjahresteil auf 25 Halbjahre (Abitur: 16) umgerechnet: Summe der Halbjahrespunkte × 25 / Anzahl der Halbjahre, ebenso die Höchstpunktzahl, ohne Zwischenrundung. Halbjahre ohne Note (k) zählen dabei nicht mit (auch nicht als 0). Das Ergebnis heißt „Vorläufig: bestanden“ bzw. „Vorläufig: nicht bestanden“, die Regeln (auch 195/234 Punkte) gelten mit dem umgerechneten E.
  - Ein: Die App schlägt vor, welche Halbjahre wegfallen (gestrichelt), wie das Streichvorschlag-Tool der FOS: je Fach das schwächste Halbjahr (bei Gleichstand das frühere). Reihenfolge: Halbjahre ohne Note (k), Rettung eines Gesamtergebnisses unter 4 Punkten (wenn fürs Bestehen nötig), dann die niedrigsten Punkte. Streichungen, die eine neue Unterpunktung erzeugen, nur wenn nötig. Vorschläge gibt es in einem Fach erst, wenn alle seine Halbjahre feststehen. Du kannst Halbjahre antippen, um sie selbst zu streichen oder zurückzuholen (pro Fach höchstens eins, insgesamt so viele wie nötig). Ohne eigene Wahl gibt es zusätzlich einen Tipp, wenn ein Tausch ein Gesamtergebnis verbessert, ohne den Schnitt zu ändern. Deine Auswahl bleibt gespeichert, auch wenn du „Streichen“ wieder ausschaltest. Die Pflicht-Halbjahre der 2. Fremdsprache (Abitur) kannst du nicht streichen.
  - Alte Stände und Sicherungen: „automatisch“ wird zu Aus, „manuell“ zu Ein (mit deiner Auswahl).
- Gesamtergebnis je Fach: erst auf zwei Nachkommastellen, dann auf ganze Punkte gerundet (wie im Tool).
- Bestehen (§ 35 Abs. 9): höchstens 2 Prüfungs- und 2 Gesamtergebnisse unter 4 Punkten (0 zählt doppelt); bei einer Unterpunktung mindestens 195, bei zweien 234 Punkte. Ein k-Halbjahr, das nicht gestrichen werden kann, heißt nicht bestanden.
- Schnitt (§ 27 Abs. 3): 17/3 − 5 × E / 585, auf eine Nachkommastelle abgeschnitten (nicht gerundet).
- Abitur (13. Klasse, § 35 Abs. 7): 4 Prüfungen × 2, Seminar × 2 und 16 Halbjahre aus 13/1 und 13/2 = 390 Punkte (mit 2. Fremdsprache 420).

## Funktionen

- Alle Ausbildungsrichtungen (Technik, ABU, Wirtschaft, IW, Sozial, Gesundheit, Gestaltung), Klasse 11 bis 13
- Fächer frei hinzufügen, umbenennen, umsortieren, Farbe wählen, als Wahlpflichtfach markieren
- Gewichtung für jede Note einzeln einstellbar (auch Schulaufgaben), Standardgewichte je Notenart
- Farbverlauf von Rot (0 Punkte) über Orange (um 7 Punkte) bis Grün (15 Punkte)
- Statistik: Anzahl Noten, Einser, Zweier usw., Verteilung nach Punkten, Fächer nach Schnitt
- Sicherung als JSON-Datei herunterladen und wieder laden
