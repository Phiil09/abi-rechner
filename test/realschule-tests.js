/*
 * Tests der Realschul- und Notenskala-Logik. Laufen ohne Node mit der macOS-JavaScript-Engine:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc realschule.js test/realschule-tests.js
 * oder mit Node:  node test/realschule-tests.js
 */
/* global Realschule */
(function () {
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const R = isNode ? require('../realschule.js') : Realschule;
  const log = typeof print === 'function' && !isNode ? print : console.log;

  let ok = 0;
  let fail = 0;
  function eq(name, ist, soll) {
    const gleich = JSON.stringify(ist) === JSON.stringify(soll);
    if (gleich) ok++;
    else { fail++; log(`FEHLER: ${name}: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`); }
  }
  const nah = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;

  const SYS = R.standardSystem(); // Noten, Schulaufgaben doppelt, Tendenz 0,25, bis ,49 besser / ab ,50 schlechter
  const sys = (extra) => ({ ...SYS, ...extra });

  // ---------- Tendenzen ----------
  eq('Label 2-', R.noteLabel('2-'), '2-');
  eq('Label 2− (echtes Minus)', R.noteLabel('2−'), '2-');
  eq('Label 2– (Halbgeviertstrich)', R.noteLabel('2–'), '2-');
  eq('Label 3+', R.noteLabel(' 3 + '), '3+');
  eq('Label Zahl 4', R.noteLabel(4), '4');
  eq('Label ungültig', [R.noteLabel('7'), R.noteLabel('0'), R.noteLabel(''), R.noteLabel('x'), R.noteLabel(null)], [null, null, null, null, null]);
  eq('2- mit 0,25', R.noteWert('2-', 0.25), 2.25);
  eq('2+ mit 0,25', R.noteWert('2+', 0.25), 1.75);
  eq('2- mit 0,33', R.noteWert('2-', 0.33), 2.33);
  eq('2+ mit 0,33', nah(R.noteWert('2+', 0.33), 1.67), true);
  eq('2- Tendenzen aus', R.noteWert('2-', 0), 2);
  eq('2+ Tendenzen aus', R.noteWert('2+', 0), 2);
  eq('1- und 5-', [R.noteWert('1-', 0.25), R.noteWert('5-', 0.25)], [1.25, 5.25]);
  eq('1+ und 6- bleiben in 1 bis 6', [R.noteWert('1+', 0.25), R.noteWert('6-', 0.25)], [1, 6]);
  eq('Dezimalnote 2,5', R.noteWert('2,5'), 2.5);
  eq('Anzeige', [R.anzeige('2-'), R.anzeige('3+'), R.anzeige('2.5')], ['2−', '3+', '2,5']);
  eq('Stufe zusammengefasst', [R.notenStufe('2+'), R.notenStufe('2'), R.notenStufe('2-'), R.notenStufe('6')], [2, 2, 2, 6]);
  eq('Punkte aus Noten', ['1', '1-', '2+', '2', '2-', '5-', '6'].map(R.punkteAusNote), [14, 13, 12, 11, 10, 1, 0]);
  eq('Noten aus Punkten', [15, 11, 10, 0].map(R.noteAusPunkten), ['1+', '2', '2-', '6']);
  eq('System: Tendenz 0 bleibt 0', R.systemNormalisieren({ tendenz: 0 }).tendenz, 0);
  eq('System: Standard', [R.systemNormalisieren({}).tendenz, R.systemNormalisieren({}).rundung, R.systemNormalisieren({}).gewichtung], [0.25, 'schlechter', 'doppelt']);
  eq('System: Punkte runden standardmäßig auf', R.systemNormalisieren({ skala: 'punkte' }).rundung, 'besser');

  // ---------- Jahresfortgangsnote (§ 23 Abs. 2) ----------
  const N = (hj, art, note, extra = {}) => ({ hj, art, note, ...extra });
  const fach = {
    id: 'm', name: 'Mathematik', jahrgaenge: { 10: true }, gewichtung: { modus: 'standard' },
    noten: [
      N('10_1', 'sa', '2'), N('10_2', 'sa', '3'),
      N('10_1', 'stegreif', '2'), N('10_1', 'muendlich', '2-'), N('10_2', 'stegreif', '3'),
    ],
  };
  // (2×2 + 2×3 + 2 + 2,25 + 3) / 7 = 17,25 / 7 = 2,4642857…
  let r = R.jahresnote(fach, '10_J', SYS);
  eq('Jahresnote exakt', nah(r.roh, 17.25 / 7), true);
  eq('Jahresnote 2 Nachkommastellen', r.schnitt, 2.46);
  eq('Jahresnote gerundet', [r.berechnet, r.wert, r.quelle], [2, 2, 'noten']);
  eq('Jahresnote Teile', r.teile.map((t) => [t.gewicht, t.wert]), [[2, 2], [2, 3], [1, 2], [1, 2.25], [1, 3]]);
  eq('Jahresnote Nenner', r.nenner, 7);
  // Tendenz 0,33: (4 + 6 + 2 + 2,33 + 3) / 7
  eq('Jahresnote Tendenz 0,33', nah(R.jahresnote(fach, '10_J', sys({ tendenz: 0.33 })).roh, 17.33 / 7), true);
  // Tendenzen aus: (4 + 6 + 2 + 2 + 3) / 7
  eq('Jahresnote Tendenz aus', nah(R.jahresnote(fach, '10_J', sys({ tendenz: 0 })).roh, 17 / 7), true);
  // Beispiel aus der Anzeige: (2×2 + 3 + 2,25) / 4 = 2,3125 -> 2
  r = R.jahresnote({ noten: [N('7_1', 'sa', '2'), N('7_1', 'stegreif', '3'), N('7_1', 'referat', '2-')] }, '7_1', SYS);
  eq('Beispiel (2×2 + 3 + 2,25) / 4', [nah(r.roh, 2.3125), r.schnitt, r.berechnet], [true, 2.31, 2]);
  // Kurzarbeit statt Schulaufgabe zählt wie eine Schulaufgabe
  r = R.jahresnote({ noten: [N('8_1', 'ersatz', '1'), N('8_1', 'stegreif', '4')] }, '8_1', SYS);
  eq('Ersatz zählt doppelt', nah(r.roh, 6 / 3), true);
  // eigenes Gewicht je Note überschreibt den Standard
  r = R.jahresnote({ noten: [N('8_1', 'sa', '1', { gewicht: 1 }), N('8_1', 'stegreif', '4', { gewicht: 3 })] }, '8_1', SYS);
  eq('eigenes Gewicht', nah(r.roh, (1 + 12) / 4), true);
  // Vorlage „Alle gleich“
  eq('alle gleich', nah(R.jahresnote(fach, '10_J', sys({ gewichtung: 'gleich' })).roh, (2 + 3 + 2 + 2.25 + 3) / 5), true);
  // Vorlage „Eigene Gewichte je Notenart“
  const eigen = sys({ gewichtung: 'eigen', gewichte: { ...SYS.gewichte, sa: 3, muendlich: 0.5 } });
  eq('eigene Gewichte', nah(R.jahresnote(fach, '10_J', eigen).roh, (6 + 9 + 2 + 0.5 * 2.25 + 3) / 8.5), true);
  eq('Standardgewicht', [R.standardGewicht('sa', SYS), R.standardGewicht('ersatz', SYS), R.standardGewicht('stegreif', SYS), R.standardGewicht('sa', sys({ gewichtung: 'gleich' })), R.standardGewicht('sa', eigen)], [2, 2, 1, 1, 3]);

  // ---------- Prozent-Modus ----------
  // SA-Schnitt 2,5; kleine (2 + 2,25 + 3) / 3 = 2,41667; 60 % / 40 %
  r = R.jahresnote(fach, '10_J', sys({ gewichtung: 'prozent', saAnteil: 60 }));
  eq('Prozent (Notensystem)', [nah(r.roh, 0.6 * 2.5 + 0.4 * (7.25 / 3)), r.anteil, nah(r.saSchnitt, 2.5), nah(r.kleinSchnitt, 7.25 / 3)], [true, 60, true, true]);
  // Fach-Modus „anteil“ geht vor dem Notensystem
  r = R.jahresnote({ ...fach, gewichtung: { modus: 'anteil', saAnteil: 50 } }, '10_J', SYS);
  eq('Prozent (Fach, 50 %)', nah(r.roh, 0.5 * 2.5 + 0.5 * (7.25 / 3)), true);
  // nur kleine Noten: deren Schnitt
  r = R.jahresnote({ gewichtung: { modus: 'anteil', saAnteil: 70 }, noten: [N('9_1', 'stegreif', '2'), N('9_1', 'stegreif', '3')] }, '9_1', SYS);
  eq('Prozent ohne Schulaufgabe', r.roh, 2.5);

  // ---------- Rundung bei x,50 ----------
  eq('2,50 schlechter -> 3', R.runden(2.5, sys({ rundung: 'schlechter' })), 3);
  eq('2,50 besser -> 2', R.runden(2.5, sys({ rundung: 'besser' })), 2);
  eq('2,49 beide -> 2', [R.runden(2.49, sys({ rundung: 'schlechter' })), R.runden(2.49, sys({ rundung: 'besser' }))], [2, 2]);
  eq('2,51 beide -> 3', [R.runden(2.51, sys({ rundung: 'schlechter' })), R.runden(2.51, sys({ rundung: 'besser' }))], [3, 3]);
  eq('2,495 zählt als 2,50', R.runden(2.495, sys({ rundung: 'schlechter' })), 3);
  eq('Rundung bleibt in 1 bis 6', [R.runden(0.6, SYS), R.runden(6.4, SYS)], [1, 6]);
  eq('Punkte 10,5', [R.runden(10.5, { skala: 'punkte', rundung: 'besser' }), R.runden(10.5, { skala: 'punkte', rundung: 'schlechter' }), R.runden(10.5, { skala: 'punkte' })], [11, 10, 11]);
  // Jahresnote genau 2,50: SA 2 (×2), kleine 3 und 3 -> (4 + 6) / 4 = 2,5
  const halb = { noten: [N('9_1', 'sa', '2'), N('9_1', 'stegreif', '3'), N('9_1', 'stegreif', '3')] };
  eq('Jahresnote 2,50 je nach Rundung', [R.jahresnote(halb, '9_1', SYS).berechnet, R.jahresnote(halb, '9_1', sys({ rundung: 'besser' })).berechnet], [3, 2]);

  // ---------- Zwischen- und Jahreszeugnis ----------
  const zw = R.jahresnote(fach, '10_1', SYS); // (2×2 + 2 + 2,25) / 4 = 2,0625
  eq('Zwischenzeugnis nur 1. Halbjahr', [zw.anzahl, nah(zw.roh, 8.25 / 4), zw.berechnet], [3, true, 2]);
  const hj2 = R.jahresnote(fach, '10_2', SYS); // (2×3 + 3) / 3 = 3
  eq('2. Halbjahr allein', [hj2.anzahl, hj2.roh], [2, 3]);
  eq('Jahreszeugnis alle Noten', R.jahresnote(fach, '10_J', SYS).anzahl, 5);
  eq('Zeugniswert ersetzt', [R.jahresnote({ ...fach, zeugnis: { '10_1': 3 } }, '10_1', SYS).wert, R.jahresnote({ ...fach, zeugnis: { '10_1': 3 } }, '10_1', SYS).quelle, R.jahresnote({ ...fach, zeugnis: { '10_1': 3 } }, '10_J', SYS).quelle], [3, 'zeugnis', 'noten']);
  eq('Zeugniswert außerhalb 1 bis 6 zählt nicht', R.jahresnote({ ...fach, zeugnis: { '10_J': 9 } }, '10_J', SYS).quelle, 'noten');
  eq('leer', [R.jahresnote({ noten: [] }, '10_J', SYS).wert, R.jahresnote({ noten: [] }, '10_J', SYS).quelle], [null, null]);
  eq('andere Klasse zählt nicht', R.jahresnote({ noten: [N('9_1', 'sa', '1')] }, '10_J', SYS).anzahl, 0);
  eq('Zeiträume', R.zeitraeume(10), ['10_1', '10_2', '10_J']);
  eq('Zeitraum-Namen', [R.zeugnisName('10_1'), R.zeugnisName('10_J'), R.zeitraumLabel('10_2'), R.zeitraumLabel('9_J', true, true)], ['Zwischenzeugnis', 'Jahreszeugnis', '2. Hj', 'Kl. 9 · ganzes Jahr']);

  // ---------- Punkte-Skala (andere Schule) ----------
  const P = { skala: 'punkte', gewichtung: 'doppelt' };
  const fp = { noten: [{ hj: '11_1', art: 'sa', punkte: 10 }, { hj: '11_1', art: 'stegreif', punkte: 13 }] };
  eq('Punkte: (2×10 + 13) / 3 = 11', R.jahresnote(fp, '11_J', P).berechnet, 11);
  eq('Punkte: Noten-Feld zählt nicht', R.jahresnote({ noten: [N('11_1', 'sa', '2')] }, '11_1', P).anzahl, 0);
  const umg = R.skalaUmrechnen([{ noten: [N('9_1', 'sa', '2-'), N('9_1', 'sa', '1')], zeugnis: { '9_1': 2 } }], 'punkte')[0];
  eq('Umrechnen in Punkte', [umg.noten.map((n) => n.punkte), umg.noten[0].note, umg.zeugnis['9_1']], [[10, 14], undefined, 11]);
  const zurueck = R.skalaUmrechnen([umg], 'noten')[0];
  eq('Umrechnen zurück in Noten', [zurueck.noten.map((n) => n.note), zurueck.zeugnis['9_1']], [['2-', '1'], 2]);

  // ---------- Was brauche ich? ----------
  // Ziel 2 im Jahreszeugnis: bisher 17,25 / 7. Nächste Schulaufgabe x: (17,25 + 2x) / 9 <= 2,49 -> x <= 2,5 -> 2− (2,25), 3+ (2,75) reicht nicht
  eq('nächste SA für Ziel 2', R.naechsteNoteFuer(fach, '10_J', 2, 'sa', SYS), { wert: '2-', sicher: false });
  // nächste kleine Note: (17,25 + x) / 8 <= 2,49 -> x <= 2,67 -> 3+ ist 2,75 zu schlecht, 2− = 2,25 reicht
  eq('nächste kleine Note für Ziel 2', R.naechsteNoteFuer(fach, '10_J', 2, 'stegreif', SYS), { wert: '2-', sicher: false });
  eq('Ziel 4 ist sicher', R.naechsteNoteFuer(fach, '10_J', 4, 'stegreif', SYS), { wert: '6', sicher: true });
  eq('Ziel 1 nicht erreichbar', R.naechsteNoteFuer(fach, '10_J', 1, 'stegreif', SYS), null);
  eq('ohne Tendenzen ganze Noten', R.naechsteNoteFuer(fach, '10_J', 2, 'sa', sys({ tendenz: 0 })), { wert: '2', sicher: false });
  // (2×10 + 13 + x) / 4 >= 11,5 -> x >= 13
  eq('Punkte: nächste Note', R.naechsteNoteFuer(fp, '11_J', 12, 'stegreif', P), { wert: 13, sicher: false });

  // ---------- Vorrücken (Klasse 5–9) ----------
  const F = (name, note, extra = {}) => ({ id: name, name, jahrgaenge: { 8: true }, noten: [], zeugnis: note === null ? {} : { '8_J': note }, ...extra });
  const basis8 = () => [F('Deutsch', 3), F('Englisch', 3), F('Mathematik', 3), F('Physik', 3), F('Biologie', 2), F('Sport', 2), F('Kunst', 2)];
  const mit = (liste, name, note, extra = {}) => liste.map((f) => (f.name === name ? { ...f, ...extra, zeugnis: { '8_J': note } } : f));
  let v = R.vorruecken(basis8(), 8, SYS, 'I');
  eq('Vorrücken ok', [v.status, v.gefaehrdet, v.vollstaendig], ['ok', false, true]);
  v = R.vorruecken(mit(basis8(), 'Physik', 6), 8, SYS, 'I');
  eq('eine 6 -> gefährdet', [v.gefaehrdet, v.sechser, v.nachpruefung, v.probe], [true, ['Physik'], true, true]);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Englisch', 5), 8, SYS, 'I');
  eq('zwei 5 -> gefährdet', [v.gefaehrdet, v.fuenfer], [true, ['Englisch', 'Physik']]);
  v = R.vorruecken(mit(basis8(), 'Physik', 5), 8, SYS, 'I');
  eq('eine 5 -> ok', [v.gefaehrdet, v.status, v.fuenfer], [false, 'ok', ['Physik']]);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Sport', 5), 8, SYS, 'I');
  eq('5 in Sport zählt nicht', [v.gefaehrdet, v.fuenfer], [false, ['Physik']]);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Sport', 5), 8, SYS, 'IIIb');
  eq('5 in Sport zählt auch in IIIb nicht (kein Profilfach)', v.gefaehrdet, false);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Kunst', 5, { wpf: true }), 8, SYS, 'IIIb');
  eq('5 in Kunst als Profilfach IIIb zählt', [v.gefaehrdet, v.fuenfer], [true, ['Physik', 'Kunst']]);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Kunst', 5, { wpf: true }), 8, SYS, 'I');
  eq('5 in Kunst (Wahlpflicht, Gruppe I) zählt nicht', v.gefaehrdet, false);
  v = R.vorruecken(mit(mit(basis8(), 'Physik', 5), 'Sport', 5, { vorrueckungsfach: true }), 8, SYS, 'I');
  eq('Flag vorrueckungsfach geht vor', v.gefaehrdet, true);
  v = R.vorruecken(mit(basis8(), 'Deutsch', 6), 8, SYS, 'I');
  eq('6 in Deutsch: keine Nachprüfung', [v.gefaehrdet, v.deutsch6, v.nachpruefung], [true, true, false]);
  v = R.vorruecken(mit(basis8(), 'Physik', null), 8, SYS, 'I');
  eq('fehlende Note', [v.vollstaendig, v.fehlend], [false, ['Physik']]);
  eq('Klasse 5/6: keine Nachprüfung', R.vorruecken([{ name: 'Deutsch', jahrgaenge: { 6: true }, zeugnis: { '6_J': 5 } }], 6, SYS, 'keine').nachpruefung, false);
  eq('Vorrückungsfach nach Namen', ['Sport', 'Musik', 'Kunst', 'Werken/Textiles Gestalten', 'Deutsch', 'Religionslehre/Ethik', 'Ernährung und Gesundheit'].map((n) => R.vorrueckungsfachNachName(n, 'I', false)), [false, false, false, false, true, true, true]);
  eq('Profilfach Gruppe III', [R.vorrueckungsfachNachName('Musik', 'IIIb', true), R.vorrueckungsfachNachName('Musik', 'IIIa', true), R.vorrueckungsfachNachName('Musik', 'II', true)], [true, true, false]);

  // ---------- Prüfungsnote (§ 35, § 36) ----------
  eq('nur schriftlich', R.pruefungsnote({ schriftlich: 2 }).wert, 2);
  eq('mit mündlich', nah(R.pruefungsnote({ schriftlich: 2, muendlich: 3 }).wert, 7 / 3), true);
  eq('praktisch', R.pruefungsnote({ schriftlich: 2, praktisch: 3 }, true).wert, 2.5);
  eq('praktisch und mündlich', nah(R.pruefungsnote({ schriftlich: 2, praktisch: 3, muendlich: 1 }, true).wert, (2 * 2.5 + 1) / 3), true);
  eq('praktisch fehlt', R.pruefungsnote({ schriftlich: 2 }, true), { wert: 2, vollstaendig: false });
  eq('praktisch zählt nur im praktischen Fach', R.pruefungsnote({ schriftlich: 2, praktisch: 4 }, false).wert, 2);
  eq('ohne schriftlich', R.pruefungsnote({ muendlich: 2 }).wert, null);
  eq('ungültige Prüfungsnote', R.pruefungsnote({ schriftlich: 7 }).wert, null);

  // ---------- Gesamtnote ----------
  const deutsch10 = { id: 'd', name: 'Deutsch', jahrgaenge: { 10: true }, pruefungsfach: true, noten: [], zeugnis: { '10_J': 2 }, pruefung: { schriftlich: 3, muendlich: null } };
  let g = R.gesamtnote(deutsch10, SYS);
  eq('Gesamtnote = Prüfungsnote', [g.J, g.P, g.note, g.quelle, g.muendlichMoeglich], [2, 3, 3, 'pruefung', true]);
  g = R.gesamtnote({ ...deutsch10, pruefung: { schriftlich: 2, muendlich: 3 } }, SYS); // 2,33 -> 2
  eq('Gesamtnote mit mündlich', [g.note, g.muendlichMoeglich], [2, false]);
  g = R.gesamtnote({ ...deutsch10, praktischePruefung: true, pruefung: { schriftlich: 2, praktisch: 3 } }, SYS); // 2,5
  eq('Gesamtnote 2,5 je nach Rundung', [g.note, R.gesamtnote({ ...deutsch10, praktischePruefung: true, pruefung: { schriftlich: 2, praktisch: 3 } }, sys({ rundung: 'besser' })).note], [3, 2]);
  g = R.gesamtnote({ ...deutsch10, pruefung: {} }, SYS);
  eq('Prüfung fehlt: J vorläufig', [g.note, g.pruefungFehlt], [2, true]);
  g = R.gesamtnote({ ...deutsch10, pruefungsfach: false }, SYS);
  eq('ohne Prüfung: Jahresnote', [g.note, g.quelle], [2, 'jahr']);

  // ---------- Bestehen (§ 39 Abs. 4, § 40) ----------
  const L = (noten) => Object.entries(noten).map(([name, note]) => ({ name, note, vorrueckungsfach: !['Sport', 'Kunst', 'Musik'].includes(name) }));
  let b = R.bestehen(L({ Deutsch: 3, Englisch: 3, Mathematik: 4, Physik: 3, Chemie: 4, Biologie: 2, Geschichte: 3, Sport: 1 }));
  eq('bestanden', [b.ergebnis, b.vollstaendig, b.ausgleichNoetig], ['bestanden', true, false]);
  b = R.bestehen(L({ Deutsch: 3, Englisch: 5, Mathematik: 4, Physik: 3 }));
  eq('eine 5 -> bestanden', b.ergebnis, 'bestanden');
  b = R.bestehen(L({ Deutsch: 6, Englisch: 1, Mathematik: 1, Physik: 1, Chemie: 1, Biologie: 1 }));
  eq('Deutsch 6 -> nicht bestanden trotz guter Noten', [b.ergebnis, b.deutsch6], ['nicht', true]);
  b = R.bestehen(L({ Deutsch: 3, Englisch: 6, Mathematik: 1, Physik: 4, Chemie: 4 }));
  eq('eine 6 und eine 1 -> Notenausgleich', [b.ergebnis, b.ausgleich, b.sechser], ['ausgleich', 'eine 1', ['Englisch']]);
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 2, Chemie: 2, Biologie: 4 }));
  eq('zwei 5 und zwei 2 -> Notenausgleich', [b.ergebnis, b.ausgleich], ['ausgleich', 'zwei 2']);
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 3, Chemie: 3, Biologie: 3, Geschichte: 4 }));
  eq('zwei 5 und drei 3 -> nicht bestanden', b.ergebnis, 'nicht');
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 3, Chemie: 3, Biologie: 3, Geschichte: 3 }));
  eq('zwei 5 und vier 3 -> Notenausgleich', [b.ergebnis, b.ausgleich], ['ausgleich', 'vier 3']);
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 2, Chemie: 3, Biologie: 3, Geschichte: 3 }));
  eq('zwei 5, eine 2 und drei 3 -> Ausgleich (bessere Noten zählen mit)', [b.ergebnis, b.ausgleich], ['ausgleich', 'vier 3']);
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 2, Chemie: 3, Biologie: 4, Geschichte: 4 }));
  eq('zwei 5, eine 2 und eine 3 -> nicht bestanden', b.ergebnis, 'nicht');
  b = R.bestehen(L({ Deutsch: 4, Englisch: 5, Mathematik: 5, Physik: 4, Chemie: 4, Biologie: 4 }));
  eq('zwei 5 ohne Ausgleich -> nicht bestanden', [b.ergebnis, b.ausgleich], ['nicht', null]);
  b = R.bestehen(L({ Deutsch: 3, Englisch: 6, Mathematik: 5, Physik: 1, Chemie: 1, Biologie: 1 }));
  eq('6 und eine weitere 5 -> nicht bestanden', b.ergebnis, 'nicht');
  b = R.bestehen(L({ Deutsch: 3, Englisch: 5, Mathematik: 5, Physik: 5, Chemie: 1, Biologie: 1 }));
  eq('drei 5 -> nicht bestanden', b.ergebnis, 'nicht');
  b = R.bestehen(L({ Deutsch: 3, Englisch: 5, Mathematik: 5, Sport: 1, Kunst: 1, Physik: 4 }));
  eq('Ausgleich nur durch Vorrückungsfächer', b.ergebnis, 'nicht');
  b = R.bestehen(L({ Deutsch: 3, Englisch: 4, Mathematik: 3, Sport: 6 }));
  eq('6 in Sport zählt nicht', b.ergebnis, 'bestanden');
  b = R.bestehen(L({ Deutsch: 3, Englisch: null, Mathematik: 3 }));
  eq('fehlende Note', [b.ergebnis, b.vollstaendig, b.fehlend], ['bestanden', false, ['Englisch']]);

  // ---------- Abschluss gesamt und D/E/M ----------
  eq('D/E/M Schnitt', (() => { const d = R.demSchnitt([{ name: 'Deutsch', note: 2 }, { name: 'Englisch', note: 3 }, { name: 'Mathematik I', note: 3 }]); return [nah(d.schnitt, 8 / 3), d.ok, d.vollstaendig]; })(), [true, true, true]);
  eq('D/E/M 3,67 reicht nicht', R.demSchnitt([{ name: 'Deutsch', note: 4 }, { name: 'Englisch', note: 4 }, { name: 'Mathematik', note: 3 }]).ok, false);
  eq('D/E/M genau 3,5 reicht', R.demSchnitt([{ name: 'Deutsch', note: 3 }, { name: 'Englisch', note: 4 }]).ok, true);
  eq('D/E/M unvollständig', R.demSchnitt([{ name: 'Deutsch', note: 2 }]).vollstaendig, false);

  const fa = R.faecherFuer('IIIa', 10);
  const setze = (name, J, pr) => { const f = fa.find((x) => x.name === name); f.zeugnis['10_J'] = J; if (pr) f.pruefung = { ...f.pruefung, ...pr }; };
  for (const f of fa) f.zeugnis['10_J'] = 3;
  setze('Deutsch', 2, { schriftlich: 2 });
  setze('Englisch', 3, { schriftlich: 3 });
  setze('Mathematik', 3, { schriftlich: 4, muendlich: 2 }); // (8 + 2) / 3 = 3,33 -> 3
  setze('Französisch', 2, { schriftlich: 2 });
  const a = R.abschluss(fa, SYS, 'IIIa');
  eq('Abschluss IIIa: Prüfungsfächer', a.liste.filter((x) => x.pruefungsfach).map((x) => x.name), ['Deutsch', 'Englisch', 'Mathematik', 'Französisch']);
  eq('Abschluss: Gesamtnoten', a.liste.filter((x) => x.pruefungsfach).map((x) => x.note), [2, 3, 3, 2]);
  eq('Abschluss: bestanden, D/E/M', [a.bestehen.ergebnis, nah(a.dem.schnitt, 8 / 3), a.dem.ok, a.pruefungFehlt], ['bestanden', true, true, []]);

  // ---------- Vorlagen ----------
  const namen = (g2, k) => R.faecherFuer(g2, k).map((f) => f.name);
  const pruef = (g2) => R.faecherFuer(g2, 10).filter((f) => f.pruefungsfach).map((f) => f.name);
  eq('Klasse 5', namen('keine', 5), ['Deutsch', 'Englisch', 'Mathematik', 'Religionslehre/Ethik', 'Geographie', 'Biologie', 'Informationstechnologie', 'Musik', 'Kunst', 'Sport', 'Werken/Textiles Gestalten']);
  eq('Klasse 6 mit Geschichte', namen('keine', 6).includes('Geschichte'), true);
  eq('Gruppe I, Klasse 10', namen('I', 10), ['Deutsch', 'Englisch', 'Mathematik I', 'Physik', 'Chemie', 'Biologie', 'Geschichte', 'Politik und Gesellschaft', 'Religionslehre/Ethik', 'Sport']);
  eq('Gruppe II, Klasse 7', namen('II', 7), ['Deutsch', 'Englisch', 'Mathematik', 'BwR', 'Wirtschaft und Recht', 'Physik', 'Biologie', 'Geschichte', 'Geographie', 'Religionslehre/Ethik', 'Informationstechnologie', 'Musik', 'Kunst', 'Sport']);
  eq('Chemie ab 8 (I) bzw. 9', [namen('I', 8).includes('Chemie'), namen('II', 8).includes('Chemie'), namen('II', 9).includes('Chemie')], [true, false, true]);
  eq('Prüfungsfächer I', pruef('I'), ['Deutsch', 'Englisch', 'Mathematik I', 'Physik']);
  eq('Prüfungsfächer II', pruef('II'), ['Deutsch', 'Englisch', 'Mathematik', 'BwR']);
  eq('Prüfungsfächer IIIa', pruef('IIIa'), ['Deutsch', 'Englisch', 'Mathematik', 'Französisch']);
  eq('Prüfungsfächer IIIb', pruef('IIIb'), ['Deutsch', 'Englisch', 'Mathematik', 'Wahlpflichtfach (Profil)']);
  eq('keine Prüfungsfächer vor Klasse 10', R.faecherFuer('I', 9).filter((f) => f.pruefungsfach).length, 0);
  eq('Schulaufgabenfächer IIIa, 9', R.faecherFuer('IIIa', 9).filter((f) => f.schulaufgaben).map((f) => f.name), ['Deutsch', 'Englisch', 'Mathematik', 'Französisch', 'Physik', 'Chemie']);
  eq('Profilfach IIIb', (() => { const p = R.faecherFuer('IIIb', 8).find((f) => f.wpf); return [p.name, p.vorrueckungsfach, p.schulaufgaben]; })(), ['Wahlpflichtfach (Profil)', true, true]);
  eq('keine Vorrückungsfächer', R.faecherFuer('I', 8).filter((f) => !f.vorrueckungsfach).map((f) => f.name), ['Musik', 'Kunst', 'Sport']);
  eq('Fach in Klasse', (() => { const f = R.faecherFuer('I', 9)[0]; return [f.jahrgaenge, R.unterrichtetIn(f, 9), R.unterrichtetIn(f, 10), R.halbjahreDesFachs(f)]; })(), [{ 9: true }, true, false, ['9_1', '9_2']]);
  eq('praktische Prüfung', ['Kunst', 'Werken', 'Ernährung und Gesundheit', 'Sozialwesen', 'Musik'].map(R.mitPraktischerPruefung), [true, true, true, false, false]);
  eq('andere Schule: Standardfächer', R.standardFaecher(8).map((f) => [f.name, f.schulaufgaben]), [['Deutsch', true], ['Englisch', true], ['Mathematik', true]]);

  // Klasse ergänzen: Noten bleiben, Profilfach (umbenannt) wird erkannt, neue Fächer kommen dazu
  const f9 = R.faecherFuer('IIIb', 9);
  f9.find((f) => f.wpf).name = 'Werken';
  f9[0].noten.push(N('9_1', 'sa', '2'));
  const f10 = R.klasseErgaenzen(f9, 'IIIb', 10);
  const werken = f10.find((f) => f.name === 'Werken');
  eq('ergänzen: Deutsch behält Noten', [f10[0].jahrgaenge, f10[0].noten.length, f10[0].pruefungsfach], [{ 9: true, 10: true }, 1, true]);
  eq('ergänzen: Profilfach Werken', [werken.jahrgaenge[10], werken.pruefungsfach, werken.praktischePruefung, f10.filter((f) => f.wpf).length], [true, true, true, 1]);
  eq('ergänzen: Politik neu, Geographie bleibt in 9', [f10.some((f) => f.name === 'Politik und Gesellschaft' && f.jahrgaenge[10]), R.unterrichtetIn(f10.find((f) => f.name === 'Geographie'), 10)], [true, false]);
  eq('übernehmen (andere Schule)', R.klasseUebernehmen(R.standardFaecher(7), 8).every((f) => f.jahrgaenge[7] && f.jahrgaenge[8]), true);

  // ---------- Farben ----------
  eq('Farben 1 grün, 3 orange, 6 rot', [R.farbPunkte(1), R.farbPunkte(3), R.farbPunkte(6), R.farbPunkte(2.25)], [14, 8, 0, 10.25]);
  eq('Farben Punkte und leer', [R.farbPunkte(12, 'punkte'), R.farbPunkte(null)], [12, null]);

  log(`${ok} Tests bestanden, ${fail} fehlgeschlagen`);
  if (fail && isNode) process.exitCode = 1;
})();
