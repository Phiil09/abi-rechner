/*
 * Rechenlogik Fachabitur (FOS 12) und Abitur (FOS 13), Bayern
 * Rechtsgrundlage: FOBOSO, Text gilt ab 01.08.2026 (gesetze-bayern.de)
 *
 *  § 19 Abs. 6  Zwischenergebnisse nicht runden; Endergebnis auf ganze Punkte
 *               (ab ,50 auf, darunter ab); Werte unter 1,00 werden 0 Punkte.
 *  § 21 Abs. 1  Halbjahresergebnis: gewichteter Schnitt der kleinen Leistungsnachweise
 *               und JEDE Schulaufgabe haben jeweils gleiches Gewicht; gerundet.
 *               (In der App kann eine Schulaufgabe zusätzlich ein eigenes Gewicht bekommen.)
 *  § 13 Abs. 2  Fachpraktische Ausbildung je Halbjahr: Anleitung x1, Vertiefung x1,
 *               Praktikum x2; gerundet. Ein Bereich mit 0 Punkten => fpA 0 Punkte.
 *  § 17 Abs. 2  Seminar: Seminarphase x2, Seminararbeit x2, Prüfungsgespräch x1; gerundet.
 *               Eine Leistung mit 0 Punkten => Seminar 0 Punkte.
 *  § 35 Abs. 2  Prüfungsergebnis: (2 x schriftlich + mündlich) / 3, gerundet.
 *  § 35 Abs. 3  Gesamtergebnis je Fach: eingebrachte Halbjahre x1, Prüfung x3 (Fachabi) bzw. x2.
 *  § 35 Abs. 5  Fachabitur: 4 Prüfungen x3, fpA (2 Halbjahre), 25 Halbjahre aus 11/2, 12/1, 12/2
 *               (11/1 nur bei Fächern, die mit Jgst. 11 enden). M = 585.
 *  § 35 Abs. 7  Abitur: 4 Prüfungen x2, Seminar x2, 16 Halbjahre aus 13/1, 13/2. M = 390;
 *               mit 2. Fremdsprache aus Jgst. 12 (+2 Halbjahre) oder Ergänzungsprüfung (x2) M = 420.
 *  § 35 Abs. 4  Je Fach höchstens ein Halbjahr streichen; Sport u. a. nicht einbringbar.
 *  § 35 Abs. 9 / Anlage 4  Bestehen: höchstens 2 Prüfungs- und 2 Gesamtergebnisse unter 4 Punkten
 *               (0 Punkte zählen doppelt; beim Abitur keine Prüfung mit 0 Punkten); bei einem
 *               Gesamtergebnis unter 4 mindestens M/3, bei zweien mindestens 0,4 x M Punkte
 *               (Fachabi 195/234, Abitur 130/156 bzw. 140/168).
 *  § 27 Abs. 3 / Anlage 4  S = 17/3 - 5 * E / M; auf eine Nachkommastelle errechnet,
 *               es wird NICHT gerundet; Werte unter 1 => 1,0.
 */
const Calc = (function () {
  const HJ = ['11_1', '11_2', '12_1', '12_2', '13_1', '13_2'];
  const HJ_LABEL = { '11_1': '11/1', '11_2': '11/2', '12_1': '12/1', '12_2': '12/2', '13_1': '13/1', '13_2': '13/2' };
  const M_GESAMT = 585; // Fachabitur
  const M_ABITUR = 390;

  const istZahl = (v) => typeof v === 'number' && Number.isFinite(v);
  const zahl = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const gewichtVon = (n) => (istZahl(n.gewicht) && n.gewicht > 0 ? n.gewicht : 1);

  /** § 19 Abs. 6 */
  function rundePunkte(v) {
    if (!istZahl(v)) return null;
    if (v < 1) return 0;
    return Math.floor(v + 0.5 + 1e-9);
  }

  /** § 27 Abs. 3: eine Nachkommastelle, nicht gerundet (abgeschnitten). */
  function durchschnitt(E, M = M_GESAMT) {
    if (!M) return null;
    const s = 17 / 3 - (5 * E) / M;
    const abgeschnitten = Math.floor(s * 10 + 1e-9) / 10;
    return abgeschnitten < 1 ? 1 : abgeschnitten;
  }

  function notenstufe(s) {
    if (s <= 1.5) return 'sehr gut';
    if (s <= 2.5) return 'gut';
    if (s <= 3.5) return 'befriedigend';
    if (s <= 4.5) return 'ausreichend';
    if (s <= 5.5) return 'mangelhaft';
    return 'ungenügend';
  }

  const NOTE_AUS_PUNKTEN = ['6', '5-', '5', '5+', '4-', '4', '4+', '3-', '3', '3+', '2-', '2', '2+', '1-', '1', '1+'];
  function noteAusPunkten(p) {
    return istZahl(p) && p >= 0 && p <= 15 ? NOTE_AUS_PUNKTEN[Math.round(p)] : '';
  }
  /** Notenstufe 1–6 aus Punkten (§ 19 Abs. 1). */
  function stufeAusPunkten(p) {
    if (!istZahl(p)) return null;
    if (p >= 13) return 1;
    if (p >= 10) return 2;
    if (p >= 7) return 3;
    if (p >= 4) return 4;
    if (p >= 1) return 5;
    return 6;
  }

  function gewichteterSchnitt(liste) {
    let summe = 0;
    let gewichte = 0;
    for (const n of liste) {
      const g = gewichtVon(n);
      summe += n.punkte * g;
      gewichte += g;
    }
    return gewichte > 0 ? summe / gewichte : null;
  }

  /**
   * Halbjahresergebnis eines Fachs.
   * modus 'fobos' (Standard, § 21): Schnitt kleine LN (Gewicht 1) und jede Schulaufgabe
   *   (Gewicht 1 oder eigenes Gewicht) werden gemittelt.
   * modus 'anteil': eigene Gewichtung, Schulaufgaben-Gruppe zählt saAnteil %.
   */
  function halbjahr(fach, hj) {
    const noten = (fach.noten || []).filter((n) => n.hj === hj && istZahl(n.punkte));
    const sa = noten.filter((n) => n.art === 'sa');
    const klein = noten.filter((n) => n.art !== 'sa');
    const kleinSchnitt = gewichteterSchnitt(klein);
    const saSchnitt = gewichteterSchnitt(sa);
    const g = fach.gewichtung || { modus: 'fobos' };

    let roh = null;
    if (g.modus === 'anteil') {
      const a = Math.min(100, Math.max(0, zahl(g.saAnteil) ?? 50)) / 100;
      if (saSchnitt !== null && kleinSchnitt !== null) roh = a * saSchnitt + (1 - a) * kleinSchnitt;
      else roh = saSchnitt ?? kleinSchnitt;
    } else {
      let summe = 0;
      let gew = 0;
      for (const n of sa) {
        const w = gewichtVon(n);
        summe += w * n.punkte;
        gew += w;
      }
      if (kleinSchnitt !== null) { summe += kleinSchnitt; gew += 1; }
      roh = gew ? summe / gew : null;
    }

    const berechnet = rundePunkte(roh);
    const zeugnis = zahl(fach.zeugnis && fach.zeugnis[hj]);
    return {
      roh,
      berechnet,
      punkte: zeugnis !== null ? zeugnis : berechnet,
      quelle: zeugnis !== null ? 'zeugnis' : berechnet !== null ? 'noten' : null,
      kleinSchnitt,
      saSchnitt,
      anzahlSa: sa.length,
      anzahlKlein: klein.length,
    };
  }

  /** Halbjahre, in denen das Fach unterrichtet wird. */
  function halbjahreDesFachs(fach) {
    const jg = fach.jahrgaenge || {};
    const res = [];
    if (jg[11]) res.push('11_1', '11_2');
    if (jg[12]) res.push('12_1', '12_2');
    if (jg[13]) res.push('13_1', '13_2');
    return res;
  }

  /** § 35 Abs. 5 Satz 1 Nr. 3: einbringbare Halbjahre fürs Fachabitur. */
  function einbringbareHalbjahre(fach) {
    if (fach.einbringbar === false) return [];
    const jg = fach.jahrgaenge || {};
    if (jg[12]) return (jg[11] ? ['11_2'] : []).concat(['12_1', '12_2']);
    if (jg[11]) return ['11_1', '11_2'];
    return [];
  }

  /** § 35 Abs. 7 Satz 1 Nr. 3: einbringbare Halbjahre fürs Abitur. */
  function einbringbareHalbjahreAbitur(fach) {
    if (fach.einbringbar === false) return [];
    return fach.jahrgaenge && fach.jahrgaenge[13] ? ['13_1', '13_2'] : [];
  }

  /** § 35 Abs. 2. art: 'fachabi' (Feld pruefung) oder 'abitur' (Feld pruefungAbi). */
  function pruefungsergebnis(fach, art = 'fachabi') {
    const istPruef = art === 'abitur' ? fach.pruefungsfachAbi : fach.pruefungsfach;
    if (!istPruef) return null;
    const pr = (art === 'abitur' ? fach.pruefungAbi : fach.pruefung) || {};
    const s = zahl(pr.schriftlich);
    const m = zahl(pr.muendlich);
    if (s === null) return null;
    return m === null ? s : rundePunkte((2 * s + m) / 3);
  }

  /** § 13 Abs. 2: Halbjahresergebnis der fachpraktischen Ausbildung. */
  function fpaHalbjahr(fpa, hj) {
    const d = (fpa && fpa[hj]) || {};
    const direkt = zahl(d.ergebnis);
    if (direkt !== null) return { punkte: direkt, quelle: 'zeugnis', null0: false };
    const a = zahl(d.anleitung);
    const v = zahl(d.vertiefung);
    const p = zahl(d.praktikum);
    if (a === null || v === null || p === null) return { punkte: null, quelle: null, null0: false };
    if (a === 0 || v === 0 || p === 0) return { punkte: 0, quelle: 'noten', null0: true };
    return { punkte: rundePunkte((a + v + 2 * p) / 4), quelle: 'noten', null0: false };
  }

  /** § 17 Abs. 2: Seminarergebnis. */
  function seminarErgebnis(sem) {
    const d = sem || {};
    const direkt = zahl(d.ergebnis);
    if (direkt !== null) return { punkte: direkt, quelle: 'zeugnis', null0: false };
    const ph = zahl(d.phase);
    const ar = zahl(d.arbeit);
    const ge = zahl(d.gespraech);
    if (ph === null || ar === null || ge === null) return { punkte: null, quelle: null, null0: false };
    if (ph === 0 || ar === 0 || ge === 0) return { punkte: 0, quelle: 'noten', null0: true };
    return { punkte: rundePunkte((2 * ph + 2 * ar + ge) / 5), quelle: 'noten', null0: false };
  }

  /** Optimale Streichung: (slots - anzahl) schlechteste, höchstens eins pro Fach, nur aus fertigen Fächern. */
  function einbringen(faecher, slotsVon, anzahl, pflichtHalbjahre) {
    let slotsGesamt = 0;
    let slotsOffen = 0;
    const kandidaten = [];
    const fachKomplett = new Map();
    for (const f of faecher) {
      let komplett = true;
      for (const hj of slotsVon(f)) {
        slotsGesamt++;
        const r = halbjahr(f, hj);
        if (r.punkte === null) { slotsOffen++; komplett = false; } else {
          kandidaten.push({ fachId: f.id, hj, punkte: r.punkte, gestrichen: false, pflicht: !!(pflichtHalbjahre && pflichtHalbjahre(f, hj)) });
        }
      }
      fachKomplett.set(f.id, komplett);
    }
    const zuStreichen = Math.max(0, slotsGesamt - anzahl);
    const schlechtestesProFach = new Map();
    for (const k of kandidaten) {
      if (!fachKomplett.get(k.fachId) || k.pflicht) continue;
      const bisher = schlechtestesProFach.get(k.fachId);
      if (!bisher || k.punkte < bisher.punkte) schlechtestesProFach.set(k.fachId, k);
    }
    [...schlechtestesProFach.values()].sort((a, b) => a.punkte - b.punkte).slice(0, zuStreichen).forEach((k) => { k.gestrichen = true; });
    const faecherMitSlots = faecher.filter((f) => slotsVon(f).length > 0).length;
    return { kandidaten, slotsGesamt, slotsOffen, zuStreichen, faecherMitSlots };
  }

  const zaehleUnter4 = (werte) => werte.reduce((s, p) => s + (p === null ? 0 : p === 0 ? 2 : p < 4 ? 1 : 0), 0);

  /**
   * Gesamtauswertung. art: 'fachabi' (Anlage 4 Nr. 1) oder 'abitur' (Anlage 4 Nr. 3).
   * Ergebnis: E, M (erfasster Teil), Mgesamt, S (Hochrechnung bzw. Endergebnis), Einbringung, Bestehen.
   */
  function auswertung(state, art = 'fachabi') {
    const abi = art === 'abitur';
    const faecher = state.faecher || [];
    const warnungen = [];
    const faktor = abi ? 2 : 3;
    const anzahlHj = abi ? 16 : 25;
    const slotsVon = abi ? einbringbareHalbjahreAbitur : einbringbareHalbjahre;

    // Zweite Fremdsprache beim Abitur (§ 35 Abs. 7, § 38 Abs. 2)
    const fs = (abi && state.zweiteFS) || { modus: 'keine' };
    const fsPflicht = fs.modus === 'jgst13' && fs.fachId ? (f, hj) => f.id === fs.fachId && hj.startsWith('13') : null;
    let Mgesamt = abi ? M_ABITUR : M_GESAMT;
    if (abi && (fs.modus === 'wpf12' || fs.modus === 'ergaenzung')) Mgesamt = 420;

    const ein = einbringen(faecher, slotsVon, anzahlHj, fsPflicht);
    if (ein.slotsGesamt < anzahlHj) {
      warnungen.push(`Es sind nur ${ein.slotsGesamt} einbringbare Halbjahre${abi ? ' in der 13. Klasse' : ''} eingerichtet, nötig sind ${anzahlHj}. Prüfe deine Fächer.`);
    }
    if (ein.zuStreichen > ein.faecherMitSlots) {
      warnungen.push(`Es müssten ${ein.zuStreichen} Halbjahre gestrichen werden, erlaubt ist aber nur eins pro Fach. Prüfe deine Fächer.`);
    }

    const eingebracht = ein.kandidaten.filter((k) => !k.gestrichen);
    let E = eingebracht.reduce((s, k) => s + k.punkte, 0);
    let M = eingebracht.length * 15;
    let restMax = Math.max(0, anzahlHj - eingebracht.length) * 15;

    // Prüfungen
    const pruefungsfaecher = faecher.filter((f) => (abi ? f.pruefungsfachAbi : f.pruefungsfach));
    if (pruefungsfaecher.length !== 4) {
      warnungen.push(`Es müssen genau 4 Prüfungsfächer${abi ? ' fürs Abitur' : ''} markiert sein (aktuell ${pruefungsfaecher.length}).`);
    }
    const pruefungen = pruefungsfaecher.map((f) => ({ fachId: f.id, punkte: pruefungsergebnis(f, art) }));
    for (const p of pruefungen) if (p.punkte !== null) { E += faktor * p.punkte; M += faktor * 15; }
    restMax += Math.max(0, 4 - pruefungen.filter((p) => p.punkte !== null).length) * faktor * 15;

    // Fachabi: fachpraktische Ausbildung
    let fpa = [];
    let fpaGesamt = null;
    if (!abi) {
      fpa = ['11_1', '11_2'].map((hj) => ({ hj, ...fpaHalbjahr(state.fpa, hj) }));
      for (const r of fpa) if (r.punkte !== null) { E += r.punkte; M += 15; } else restMax += 15;
      if (fpa.some((r) => r.null0)) warnungen.push('Ein Bereich der fachpraktischen Ausbildung hat 0 Punkte: Die fpA ist dann nicht bestanden (§ 13 Abs. 2).');
      const werte = fpa.filter((r) => r.punkte !== null).map((r) => r.punkte);
      fpaGesamt = werte.length ? (fpa.some((r) => r.null0) ? 0 : rundePunkte(werte.reduce((a, b) => a + b, 0) / werte.length)) : null;
    }

    // Abitur: Seminar und ggf. zweite Fremdsprache
    let seminar = null;
    let zweiteFS = null;
    if (abi) {
      seminar = seminarErgebnis(state.seminar);
      if (seminar.punkte !== null) { E += 2 * seminar.punkte; M += 30; } else restMax += 30;
      if (seminar.null0) warnungen.push('Eine Seminarleistung hat 0 Punkte: Das Seminar ist dann nicht bestanden (§ 17 Abs. 2).');
      if (fs.modus === 'wpf12') {
        const werte = [zahl(fs.hj1), zahl(fs.hj2)];
        zweiteFS = { punkte: werte };
        for (const w of werte) if (w !== null) { E += w; M += 15; } else restMax += 15;
      } else if (fs.modus === 'ergaenzung') {
        const w = zahl(fs.pruefung);
        zweiteFS = { punkte: [w] };
        if (w !== null) { E += 2 * w; M += 30; } else restMax += 30;
      }
    }

    // Gesamtergebnisse je Fach (§ 35 Abs. 3)
    const gesamtergebnisse = [];
    for (const f of faecher) {
      if (!slotsVon(f).length) continue;
      const eigene = eingebracht.filter((k) => k.fachId === f.id);
      const p = pruefungsergebnis(f, art);
      let summe = eigene.reduce((s, k) => s + k.punkte, 0);
      let anzahl = eigene.length;
      if (p !== null) { summe += faktor * p; anzahl += faktor; }
      gesamtergebnisse.push({ fachId: f.id, punkte: anzahl ? rundePunkte(summe / anzahl) : null });
    }

    // Bestehen
    const pruefWerte = pruefungen.map((p) => p.punkte);
    const geWerte = gesamtergebnisse.map((g) => g.punkte).concat(fpaGesamt === null ? [] : [fpaGesamt]);
    const geUnter4 = zaehleUnter4(geWerte);
    const vollstaendig =
      ein.slotsOffen === 0 && ein.slotsGesamt >= anzahlHj && eingebracht.length === anzahlHj &&
      pruefungsfaecher.length === 4 && pruefungen.every((p) => p.punkte !== null) &&
      (abi ? seminar.punkte !== null && (!zweiteFS || zweiteFS.punkte.every((w) => w !== null)) : fpa.every((r) => r.punkte !== null));

    const bestehen = [];
    if (abi) {
      const unter4 = pruefWerte.filter((p) => p !== null && p >= 1 && p <= 3).length;
      const null0 = pruefWerte.filter((p) => p === 0).length;
      bestehen.push({ ok: unter4 <= 2, text: `Höchstens 2 Prüfungsergebnisse mit 1–3 Punkten (aktuell ${unter4})` });
      bestehen.push({ ok: null0 === 0, text: `Keine Prüfung mit 0 Punkten (aktuell ${null0})` });
    } else {
      const pruefUnter4 = zaehleUnter4(pruefWerte);
      bestehen.push({ ok: pruefUnter4 <= 2, text: `Höchstens 2 Prüfungsergebnisse unter 4 Punkten (aktuell ${pruefUnter4}, 0 Punkte zählen doppelt)` });
    }
    bestehen.push({ ok: geUnter4 <= 2, text: `Höchstens 2 Gesamtergebnisse unter 4 Punkten (aktuell ${geUnter4}, 0 Punkte zählen doppelt)` });
    const min1 = Math.round(Mgesamt / 3);
    const min2 = Math.round(Mgesamt * 0.4);
    if (geUnter4 === 1) bestehen.push({ ok: E >= min1, text: `Bei einem Gesamtergebnis unter 4 Punkten mindestens ${min1} Punkte (aktuell ${E})` });
    if (geUnter4 === 2) bestehen.push({ ok: E >= min2, text: `Bei zwei Gesamtergebnissen unter 4 Punkten mindestens ${min2} Punkte (aktuell ${E})` });
    if (!abi && fpa.some((r) => r.null0)) bestehen.push({ ok: false, text: 'Fachpraktische Ausbildung bestanden' });
    if (abi && seminar.null0) bestehen.push({ ok: false, text: 'Seminar bestanden' });

    return {
      art,
      E,
      M,
      Mgesamt,
      S: M > 0 ? durchschnitt(E, M) : null,
      vollstaendig,
      restMax,
      kandidaten: ein.kandidaten,
      eingebrachtAnzahl: eingebracht.length,
      anzahlHj,
      slotsGesamt: ein.slotsGesamt,
      slotsOffen: ein.slotsOffen,
      zuStreichen: ein.zuStreichen,
      faktor,
      pruefungen,
      fpa,
      fpaGesamt,
      seminar,
      zweiteFS,
      gesamtergebnisse,
      bestehen,
      warnungen,
    };
  }

  const fachabitur = (state) => auswertung(state, 'fachabi');
  const abitur = (state) => auswertung(state, 'abitur');

  /** Kleinste Gesamtpunktzahl E (von M), mit der der Schnitt höchstens `ziel` ist. */
  function benoetigteSumme(ziel, M = M_GESAMT) {
    for (let E = 0; E <= M; E++) if (durchschnitt(E, M) <= ziel + 1e-9) return E;
    return null;
  }

  /** Mindestpunkte der nächsten Note, damit das Halbjahresergebnis >= zielPunkte wird. */
  function naechsteNoteFuer(fach, hj, zielPunkte, art, gewicht = 1) {
    for (let y = 0; y <= 15; y++) {
      const test = { ...fach, zeugnis: {}, noten: (fach.noten || []).concat([{ hj, art, punkte: y, gewicht }]) };
      const r = halbjahr(test, hj);
      if (r.berechnet !== null && r.berechnet >= zielPunkte) return y;
    }
    return null;
  }

  return {
    HJ, HJ_LABEL, M_GESAMT, M_ABITUR,
    rundePunkte, durchschnitt, notenstufe, noteAusPunkten, stufeAusPunkten, gewichteterSchnitt,
    halbjahr, halbjahreDesFachs, einbringbareHalbjahre, einbringbareHalbjahreAbitur,
    pruefungsergebnis, fpaHalbjahr, seminarErgebnis,
    auswertung, fachabitur, abitur, benoetigteSumme, naechsteNoteFuer,
  };
})();

if (typeof module !== 'undefined') module.exports = Calc;
