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
  fs[1].pruefung.muendlich = 10; // Englisch: mündliche Gruppenprüfung ist Pflicht; (2*10+10)/3 = 10
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

  // ===== Abgleich mit dem Streichvorschlag-Tool der FOS =====

  // Prüfung: (2s + m)/3 unter 1 => 0
  eq('AP 0/2 -> 0', C.pruefungsergebnis({ pruefungsfach: true, pruefung: { schriftlich: 0, muendlich: 2 } }), 0); // 0,67
  eq('AP 1/1 -> 1', C.pruefungsergebnis({ pruefungsfach: true, pruefung: { schriftlich: 1, muendlich: 1 } }), 1);
  eq('AP 1/2 -> 1', C.pruefungsergebnis({ pruefungsfach: true, pruefung: { schriftlich: 1, muendlich: 2 } }), 1); // 1,33

  // Gesamtergebnis: zweistufige Rundung
  eq('GE 3,495 -> 3,50 -> 4', C.gesamtergebnisRunden(3.495), 4);
  eq('direkt gerundet 3,495 -> 3', C.rundePunkte(3.495), 3);
  eq('GE 3,4949 -> 3', C.gesamtergebnisRunden(3.4949), 3);
  eq('GE 0,995 -> 1,00 -> 1', C.gesamtergebnisRunden(0.995), 1);
  eq('GE 0,99 -> 0', C.gesamtergebnisRunden(0.99), 0);
  eq('GE AP-Fach', C.gesamtergebnis([11, 11, 11], 9, 3).punkte, 10); // (33+27)/6
  eq('GE ohne AP', C.gesamtergebnis([3, 4], null, 3).punkte, 4); // 3,5

  // Stundentafeln: Halbjahre je Fach wie im Tool; slots - N = 25 mit 2 einbringungsfähigen WPF
  for (const key of Object.keys(P.RICHTUNGEN)) {
    const fs0 = P.faecherFuer(key, 12, nov2026);
    const slots = fs0.reduce((s, f) => s + C.einbringbareHalbjahre(f).length, 0);
    const sww = P.GRUPPE[key] === 'SWW';
    const N = (sww ? 2 : 1) + 2 * 2;
    eq(`${key}: slots - N = 25`, slots - N, 25);
    const muster = (hjs) => fs0.filter((f) => JSON.stringify(C.einbringbareHalbjahre(f)) === JSON.stringify(hjs)).length;
    eq(`${key}: Fächer 11/1+11/2`, muster(['11_1', '11_2']), sww ? 2 : 1);
    eq(`${key}: Fächer 11/2–12/2`, muster(['11_2', '12_1', '12_2']), sww ? 5 : 6);
    eq(`${key}: Fächer 12/1+12/2`, muster(['12_1', '12_2']), sww ? 6 : 5);
  }

  // Nicht einbringungsfähige WPF nach Namen
  eq('WPF Kunst', P.wpfEinbringbar('Kunst'), false);
  eq('WPF Musik', P.wpfEinbringbar('Musik'), false);
  eq('WPF StuA', P.wpfEinbringbar('Studier- und Arbeitstechniken'), false);
  eq('WPF StuA Tippfehler', P.wpfEinbringbar('Studier- uns Arbeitstechniken'), false);
  eq('WPF Szenisches Gestalten', P.wpfEinbringbar('szenisches gestalten'), false);
  eq('WPF Informatik', P.wpfEinbringbar('Informatik'), true);
  eq('WPF unbekannt', P.wpfEinbringbar('Schach'), null);
  eq('Vorlage ohne altes Feld streichen', P.faecherFuer('technik')[0].streichen, undefined);

  // Vollständiger Technik-Stand (alle HJ 11, Prüfungen 9/10/8/11, fpA 12/12) zum Abwandeln
  function technik(anpassen) {
    const fx = P.faecherFuer('technik', 12, nov2026);
    for (const f of fx) { f.zeugnis = {}; for (const hj of C.halbjahreDesFachs(f)) f.zeugnis[hj] = 11; }
    fx.filter((f) => f.pruefungsfach).forEach((f, i) => { f.pruefung = { schriftlich: pruefWerte[i] }; });
    fx[1].pruefung.muendlich = 10;
    const by = (n) => fx.find((f) => f.name === n);
    if (anpassen) anpassen(by, fx);
    return { st: { faecher: fx, fpa: { '11_1': { ergebnis: 12 }, '11_2': { ergebnis: 12 } } }, by };
  }
  const gestrichenIn = (r, f) => r.kandidaten.filter((k) => k.fachId === f.id && k.gestrichen).map((k) => k.hj);

  // k wird gestrichen
  let t = technik((by) => { by('Chemie').zeugnis['12_1'] = 'k'; });
  let r2 = C.fachabitur(t.st);
  eq('k gestrichen', gestrichenIn(r2, t.by('Chemie')), ['12_1']);
  eq('k: E unverändert', r2.E, 413);
  eq('k: bestanden', r2.ergebnis, 'bestanden');
  eq('k-Halbjahr punkte null', C.halbjahr(t.by('Chemie'), '12_1').k, true);

  // zu viele k => nicht bestanden (N = 5, aber 6 k)
  t = technik((by) => { ['Deutsch', 'Englisch', 'Mathematik', 'Physik', 'Chemie', 'Geschichte'].forEach((n) => { by(n).zeugnis[n === 'Geschichte' ? '11_1' : '12_1'] = 'k'; }); });
  r2 = C.fachabitur(t.st);
  eq('6 k: nicht bestanden', r2.ergebnis, 'nicht bestanden');
  eq('6 k: eins offen', r2.kOffen, 1);
  // zwei k im selben Fach => nicht bestanden
  t = technik((by) => { by('Chemie').zeugnis['12_1'] = 'k'; by('Chemie').zeugnis['12_2'] = 'k'; });
  eq('2 k in einem Fach', C.fachabitur(t.st).ergebnis, 'nicht bestanden');
  // k auch im Teilstand sofort gestrichen
  const teilK = P.faecherFuer('technik', 12, nov2026);
  teilK[5].zeugnis = { '12_1': 'k' };
  eq('k im Teilstand gestrichen', C.fachabitur({ faecher: teilK, fpa: {} }).kandidaten.filter((k) => k.gestrichen).length, 1);

  // Alte Felder 'ja'/'nein' werden ignoriert: es gilt die automatische Regel
  t = technik((by) => { const f = by('Technologie'); f.zeugnis['12_1'] = 3; f.streichen = 'nein'; by('Deutsch').streichen = 'ja'; });
  r2 = C.fachabitur(t.st);
  eq('alt nein ignoriert: Technologie 3 gestrichen', gestrichenIn(r2, t.by('Technologie')), ['12_1']);
  eq('alt ja ignoriert: Deutsch nicht erzwungen', gestrichenIn(r2, t.by('Deutsch')), []);
  eq('alter Stand ohne Felder: Modus auto', [r2.streichModus, r2.E], ['auto', 413]);

  // ===== Manuell streichen =====
  const manuell = (st, auswahl, art = 'fachabi') => ({ ...st, streichModus: { [art]: 'manuell' }, gestrichen: { [art]: auswahl } });
  const wahlIn = (r, f) => r.kandidaten.filter((k) => k.fachId === f.id && k.gestrichen).map((k) => k.wahl);
  const anzahlGestrichen = (r) => r.kandidaten.filter((k) => k.gestrichen).length;

  // Genau N (= 5) gewählt: Technologie 3 bleibt drin, weil der Nutzer anders entschieden hat
  t = technik((by) => { by('Technologie').zeugnis['12_1'] = 3; });
  const id = (n) => t.by(n).id;
  let wahl5 = { [id('Deutsch')]: '12_2', [id('Englisch')]: '12_1', [id('Physik')]: '11_2', [id('Chemie')]: '12_2', [id('Politik und Gesellschaft')]: '12_1' };
  r2 = C.fachabitur(manuell(t.st, wahl5));
  eq('manuell N: Modus', r2.streichModus, 'manuell');
  eq('manuell N: Technologie bleibt', gestrichenIn(r2, t.by('Technologie')), []);
  eq('manuell N: Deutsch 12/2', gestrichenIn(r2, t.by('Deutsch')), ['12_2']);
  eq('manuell N: 5 gestrichen, alle von dir', [anzahlGestrichen(r2), r2.manuellAnzahl, r2.festAnzahl, r2.kandidaten.filter((k) => k.wahl === 'auto').length], [5, 5, 5, 0]);
  eq('manuell N: E', [r2.E, r2.ergebnis], [405, 'bestanden']);
  eq('manuell N: keine Warnung, kein Tausch', [r2.warnungen, r2.tausch], [[], []]);

  // Weniger als N: der Rest wird automatisch ergänzt (Technologie 3 zuerst) und als auto markiert
  r2 = C.fachabitur(manuell(t.st, { [id('Deutsch')]: '12_2', [id('Englisch')]: '12_1' }));
  eq('manuell weniger: 5 gestrichen', anzahlGestrichen(r2), 5);
  eq('manuell weniger: Zähler', [r2.manuellAnzahl, r2.festAnzahl], [2, 2]);
  eq('manuell weniger: Deutsch von dir', wahlIn(r2, t.by('Deutsch')), ['manuell']);
  eq('manuell weniger: Technologie auto ergänzt', [gestrichenIn(r2, t.by('Technologie')), wahlIn(r2, t.by('Technologie'))], [['12_1'], ['auto']]);
  eq('manuell weniger: E legal', [r2.eingebrachtAnzahl, r2.E], [25, 413]);

  // Wahl im unvollständigen Fach zählt (automatisch würde dort nicht gestrichen)
  const teilM = P.faecherFuer('technik', 12, nov2026);
  teilM[0].zeugnis = { '11_2': 10, '12_1': 5 }; // Deutsch, 12/2 fehlt noch
  const stTeil = { faecher: teilM, fpa: {} };
  eq('Teilstand auto: nichts gestrichen', anzahlGestrichen(C.fachabitur(stTeil)), 0);
  r2 = C.fachabitur(manuell(stTeil, { [teilM[0].id]: '12_1' }));
  eq('Teilstand manuell: Deutsch 12/1 gestrichen', gestrichenIn(r2, teilM[0]), ['12_1']);
  eq('Teilstand manuell: E', r2.E, 10);
  // Auch ein noch offenes Halbjahr lässt sich streichen; es fehlt dann nicht mehr
  const offenVorher = C.fachabitur(stTeil).slotsOffen;
  r2 = C.fachabitur(manuell(stTeil, { [teilM[0].id]: '12_2' }));
  eq('Teilstand manuell: offenes HJ gestrichen', [gestrichenIn(r2, teilM[0]), r2.slotsOffen, r2.E], [['12_2'], offenVorher - 1, 15]);

  // k ohne Wahl wird automatisch gestrichen und zählt zu N
  t = technik((by) => { by('Chemie').zeugnis['12_1'] = 'k'; });
  r2 = C.fachabitur(manuell(t.st, { [t.by('Deutsch').id]: '12_2' }));
  eq('manuell k: Chemie k gestrichen, auto', [gestrichenIn(r2, t.by('Chemie')), wahlIn(r2, t.by('Chemie'))], [['12_1'], ['auto']]);
  eq('manuell k: zählt zu N', [r2.festAnzahl, r2.manuellAnzahl, anzahlGestrichen(r2), r2.kOffen], [2, 1, 5, 0]);
  eq('manuell k: bestanden', r2.ergebnis, 'bestanden');
  eq('manuell k: Fach mit k nicht wählbar', r2.waehlbar[t.by('Chemie').id], []);
  // Wahl im k-Fach zählt nicht, mit Hinweis
  r2 = C.fachabitur(manuell(t.st, { [t.by('Chemie').id]: '12_2' }));
  eq('manuell k: Wahl im k-Fach ignoriert', [gestrichenIn(r2, t.by('Chemie')), r2.manuellAnzahl], [['12_1'], 0]);
  eq('manuell k: Hinweis', r2.warnungen.some((w) => w.includes('ohne Note (k)')), true);
  // k plus 5 eigene: das k geht vor, es zählen nur die ersten 4
  r2 = C.fachabitur(manuell(t.st, { [t.by('Deutsch').id]: '12_2', [t.by('Englisch').id]: '12_1', [t.by('Mathematik').id]: '12_1', [t.by('Physik').id]: '12_1', [t.by('Geschichte').id]: '11_1' }));
  eq('manuell k + 5: k gestrichen, Geschichte fällt raus', [gestrichenIn(r2, t.by('Chemie')), gestrichenIn(r2, t.by('Geschichte')), r2.manuellAnzahl, anzahlGestrichen(r2)], [['12_1'], [], 4, 5]);

  // Ungültige Wahl: Sport, fpA, gelöschtes Fach, nicht einbringbares Halbjahr (Deutsch 11/1)
  t = technik();
  r2 = C.fachabitur(manuell(t.st, { [t.by('Sport').id]: '12_1', fpa: '11_1', geloescht: '12_1', [t.by('Deutsch').id]: '11_1' }));
  eq('ungültig: nichts übernommen', r2.manuellAnzahl, 0);
  eq('ungültig: Sport nie gestrichen', r2.kandidaten.some((k) => k.fachId === t.by('Sport').id), false);
  eq('ungültig: Deutsch 11/1 kein Kandidat', gestrichenIn(r2, t.by('Deutsch')).includes('11_1'), false);
  eq('ungültig: Rest automatisch', [anzahlGestrichen(r2), r2.E], [5, 413]);
  eq('ungültig: Sport nicht wählbar', r2.waehlbar[t.by('Sport').id], undefined);

  // Zweite Wahl im selben Fach wird abgelehnt (Liste und Mehrfachwert)
  r2 = C.fachabitur(manuell(t.st, [{ fachId: t.by('Deutsch').id, hj: '12_1' }, { fachId: t.by('Deutsch').id, hj: '12_2' }]));
  eq('zweite Wahl im Fach (Liste)', [gestrichenIn(r2, t.by('Deutsch')), r2.manuellAnzahl], [['12_1'], 1]);
  r2 = C.fachabitur(manuell(t.st, { [t.by('Deutsch').id]: ['12_2', '12_1'] }));
  eq('zweite Wahl im Fach (Mehrfachwert)', [gestrichenIn(r2, t.by('Deutsch')), r2.manuellAnzahl], [['12_2'], 1]);

  // Mehr als N aus alten Daten: die ersten N in Fächer-Reihenfolge, mit Warnung
  const zuViele = {};
  for (const n of ['Geschichte', 'Chemie', 'Physik', 'Mathematik', 'Englisch', 'Deutsch']) zuViele[t.by(n).id] = n === 'Geschichte' ? '11_1' : '12_1';
  r2 = C.fachabitur(manuell(t.st, zuViele));
  eq('zu viele: 5 gestrichen', [anzahlGestrichen(r2), r2.manuellAnzahl], [5, 5]);
  eq('zu viele: Geschichte (letztes Fach) fällt raus', gestrichenIn(r2, t.by('Geschichte')), []);
  eq('zu viele: Deutsch (erstes Fach) bleibt', gestrichenIn(r2, t.by('Deutsch')), ['12_1']);
  eq('zu viele: Warnung', r2.warnungen.some((w) => w.includes('möglich sind nur 5')), true);

  // Moduswechsel: Auswahl bleibt gespeichert, auto ignoriert sie
  t = technik((by) => { by('Technologie').zeugnis['12_1'] = 3; });
  const mitWahl = manuell(t.st, { [t.by('Deutsch').id]: '12_2' });
  const aufAuto = { ...mitWahl, streichModus: { fachabi: 'auto' } };
  r2 = C.fachabitur(aufAuto);
  eq('Wechsel auf auto: Wahl ignoriert', [r2.streichModus, gestrichenIn(r2, t.by('Deutsch')), gestrichenIn(r2, t.by('Technologie'))], ['auto', [], ['12_1']]);
  eq('Wechsel auf auto: Wahl bleibt gespeichert', aufAuto.gestrichen.fachabi[t.by('Deutsch').id], '12_2');
  r2 = C.fachabitur({ ...aufAuto, streichModus: { fachabi: 'manuell' } });
  eq('Wechsel zurück: Wahl wieder da', wahlIn(r2, t.by('Deutsch')), ['manuell']);
  // Vorbelegung beim Ausschalten = automatische Wahl, dann ändert sich nichts
  const vor = C.autoAuswahl(t.st, 'fachabi');
  eq('autoAuswahl: 5 Fächer, Technologie 12/1', [Object.keys(vor).length, vor[t.by('Technologie').id]], [5, '12_1']);
  const rAuto = C.fachabitur(t.st);
  const rVor = C.fachabitur(manuell(t.st, vor));
  eq('autoAuswahl: gleiches Ergebnis', [rVor.E, rVor.manuellAnzahl, rVor.kandidaten.filter((k) => k.gestrichen).map((k) => k.fachId + k.hj)], [rAuto.E, 5, rAuto.kandidaten.filter((k) => k.gestrichen).map((k) => k.fachId + k.hj)]);
  // Zurückholen: Fach wird behalten, die Ergänzung nimmt ein anderes Fach
  t = technik((by) => { by('Technologie').zeugnis['12_1'] = 3; });
  const tid = (n) => t.by(n).id;
  const stB = manuell(t.st, { [tid('Deutsch')]: '12_2', [tid('Englisch')]: '12_1', [tid('Physik')]: '11_2', [tid('Technologie')]: '12_1' });
  stB.behalten = { fachabi: {} };
  eq('behalten: vorher Technologie von dir', wahlIn(C.fachabitur(stB), t.by('Technologie')), ['manuell']);
  eq('behalten: Zurückholen ändert', C.streichTippen(stB, 'fachabi', tid('Technologie'), '12_1').geaendert, true);
  eq('behalten: Fach gemerkt, Wahl weg', [stB.behalten.fachabi[tid('Technologie')], stB.gestrichen.fachabi[tid('Technologie')]], [true, undefined]);
  r2 = C.fachabitur(stB);
  eq('behalten: Technologie zählt, anderes Fach ergänzt', [gestrichenIn(r2, t.by('Technologie')), anzahlGestrichen(r2), r2.kandidaten.filter((k) => k.wahl === 'auto').length, r2.warnungen], [[], 5, 2, []]);
  // Gestrichelten Chip antippen: wird zurückgeholt und behalten, nicht zur eigenen Wahl
  const autoK = r2.kandidaten.find((k) => k.gestrichen && k.wahl === 'auto');
  C.streichTippen(stB, 'fachabi', autoK.fachId, autoK.hj);
  r2 = C.fachabitur(stB);
  eq('gestrichelt antippen: behalten, keine eigene Wahl', [stB.behalten.fachabi[autoK.fachId], stB.gestrichen.fachabi[autoK.fachId], r2.manuellAnzahl], [true, undefined, 3]);
  eq('gestrichelt antippen: Fach nicht mehr gestrichen', r2.kandidaten.some((k) => k.fachId === autoK.fachId && k.gestrichen), false);
  eq('gestrichelt antippen: trotzdem 5', anzahlGestrichen(r2), 5);
  // Im behaltenen Fach streichen: Behalten endet
  eq('streichen im behaltenen Fach', C.streichTippen(stB, 'fachabi', tid('Technologie'), '12_2').geaendert, true);
  eq('streichen im behaltenen Fach: Behalten weg', [stB.behalten.fachabi[tid('Technologie')], stB.gestrichen.fachabi[tid('Technologie')]], [undefined, '12_2']);
  // Volle Auswahl: neues Fach antippen geht nicht, mit Meldung
  C.streichTippen(stB, 'fachabi', tid('Chemie'), '12_1');
  const voll = C.streichTippen(stB, 'fachabi', tid('Mathematik'), '12_1');
  eq('voll: Meldung', [voll.geaendert, voll.meldung], [false, 'Du hast schon 5 Halbjahre gestrichen. Tipp erst ein gestrichenes an, um es zurückzunehmen.']);
  // Behaltenes Fach nur, wenn nichts anderes übrig ist, mit Warnung
  const stRest = manuell(t.st, { [tid('Deutsch')]: '12_2', [tid('Englisch')]: '12_1', [tid('Physik')]: '11_2', [tid('Chemie')]: '12_2' });
  stRest.behalten = { fachabi: {} };
  for (const f of t.st.faecher) if (!stRest.gestrichen.fachabi[f.id]) stRest.behalten.fachabi[f.id] = true;
  r2 = C.fachabitur(stRest);
  eq('alles behalten: trotzdem 5 gestrichen', [anzahlGestrichen(r2), gestrichenIn(r2, t.by('Technologie')), wahlIn(r2, t.by('Technologie'))], [5, ['12_1'], ['auto']]);
  eq('alles behalten: Warnung', r2.warnungen.some((w) => w.startsWith('Technologie soll zählen')), true);
  // Behalten im Auto-Modus ohne Wirkung; Wechsel auf Ein löscht es, Auswahl bleibt
  eq('behalten im Auto-Modus ignoriert', gestrichenIn(C.fachabitur({ ...stRest, streichModus: { fachabi: 'auto' } }), t.by('Technologie')), ['12_1']);
  C.streichModusSetzen(stRest, 'fachabi', 'auto');
  eq('Ein: behalten gelöscht, Auswahl bleibt', [stRest.streichModus.fachabi, Object.keys(stRest.behalten.fachabi).length, Object.keys(stRest.gestrichen.fachabi).length], ['auto', 0, 4]);
  C.streichModusSetzen(stRest, 'fachabi', 'manuell');
  eq('Aus mit gespeicherter Auswahl: keine Vorbelegung', Object.keys(stRest.gestrichen.fachabi).length, 4);
  const stLeer = { ...t.st, faecher: t.st.faecher };
  C.streichModusSetzen(stLeer, 'fachabi', 'manuell');
  eq('Aus ohne Auswahl: vorbelegt', [stLeer.streichModus.fachabi, Object.keys(stLeer.gestrichen.fachabi).length], ['manuell', 5]);

  // Modus ohne Feld
  eq('streichModusVon ohne Feld', [C.streichModusVon({}, 'fachabi'), C.streichModusVon({ streichModus: { abitur: 'manuell' } }, 'fachabi')], ['auto', 'auto']);

  // Bei Gleichstand im Fach: früheres Halbjahr
  t = technik((by) => { const f = by('Chemie'); f.zeugnis['11_2'] = 2; f.zeugnis['12_2'] = 2; });
  eq('Gleichstand: früheres HJ', gestrichenIn(C.fachabitur(t.st), t.by('Chemie')), ['11_2']);

  // Rettung schlägt niedrigere Punkte: ohne Rettung 3 GE-Unterpunktungen (nicht bestanden)
  t = technik((by) => {
    by('Geschichte').zeugnis = { '11_1': 1, '11_2': 5 }; // GE 3, Streichen der 1 => 5
    by('Politik und Gesellschaft').zeugnis = { '12_1': 1, '12_2': 5 };
    by('Religionslehre/Ethik').zeugnis = { '12_1': 2, '12_2': 2 }; // GE 2, nicht zu retten
    for (const n of ['Mathematik Additum', 'Wahlpflichtfach 1', 'Wahlpflichtfach 2', 'Technologie', 'Chemie']) by(n).zeugnis['12_1'] = 0;
  });
  r2 = C.fachabitur(t.st);
  eq('Rettung: Geschichte 11/1 gestrichen', gestrichenIn(r2, t.by('Geschichte')), ['11_1']);
  eq('Rettung: Chemie 0 bleibt (niedriger, aber keine Rettung)', gestrichenIn(r2, t.by('Chemie')), []);
  eq('Rettung: nur so viele wie nötig', gestrichenIn(r2, t.by('Politik und Gesellschaft')), []);
  eq('Rettung: 2 Unterpunktungen', r2.geUnter4, 2);
  eq('Rettung: bestanden', r2.ergebnis, 'bestanden');

  // Gesamtergebnisoptimierter Vorschlag: Chemie 11/2 statt Geschichte 11/1 hebt Chemie auf 13, Schnitt bleibt 2,1
  t = technik((by) => {
    by('Geschichte').zeugnis['11_1'] = 10;
    for (const n of ['Politik und Gesellschaft', 'Religionslehre/Ethik', 'Wahlpflichtfach 1', 'Wahlpflichtfach 2']) by(n).zeugnis['12_1'] = 10;
    by('Chemie').zeugnis = { '11_2': 11, '12_1': 13, '12_2': 13 };
  });
  r2 = C.fachabitur(t.st);
  eq('Tausch: E/S', [r2.E, r2.S], [417, 2.1]);
  eq('Tausch-Vorschlag', r2.tausch.map((x) => [x.stattFachId === t.by('Geschichte').id, x.fachId === t.by('Chemie').id, x.hj, x.gePunkteVorher, x.gePunkteNachher, x.punkteVerlust]), [[true, true, '11_2', 12, 13, 1]]);

  // Eigene Fächer mit genau 25 Halbjahren (keine Streichung), um E genau zu treffen
  function eigene(werte, fpa = [4, 4]) {
    const f = (name, jg, hj, ap) => ({ id: name, name, jahrgaenge: jg, einbringbar: true, pruefungsfach: !!ap, pruefung: ap || {}, zeugnis: hj, noten: [] });
    const zw = (a, b) => ({ '12_1': a, '12_2': b });
    const fx = [
      f('Deutsch', { 11: true, 12: true }, { '11_2': 4, '12_1': 4, '12_2': 4 }, { schriftlich: 4 }),
      f('Englisch', { 12: true }, zw(4, 4), { schriftlich: 4, muendlich: 4 }),
      f('Mathematik', { 12: true }, zw(4, 4), { schriftlich: 4 }),
      f('Physik', { 12: true }, zw(4, 4), { schriftlich: 4 }),
    ];
    for (let i = 5; i <= 12; i++) fx.push(f(`F${i}`, { 12: true }, zw(...(werte[`F${i}`] || [4, 4])), null));
    return C.fachabitur({ faecher: fx, fpa: { '11_1': { ergebnis: fpa[0] }, '11_2': { ergebnis: fpa[1] } } });
  }
  // 1 Unterpunktung: E >= 195 nötig
  let re = eigene({ F5: [3, 3], F6: [15, 15], F7: [15, 12] });
  eq('1 UP, E 195', [re.E, re.geUnter4, re.ergebnis], [195, 1, 'bestanden']);
  re = eigene({ F5: [3, 3], F6: [15, 15], F7: [15, 11] });
  eq('1 UP, E 194', [re.E, re.geUnter4, re.ergebnis], [194, 1, 'nicht bestanden']);
  // 2 Unterpunktungen: E >= 234 nötig
  re = eigene({ F5: [3, 3], F9: [3, 3], F6: [15, 15], F7: [15, 15], F8: [15, 15], F10: [15, 9] });
  eq('2 UP, E 234', [re.E, re.geUnter4, re.ergebnis], [234, 2, 'bestanden']);
  re = eigene({ F5: [3, 3], F9: [3, 3], F6: [15, 15], F7: [15, 15], F8: [15, 15], F10: [15, 8] });
  eq('2 UP, E 233', [re.E, re.geUnter4, re.ergebnis], [233, 2, 'nicht bestanden']);
  // 0 Punkte zählen doppelt
  re = eigene({ F5: [0, 0] });
  eq('GE 0 zählt doppelt', re.geUnter4, 2);
  // fpA-Gesamtnote zählt bei den Unterpunktungen mit
  re = eigene({ F6: [15, 15], F7: [15, 15], F8: [15, 15] }, [3, 3]);
  eq('fpA-GE 3', re.fpaGesamt, 3);
  eq('fpA zählt als Unterpunktung', [re.geUnter4, re.ergebnis], [1, 'bestanden']);
  re = eigene({ F5: [3, 3], F9: [3, 3], F6: [15, 15], F7: [15, 15], F8: [15, 15], F10: [15, 15] }, [3, 3]);
  eq('fpA + 2 GE unter 4 => nicht bestanden', [re.geUnter4, re.ergebnis], [3, 'nicht bestanden']);
  eq('fpA-GE Mittel gerundet', eigene({}, [3, 4]).fpaGesamt, 4); // 3,5 -> 4

  // Fehlende Eingaben
  t = technik((by) => { by('Physik').pruefung = { schriftlich: null }; });
  r2 = C.fachabitur(t.st);
  eq('sAP fehlt: unvollständig', r2.ergebnis, 'unvollständig');
  eq('sAP fehlt: Hinweis', r2.hinweise.some((h) => h.includes('schriftlichen')), true);
  t = technik((by) => { by('Englisch').pruefung.muendlich = null; });
  r2 = C.fachabitur(t.st);
  eq('mAP Englisch fehlt: unvollständig', [r2.vollstaendig, r2.ergebnis], [false, 'unvollständig']);
  eq('mAP Englisch fehlt: Hinweis', r2.hinweise.some((h) => h.includes('Englisch')), true);

  // Abitur: automatisch streicht die 2, alte streichenAbi = 'nein' wird ignoriert
  const faJ = fa.map((f) => (f.name === 'Chemie' ? { ...f, streichenAbi: 'nein', zeugnis: { ...f.zeugnis, '13_1': 2 } } : f));
  const stJ = { ...stAbi, faecher: faJ };
  const fid = (n) => faJ.find((f) => f.name === n).id;
  const chemieAbi = (r) => r.kandidaten.filter((k) => k.gestrichen && k.fachId === fid('Chemie')).map((k) => k.hj);
  eq('Abitur auto streicht 2', chemieAbi(C.abitur(stJ)), ['13_1']);
  // Abitur manuell: eigener Modus, eigene Auswahl
  let rAbi = C.abitur(manuell(stJ, { [fid('Deutsch')]: '13_2', [fid('Mathematik')]: '13_1' }, 'abitur'));
  eq('Abitur manuell: Chemie bleibt', [rAbi.streichModus, chemieAbi(rAbi), rAbi.manuellAnzahl, rAbi.zuStreichen], ['manuell', [], 2, 2]);
  eq('Abitur manuell: E', rAbi.E, 265); // 2*38 + 2*11 + 15*11 + 2
  eq('Abitur manuell: Fachabi bleibt auto', C.fachabitur(manuell(stJ, { [fid('Deutsch')]: '13_2' }, 'abitur')).streichModus, 'auto');
  // 2. Fremdsprache in 13: Pflicht-Halbjahre sind nicht wählbar
  const stFS = { ...stJ, zweiteFS: { modus: 'jgst13', fachId: fid('Englisch') } };
  rAbi = C.abitur(manuell(stFS, { [fid('Englisch')]: '13_1', [fid('Deutsch')]: '13_2' }, 'abitur'));
  eq('Abitur manuell 2. FS: nicht wählbar', rAbi.waehlbar[fid('Englisch')], []);
  eq('Abitur manuell 2. FS: Wahl ignoriert, Rest auto', [rAbi.manuellAnzahl, rAbi.kandidaten.some((k) => k.gestrichen && k.fachId === fid('Englisch')), chemieAbi(rAbi)], [1, false, ['13_1']]);

  log(`${ok} Tests bestanden, ${fail} fehlgeschlagen`);
  if (fail && isNode) process.exitCode = 1;
})();
