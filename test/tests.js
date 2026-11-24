/*
 * Tests der Rechenlogik. Laufen ohne Node mit der macOS-JavaScript-Engine:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc calc.js presets.js test/tests.js
 * oder mit Node:  node test/tests.js
 */
/* global Calc, Presets */
(function () {
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const C = isNode ? require('../calc.js') : Calc;
  const P = isNode ? require('../presets.js') : Presets;
  const log = typeof print === 'function' && !isNode ? print : console.log;

  let ok = 0;
  let fail = 0;
  function eq(name, ist, soll) {
    const gleich = JSON.stringify(ist) === JSON.stringify(soll);
    if (gleich) ok++;
    else { fail++; log(`FEHLER: ${name}: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`); }
  }

  // § 19 Abs. 6 Rundung
  eq('runde 9,5', C.rundePunkte(9.5), 10);
  eq('runde 9,49', C.rundePunkte(9.49), 9);
  eq('runde 0,99 -> 0', C.rundePunkte(0.99), 0);
  eq('runde 1,0', C.rundePunkte(1), 1);
  eq('runde 10,333', C.rundePunkte(31 / 3), 10);
  eq('runde 10,667', C.rundePunkte(32 / 3), 11);

  // § 27 Abs. 3: abschneiden, nicht runden
  eq('S(413)', C.durchschnitt(413), 2.1); // 2,1368
  eq('S(423) abgeschnitten', C.durchschnitt(423), 2); // 2,0513 -> 2,0 (gerundet wäre 2,1)
  eq('S(417)', C.durchschnitt(417), 2.1); // 2,1026
  eq('S(418)', C.durchschnitt(418), 2); // 2,0940
  eq('S(585)', C.durchschnitt(585), 1);
  eq('S(0)', C.durchschnitt(0), 5.6);
  eq('S(429) exakt 2,0', C.durchschnitt(429), 2);
  eq('Ziel 2,0', C.benoetigteSumme(2), 418);
  eq('Ziel 1,0', C.benoetigteSumme(1), 535); // 17/3 - 5E/585 < 1,1 -> E > 534,3
  eq('S(534)', C.durchschnitt(534), 1.1);
  eq('M = 585', C.M_GESAMT, 585);

  // § 21 Halbjahresergebnis
  const fach = {
    id: 'd', jahrgaenge: { 11: true, 12: true }, gewichtung: { modus: 'fobos' },
    noten: [
      { hj: '12_1', art: 'sa', punkte: 11 },
      { hj: '12_1', art: 'klein', punkte: 8, gewicht: 1 },
      { hj: '12_1', art: 'klein', punkte: 12, gewicht: 1 },
      { hj: '12_1', art: 'klein', punkte: 9, gewicht: 1 },
    ],
  };
  // kleine: (8+12+9)/3 = 9,667; HJ = (11 + 9,667)/2 = 10,333 -> 10
  eq('HJ fobos', C.halbjahr(fach, '12_1').berechnet, 10);
  // zwei Schulaufgaben: (11 + 6 + 9,667)/3 = 8,889 -> 9
  const fach2 = { ...fach, noten: fach.noten.concat([{ hj: '12_1', art: 'sa', punkte: 6 }]) };
  eq('HJ fobos zwei SA', C.halbjahr(fach2, '12_1').berechnet, 9);
  // gewichtete kleine LN: (8*2 + 12 + 9)/4 = 9,25; HJ = (11+9,25)/2 = 10,125 -> 10
  const fach3 = { ...fach, noten: fach.noten.map((n, i) => (i === 1 ? { ...n, gewicht: 2 } : n)) };
  eq('HJ gewichtet', C.halbjahr(fach3, '12_1').berechnet, 10);
  // eigene Gewichtung 2/3 SA: 11*0,667 + 9,667*0,333 = 10,556 -> 11
  const fach4 = { ...fach, gewichtung: { modus: 'anteil', saAnteil: 200 / 3 } };
  eq('HJ anteil', C.halbjahr(fach4, '12_1').berechnet, 11);
  // ohne SA nur kleine
  eq('HJ ohne SA', C.halbjahr({ noten: [{ hj: '11_2', art: 'klein', punkte: 7 }, { hj: '11_2', art: 'klein', punkte: 8 }] }, '11_2').berechnet, 8);
  // Zeugniswert überschreibt
  eq('HJ Zeugnis', C.halbjahr({ ...fach, zeugnis: { '12_1': 13 } }, '12_1').punkte, 13);
  // leer
  eq('HJ leer', C.halbjahr({ noten: [] }, '12_1').punkte, null);

  // Was brauche ich: Ziel 11 Punkte, nächste SA? (11 + x + 9,667)/3 >= 10,5 -> x >= 10,833 -> 11
  eq('nächste SA', C.naechsteNoteFuer(fach, '12_1', 11, 'sa'), 11);

  // Einbringbare Halbjahre
  eq('einbringbar 11+12', C.einbringbareHalbjahre({ jahrgaenge: { 11: true, 12: true } }), ['11_2', '12_1', '12_2']);
  eq('einbringbar nur 11', C.einbringbareHalbjahre({ jahrgaenge: { 11: true } }), ['11_1', '11_2']);
  eq('einbringbar nur 12', C.einbringbareHalbjahre({ jahrgaenge: { 12: true } }), ['12_1', '12_2']);
  eq('Sport', C.einbringbareHalbjahre({ jahrgaenge: { 12: true }, einbringbar: false }), []);

  // § 35 Abs. 2 Prüfung
  eq('Prüfung nur schriftlich', C.pruefungsergebnis({ pruefungsfach: true, pruefung: { schriftlich: 8 } }), 8);
  eq('Prüfung mit mündlich', C.pruefungsergebnis({ pruefungsfach: true, pruefung: { schriftlich: 8, muendlich: 12 } }), 9); // 28/3 = 9,33

  // § 13 Abs. 2 fpA
  eq('fpA', C.fpaHalbjahr({ '11_1': { anleitung: 10, vertiefung: 11, praktikum: 11 } }, '11_1').punkte, 11); // 43/4 = 10,75
  eq('fpA 0', C.fpaHalbjahr({ '11_1': { anleitung: 0, vertiefung: 11, praktikum: 11 } }, '11_1').punkte, 0);

  // Stundentafeln: jede Richtung hat >= 25 einbringbare Halbjahre, 4 Prüfungsfächer,
  // und es müssen nicht mehr Halbjahre gestrichen werden, als Fächer vorhanden sind.
  for (const key of Object.keys(P.RICHTUNGEN)) {
    const fs = P.faecherFuer(key);
    const slots = fs.reduce((s, f) => s + C.einbringbareHalbjahre(f).length, 0);
    const mitSlots = fs.filter((f) => C.einbringbareHalbjahre(f).length).length;
    eq(`${key}: 4 Prüfungsfächer`, fs.filter((f) => f.pruefungsfach).length, 4);
    eq(`${key}: >= 25 Halbjahre`, slots >= 25, true);
    eq(`${key}: Streichungen möglich`, slots - 25 <= mitSlots, true);
  }

  // Vollständiges Beispiel Technik: alle Halbjahre 11 Punkte, Prüfungen 9/10/8/11, fpA 12 + 12
  const fs = P.faecherFuer('technik');
  for (const f of fs) {
    f.zeugnis = {};
    for (const hj of C.halbjahreDesFachs(f)) f.zeugnis[hj] = 11;
  }
  const pruefWerte = [9, 10, 8, 11];
  fs.filter((f) => f.pruefungsfach).forEach((f, i) => { f.pruefung = { schriftlich: pruefWerte[i] }; });
  // ein schlechtes Halbjahr, das gestrichen werden soll
  fs[4].zeugnis['12_1'] = 3;
  const st = { faecher: fs, fpa: { '11_1': { ergebnis: 12 }, '11_2': { ergebnis: 12 } } };
  const r = C.fachabitur(st);
  eq('Technik vollständig', r.vollstaendig, true);
  eq('Technik eingebracht', r.eingebrachtAnzahl, 25);
  eq('Technik 3er gestrichen', r.kandidaten.find((k) => k.fachId === fs[4].id && k.hj === '12_1').gestrichen, true);
  // E = 3*(9+10+8+11) + 24 + 25*11 = 114 + 24 + 275 = 413
  eq('Technik E', r.E, 413);
  eq('Technik M', r.M, 585);
  eq('Technik S', r.S, 2.1);
  eq('Technik keine Warnung', r.warnungen, []);
  eq('Technik bestanden', r.bestehen.every((b) => b.ok), true);

  // Teilstand: einzige Note eines Fachs darf nicht gestrichen werden
  const teil = P.faecherFuer('technik');
  teil[0].zeugnis = { '12_1': 10 };
  const rt = C.fachabitur({ faecher: teil, fpa: {} });
  eq('Teilstand nichts gestrichen', rt.kandidaten.filter((k) => k.gestrichen).length, 0);
  eq('Teilstand E/M', [rt.E, rt.M], [10, 15]);
  eq('Teilstand S', rt.S, 2.3); // 17/3 - 5 * 10/15 = 2,333 -> 2,3
  eq('Teilstand Rest', rt.restMax, 24 * 15 + 4 * 45 + 2 * 15);

  // Eigenes Gewicht für eine Schulaufgabe: (2*11 + 9,667) / 3 = 10,556 -> 11
  const fachW = { ...fach, noten: fach.noten.map((n, i) => (i === 0 ? { ...n, gewicht: 2 } : n)) };
  eq('HJ SA doppelt', C.halbjahr(fachW, '12_1').berechnet, 11);

  // Fächernamen nach Eintrittsjahr
  const nov2026 = new Date(2026, 10, 24);
  eq('alte Namen 12. Klasse 2026/27', P.alteNamen(12, nov2026), true);
  eq('neue Namen 11. Klasse 2026/27', P.alteNamen(11, nov2026), false);
  eq('Technik alt: Technologie', P.faecherFuer('technik', 12, nov2026).some((f) => f.name === 'Technologie'), true);
  eq('Technik neu: KIT', P.faecherFuer('technik', 11, nov2026).some((f) => f.name.startsWith('KIT')), true);

  // Seminar (§ 17 Abs. 2): (2*10 + 2*12 + 11) / 5 = 11
  eq('Seminar', C.seminarErgebnis({ phase: 10, arbeit: 12, gespraech: 11 }).punkte, 11);
  eq('Seminar 0', C.seminarErgebnis({ phase: 0, arbeit: 12, gespraech: 11 }).punkte, 0);

  // Abitur 13. Klasse, alle Richtungen: >= 16 Halbjahre, 4 Abi-Prüfungsfächer
  for (const key of Object.keys(P.RICHTUNGEN)) {
    const fs13 = P.faecherFuer(key, 13, nov2026);
    const slots = fs13.reduce((s, f) => s + C.einbringbareHalbjahreAbitur(f).length, 0);
    eq(`${key}: 4 Abi-Prüfungsfächer`, fs13.filter((f) => f.pruefungsfachAbi).length, 4);
    eq(`${key}: >= 16 Halbjahre in 13`, slots >= 16, true);
    eq(`${key} 12: >= 25 Halbjahre`, fs13.reduce((s, f) => s + C.einbringbareHalbjahre(f).length, 0) >= 25, true);
  }

  // Vollständiges Abitur-Beispiel: 13/1, 13/2 alle 11 Punkte, Prüfungen 9/10/8/11, Seminar 11
  const fa = P.faecherFuer('technik', 13, nov2026);
  for (const f of fa) {
    f.zeugnis = {};
    if (f.jahrgaenge[13]) { f.zeugnis['13_1'] = 11; f.zeugnis['13_2'] = 11; }
  }
  fa.filter((f) => f.pruefungsfachAbi).forEach((f, i) => { f.pruefungAbi = { schriftlich: pruefWerte[i] }; });
  const stAbi = { faecher: fa, seminar: { phase: 10, arbeit: 12, gespraech: 11 } };
  const ra = C.abitur(stAbi);
  // E = 2*38 + 2*11 + 16*11 = 76 + 22 + 176 = 274; S = 5,667 - 5*274/390 = 2,154 -> 2,1
  eq('Abitur vollständig', ra.vollstaendig, true);
  eq('Abitur E/M', [ra.E, ra.M], [274, 390]);
  eq('Abitur S', ra.S, 2.1);
  eq('Abitur bestanden', ra.bestehen.every((b) => b.ok), true);
  // Mit Ergänzungsprüfung 2. Fremdsprache (x2): M = 420, E = 274 + 2*10 = 294
  const ra2 = C.abitur({ ...stAbi, zweiteFS: { modus: 'ergaenzung', pruefung: 10 } });
  eq('Abitur 420', [ra2.E, ra2.M, ra2.Mgesamt], [294, 420, 420]);
  // Prüfung mit 0 Punkten => nicht bestanden
  const fa0 = fa.map((f) => (f.name === 'Deutsch' ? { ...f, pruefungAbi: { schriftlich: 0 } } : f));
  eq('Abitur Prüfung 0', C.abitur({ ...stAbi, faecher: fa0 }).bestehen.some((b) => !b.ok), true);

  // 13. Klasse nachträglich ergänzen: Noten bleiben erhalten
  const f12 = P.faecherFuer('technik', 12, nov2026);
  f12[0].noten = [{ id: 'x', hj: '12_1', art: 'sa', punkte: 9 }];
  const f13 = P.dreizehnErgaenzen(f12, 'technik', nov2026);
  eq('13 ergänzt: Deutsch hat 13', f13[0].jahrgaenge[13], true);
  eq('13 ergänzt: Noten bleiben', f13[0].noten.length, 1);
  eq('13 ergänzt: 4 Abi-Prüfungsfächer', f13.filter((f) => f.pruefungsfachAbi).length, 4);

  log(`${ok} Tests bestanden, ${fail} fehlgeschlagen`);
  if (fail && isNode) process.exitCode = 1;
})();
