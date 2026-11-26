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
 *
 * Abgleich mit dem Streichvorschlag-Tool der FOS (Jgst. 12):
 *  - Prüfung: (2 x sAP + mAP) / 3; Werte unter 1 => 0, sonst kaufmännisch gerundet.
 *    sAP aller 4 Prüfungen und mAP Englisch sind Pflicht, sonst "Eingaben unvollständig".
 *  - Gesamtergebnis je Fach (nur für die Unterpunktungen): erst auf 2 Nachkommastellen,
 *    dann auf ganze Punkte gerundet (siehe gesamtergebnisRunden). fpA-Gesamtnote zählt mit.
 *  - Streichen: höchstens 1 HJL je Fach, Kandidat ist die niedrigste HJL (früheres HJ bei
 *    Gleichstand). Reihenfolge: k-Halbjahre, Rettung eines Gesamtergebnisses vor der
 *    Unterpunktung, sonst die niedrigsten Punkte. Streichungen, die eine Unterpunktung
 *    erzeugen, kommen nur zum Zug, wenn es nötig ist.
 *    Letzter Tiebreak bei sonst gleichwertigen Fächern: die Zeilenreihenfolge des Tools
 *    (siehe toolRang), nicht die Reihenfolge der Fächer in der App.
 *  - Gesamtergebnisoptimierter Vorschlag (Tausch) nur bei bestandenem Stand.
 *  - "k" (keine Note möglich) muss gestrichen werden; mehr k als Streichungen => nicht bestanden.
 *
 * Streichmodus (state.streichModus[art]: 'aus' | 'ein', Standard 'aus'; state.gestrichen[art]: { fachId: hj }):
 *  - 'aus': nichts wird gestrichen (gestrichen wird erst am Ende der 12. bzw. 13. Klasse). Alle
 *    einbringbaren Halbjahre zählen, auch 11/1 der Fächer, die mit Jgst. 11 enden. k-Halbjahre
 *    zählen nicht (weder mit noch als 0). Damit E und Schnitt vergleichbar bleiben, wird der
 *    Halbjahresteil auf die gesetzliche Zahl (25 bzw. 16) umgerechnet:
 *      HJ-Teil = Summe der HJ-Punkte × slots / Z,  Z = alle zählbaren Halbjahre (ohne k),
 *    ebenso das Maximum (erfasste HJ × 15 × slots / Z). Ohne Zwischenrundung, E bleibt eine
 *    Kommazahl. Das Ergebnis ist vorläufig ('vorläufig bestanden' / 'vorläufig nicht bestanden').
 *  - 'ein': gestrichen wird, was der Nutzer gewählt hat (je Fach höchstens eins, insgesamt
 *    höchstens N). k-Halbjahre kommen immer dazu. Fehlen noch Streichungen, ergänzt die
 *    automatische Regel oben sie in den übrigen Fächern (Kennzeichen wahl: 'auto'). Ohne eigene
 *    Wahl ist das genau der automatische Streichvorschlag.
 *    state.behalten[art] = { fachId: true }: Fächer, die der Nutzer zurückgeholt hat. Die Ergänzung
 *    nimmt sie nur, wenn kein anderes Fach übrig ist (mit Warnung).
 *  - Alte Werte: 'auto' => 'aus', 'manuell' => 'ein'. Die alten Felder fach.streichen/streichenAbi
 *    werden ignoriert.
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

  /** "k": für dieses Halbjahr ist keine Note möglich (Zeugniswert 'k'). */
  function istKeineNote(fach, hj) {
    const z = fach && fach.zeugnis && fach.zeugnis[hj];
    return typeof z === 'string' && z.trim().toLowerCase() === 'k';
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
    const k = istKeineNote(fach, hj);
    const zeugnis = k ? null : zahl(fach.zeugnis && fach.zeugnis[hj]);
    return {
      roh,
      berechnet,
      k,
      punkte: k ? null : zeugnis !== null ? zeugnis : berechnet,
      quelle: k ? 'k' : zeugnis !== null ? 'zeugnis' : berechnet !== null ? 'noten' : null,
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

  /**
   * § 35 Abs. 2. art: 'fachabi' (Feld pruefung) oder 'abitur' (Feld pruefungAbi).
   * Ohne mündliche Prüfung zählt die schriftliche. (2s + m)/3 unter 1 => 0 (z. B. 0,67 -> 0).
   */
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

  /**
   * ROUND(x; 2) wie in der Tabellenkalkulation (ab der 3. Nachkommastelle 5 auf).
   * Das kleine Epsilon gleicht Binärfehler aus (3,495 * 100 = 349,4999…).
   */
  function runde2(v) {
    if (!istZahl(v)) return null;
    return Math.round(v * 100 + 1e-7) / 100;
  }

  /**
   * Gesamtergebnis eines Fachs auf ganze Punkte.
   * Bewusst zweistufig: zuerst auf 2 Nachkommastellen, dann unter 1 => 0, sonst auf ganze Punkte.
   * § 19 Abs. 6 kennt keine Zwischenrundung, das Streichvorschlag-Tool der FOS rundet aber so
   * (ROUND(...;2), dann ROUND(...;0)). Wir übernehmen das, damit die Unterpunktungen genau
   * übereinstimmen. Unterschied nur bei Werten von x,495 bis unter x,5 (z. B. 3,495 -> 3,50 -> 4).
   */
  function gesamtergebnisRunden(roh) {
    const z = runde2(roh);
    if (z === null) return null;
    return z < 1 ? 0 : Math.floor(z + 0.5 + 1e-9);
  }

  /** Gesamtergebnis aus eingebrachten HJL (je x1) und ggf. Prüfung (x faktor). */
  function gesamtergebnis(hjl, ap, faktor = 3) {
    let summe = hjl.reduce((s, p) => s + p, 0);
    let anzahl = hjl.length;
    if (istZahl(ap)) { summe += faktor * ap; anzahl += faktor; }
    if (!anzahl) return { roh: null, punkte: null };
    const roh = summe / anzahl;
    return { roh, punkte: gesamtergebnisRunden(roh) };
  }

  /** Unterpunktungs-Gewicht: 0 Punkte zählen doppelt, 1–3 einfach. */
  const unterpunktung = (p) => (p === null || p === undefined ? 0 : p === 0 ? 2 : p < 4 ? 1 : 0);
  const zaehleUnter4 = (werte) => werte.reduce((s, p) => s + unterpunktung(p), 0);

  /**
   * Gespeicherte Auswahl in eine Liste [{ fachId, hj }] umwandeln.
   * Erlaubt { fachId: hj }, { fachId: [hj, …] } (alte/kaputte Daten) und [{ fachId, hj }, …].
   */
  function auswahlListe(g) {
    const res = [];
    if (!g || typeof g !== 'object') return res;
    if (Array.isArray(g)) {
      for (const w of g) if (w && w.fachId !== undefined && w.fachId !== null && typeof w.hj === 'string') res.push({ fachId: String(w.fachId), hj: w.hj });
      return res;
    }
    for (const [fachId, wert] of Object.entries(g)) {
      for (const hj of [].concat(wert)) if (typeof hj === 'string') res.push({ fachId, hj });
    }
    return res;
  }

  /**
   * Zeilenreihenfolge des Streichvorschlag-Tools der FOS (nur als letzter Tiebreak beim Streichen).
   * Beide Blätter (SWW: Sozialwesen, Wirtschaft, Internationale Wirtschaft; GTAG: Gesundheit,
   * Technik, ABU, Gestaltung) haben dieselbe Grundordnung:
   *   Religionslehre, Deutsch, Englisch, Geschichte, Politik und Gesellschaft, Mathematik, Sport,
   *   Profilfach 1..5 (SWW) bzw. 1..4 (GTAG) in der Reihenfolge des Tools, fpA, Wahlpflichtfächer.
   * Profilfächer je Richtung in Tool-Reihenfolge (alte und neue Namen; "Gestaltung" ist das
   * Abitur-Profilfach 1 der Gestaltung).
   */
  const TOOL_PROFIL = {
    technik: [['Physik'], ['Chemie'], ['Mathematik Additum'], ['KIT (KI, Informatik und Technologie)', 'Technologie']],
    abu: [['Biologie'], ['Chemie'], ['Technologie'], ['Physik']],
    gesundheit: [['Gesundheitswissenschaften'], ['Chemie'], ['Biologie'], ['Kommunikation und Interaktion']],
    gestaltung: [['Gestaltung Praxis', 'Gestaltung'], ['Gestaltung Theorie'], ['Naturwissenschaften'], ['Medien']],
    sozial: [['Pädagogik/Psychologie'], ['Sozialwirtschaft und Recht'], ['Chemie'], ['Biologie'], ['Soziologie']],
    wirtschaft: [['BWL', 'BwR (Betriebswirtschaftslehre mit Rechnungswesen)'], ['Volkswirtschaftslehre'], ['Rechtslehre'], ['Naturwissenschaften'], ['KIWI (KI und Wirtschaftsinformatik)', 'Informatik']],
    intwirtschaft: [['IBV (Internationale BWL und VWL)'], ['Französisch/Spanisch'], ['Rechtslehre'], ['Naturwissenschaften'], ['KIWI (KI und Wirtschaftsinformatik)', 'International Business Studies']],
  };
  const schluessel = (n) => String(n || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
  const TOOL_GRUND = {
    religionslehreethik: 8, religionslehre: 8, ethik: 8, religion: 8,
    deutsch: 9, englisch: 10, geschichte: 11, politikundgesellschaft: 12, geschichtepolitikundgesellschaft: 12,
    mathematik: 13, sport: 14,
  };

  /** Richtung aus state.richtung oder, falls nicht gesetzt, aus dem Namen des Prüfungs-Profilfachs 1. */
  function richtungVon(faecher, richtung) {
    if (richtung && TOOL_PROFIL[richtung]) return richtung;
    for (const f of faecher) {
      if (!f.pruefungsfach && !f.pruefungsfachAbi) continue;
      const s = schluessel(f.name);
      for (const [r, liste] of Object.entries(TOOL_PROFIL)) if (liste[0].some((n) => schluessel(n) === s)) return r;
    }
    return null;
  }

  /**
   * Rang je Fach in der Zeilenreihenfolge des Tools: { fachId: Zahl }. Bekannte Fächer nach Rolle
   * (Wahlpflichtfach, Name), Profilfächer nach der Reihenfolge der Richtung; unbekannte oder selbst
   * angelegte Fächer danach in der Reihenfolge der App. Bei gleicher Rolle entscheidet die App-Reihenfolge.
   */
  function toolRang(faecher, richtung) {
    const r = richtungVon(faecher, richtung);
    const profil = r ? TOOL_PROFIL[r] : null;
    const alleProfil = new Set([].concat(...Object.values(TOOL_PROFIL).map((l) => [].concat(...l))).map(schluessel));
    const rang = {};
    faecher.forEach((f, i) => {
      const s = schluessel(f.name);
      let basis = 1000;
      if (f.wpf) basis = 30;
      else if (TOOL_GRUND[s] !== undefined) basis = TOOL_GRUND[s];
      else if (profil) {
        const pos = profil.findIndex((namen) => namen.some((n) => schluessel(n) === s));
        if (pos >= 0) basis = 15 + pos;
      } else if (alleProfil.has(s)) basis = 15;
      rang[f.id] = basis + i / 1000;
    });
    return rang;
  }

  /**
   * Einbringung und Streichvorschlag (in Anlehnung an das Streichvorschlag-Tool der FOS).
   * Gestrichen werden (slots - anzahl) Halbjahre, höchstens eins je Fach.
   * Kandidat je Fach: niedrigste HJL, bei Gleichstand das frühere Halbjahr; "k" immer zuerst.
   * Im Teilstand nur Fächer, deren einbringbare Halbjahre alle feststehen (k-Halbjahre immer).
   * Priorität: k > Rettung vor Unterpunktung > automatisch (niedrigste Punkte)
   *   > Streichung, die eine Unterpunktung erzeugt/verschlimmert.
   * Rettungen und der Schutz vor neuen Unterpunktungen kosten unter Umständen Punkte. Wie das Tool
   * setzen wir sie nur so weit ein, wie es fürs Bestehen nötig ist: Von allen Varianten gewinnt die,
   * die besteht und die meisten Punkte bringt.
   * Manueller Modus (ctx.manuell = [{ fachId, hj }]): k-Halbjahre und die gültige Auswahl stehen
   * fest (auch in unvollständigen Fächern, auch noch offene Halbjahre). Die restlichen
   * Streichungen ergänzt die automatische Regel in den übrigen Fächern.
   * ctx.ohneStreichen: nichts streichen (Modus 'aus'); kOffen zählt dann die k-Halbjahre, die sich
   * später nicht streichen ließen.
   * ctx: { pflicht(f, hj), faktor, apVon(f), bewerten(eHjl, geWerte), schnitt(E), manuell, behalten, ohneStreichen }
   */
  function einbringen(faecher, slotsVon, anzahl, ctx = {}) {
    const faktor = ctx.faktor || 3;
    const apVon = ctx.apVon || (() => null);
    const bewerten = ctx.bewerten || ((eHjl) => ({ besteht: true, geUnter4: 0, E: eHjl }));
    const pflicht = (f, hj) => !!(ctx.pflicht && ctx.pflicht(f, hj));
    const ohne = !!ctx.ohneStreichen;
    const manuell = !ohne && Array.isArray(ctx.manuell) ? ctx.manuell : null;
    // "behalten" (nur manuell): Fächer, die zählen sollen; die automatische Ergänzung nimmt sie nur, wenn nichts anderes übrig ist
    const behalten = manuell && ctx.behalten ? ctx.behalten : {};
    const istBehalten = (p) => behalten[p.f.id] === true;
    let slotsGesamt = 0;
    const kandidaten = [];
    const proFach = [];
    faecher.forEach((f, index) => {
      const slots = slotsVon(f);
      if (!slots.length) return;
      const eigene = [];
      const offen = [];
      for (const hj of slots) {
        slotsGesamt++;
        const r = halbjahr(f, hj);
        if (!r.k && r.punkte === null) { offen.push(hj); continue; }
        const k = { fachId: f.id, hj, punkte: r.k ? 0 : r.punkte, k: r.k, gestrichen: false, pflicht: pflicht(f, hj) };
        kandidaten.push(k);
        eigene.push(k);
      }
      const rang = ctx.rang && istZahl(ctx.rang[f.id]) ? ctx.rang[f.id] : index;
      proFach.push({ f, index, rang, slots, eigene, offen, ap: apVon(f), fest: null });
    });
    const zuStreichen = Math.max(0, slotsGesamt - anzahl);
    const hinweise = [];
    const name = (p) => p.f.name || 'Fach';

    // Wählbar (manueller Modus): einbringbare Halbjahre ohne Pflicht; Fächer mit k sind schon belegt.
    const waehlbar = {};
    for (const p of proFach) waehlbar[p.f.id] = p.eigene.some((k) => k.k) ? [] : p.slots.filter((hj) => !pflicht(p.f, hj));

    // Feste Streichungen im manuellen Modus
    const fest = [];
    let manuellAnzahl = 0;
    if (manuell) {
      // 1. k-Halbjahre (eins je Fach, höchstens zuStreichen)
      for (const p of proFach) {
        const kk = p.eigene.find((k) => k.k && !k.pflicht);
        if (kk && fest.length < zuStreichen) { fest.push(kk); p.fest = kk; }
      }
      // 2. Auswahl prüfen: gelöschte Fächer, nicht einbringbare/Pflicht-Halbjahre und zweite Wahl im Fach fallen weg
      const gueltig = [];
      for (const w of manuell) {
        const p = proFach.find((x) => x.f.id === w.fachId);
        if (!p || gueltig.some((g) => g.p === p)) continue;
        if (p.eigene.some((k) => k.k)) {
          if (p.slots.includes(w.hj) && !(p.eigene.find((k) => k.hj === w.hj) || {}).k) {
            hinweise.push(`${name(p)} hat ein Halbjahr ohne Note (k). Das wird gestrichen, deine Auswahl in diesem Fach zählt deshalb nicht.`);
          }
          continue;
        }
        if (!waehlbar[p.f.id].includes(w.hj)) continue;
        gueltig.push({ p, hj: w.hj });
      }
      gueltig.sort((a, b) => a.p.index - b.p.index);
      const frei = Math.max(0, zuStreichen - fest.length);
      if (gueltig.length > frei) {
        hinweise.push(`Es sind ${gueltig.length} Halbjahre zum Streichen ausgewählt, möglich sind nur ${frei}. Es zählen die ersten ${frei} in der Reihenfolge deiner Fächer.`);
        gueltig.length = frei;
      }
      for (const { p, hj } of gueltig) {
        let kand = p.eigene.find((k) => k.hj === hj);
        if (!kand) {
          // Noch offenes Halbjahr: zählt nicht mehr als fehlend, weil es wegfällt
          kand = { fachId: p.f.id, hj, punkte: null, k: false, offen: true, gestrichen: false, pflicht: false };
          kandidaten.push(kand);
          p.eigene.push(kand);
          p.offen = p.offen.filter((h) => h !== hj);
        }
        kand.manuell = true;
        fest.push(kand);
        p.fest = kand;
        manuellAnzahl++;
      }
    }
    const slotsOffen = proFach.reduce((s, p) => s + p.offen.length, 0);
    const rest = ohne ? 0 : Math.max(0, zuStreichen - fest.length);

    // Eine Option je Fach (nur Fächer ohne feste Streichung)
    const optionen = [];
    for (const p of proFach) {
      if (p.fest) continue;
      const moeglich = p.eigene.filter((k) => !k.pflicht);
      if (!moeglich.length) continue;
      let kand = moeglich[0];
      const schluessel = (k) => (k.k ? -1 : k.punkte);
      for (const k of moeglich) if (schluessel(k) < schluessel(kand)) kand = k;
      if (p.offen.length && !kand.k) continue;
      const ohne = gesamtergebnis(p.eigene.map((k) => k.punkte), p.ap, faktor);
      const mit = gesamtergebnis(p.eigene.filter((k) => k !== kand).map((k) => k.punkte), p.ap, faktor);
      optionen.push({
        kand, p, ohne, mit,
        gewinn: (mit.roh ?? 0) - (ohne.roh ?? 0),
        rettung: !kand.k && ohne.punkte !== null && ohne.punkte < 4 && mit.punkte !== null && mit.punkte >= 4,
        gefahr: !kand.k && unterpunktung(mit.punkte) > unterpunktung(ohne.punkte),
      });
    }
    const vergleich = (a, b) => a.kand.punkte - b.kand.punkte || b.gewinn - a.gewinn || (a.ohne.roh ?? 99) - (b.ohne.roh ?? 99) || a.p.rang - b.p.rang;
    const rettungen = ohne ? [] : optionen.filter((o) => o.rettung).sort(vergleich);

    function auswahl(anzahlRettungen, schutz) {
      const gerettet = new Set(rettungen.slice(0, anzahlRettungen));
      const stufe = (o) => (o.kand.k ? 0 : istBehalten(o.p) ? 6 : gerettet.has(o) ? 2 : schutz && o.gefahr ? 4 : 3);
      return optionen.slice().sort((a, b) => stufe(a) - stufe(b) || vergleich(a, b)).slice(0, rest);
    }

    function auswerten(gewaehlt) {
      const weg = new Set(fest.concat(gewaehlt.map((o) => o.kand)));
      let eHjl = 0;
      for (const k of kandidaten) if (!weg.has(k) && k.punkte !== null) eHjl += k.punkte;
      const ge = proFach.map((p) => gesamtergebnis(p.eigene.filter((k) => !weg.has(k)).map((k) => k.punkte), p.ap, faktor).punkte);
      return { ...bewerten(eHjl, ge), ge };
    }

    // Varianten: 0..n Rettungen, mit/ohne Schutz vor neuen Unterpunktungen
    let beste = null;
    for (let r = 0; r <= rettungen.length; r++) {
      for (const schutz of [false, true]) {
        const gewaehlt = auswahl(r, schutz);
        const w = auswerten(gewaehlt);
        const besser = !beste ||
          (w.besteht && !beste.w.besteht) ||
          (w.besteht === beste.w.besteht && (w.besteht
            ? w.E > beste.w.E || (w.E === beste.w.E && w.geUnter4 < beste.w.geUnter4)
            : w.geUnter4 < beste.w.geUnter4 || (w.geUnter4 === beste.w.geUnter4 && w.E > beste.w.E)));
        if (besser) beste = { gewaehlt, w };
      }
    }
    const gewaehlt = beste ? beste.gewaehlt : [];
    for (const k of fest) { k.gestrichen = true; k.wahl = k.manuell ? 'manuell' : 'auto'; }
    for (const o of gewaehlt) { o.kand.gestrichen = true; o.kand.wahl = 'auto'; }
    for (const o of gewaehlt) {
      if (istBehalten(o.p) && !o.kand.k) hinweise.push(`${name(o.p)} soll zählen, musste aber automatisch gestrichen werden, weil kein anderes Fach mehr übrig ist. Wähl selbst ein anderes Halbjahr zum Streichen.`);
    }

    const kAnzahl = kandidaten.filter((k) => k.k).length;
    let kOffen = kandidaten.filter((k) => k.k && !k.gestrichen).length;
    if (ohne) {
      // Wie viele k-Halbjahre ließen sich später streichen? (eins je Fach, keine Pflicht, höchstens zuStreichen)
      let moeglich = 0;
      for (const p of proFach) if (moeglich < zuStreichen && p.eigene.some((k) => k.k && !k.pflicht)) moeglich++;
      kOffen = kAnzahl - moeglich;
    }

    // Gesamtergebnisoptimierter Vorschlag (nur für den reinen Vorschlag, also ohne eigene Wahl):
    // Tausch einer Streichung, der ein Gesamtergebnis um eine Notenstufe verbessert, ohne den
    // Schnitt zu ändern oder das Bestehen zu gefährden. Wie im Tool nur bei bestandenem Stand:
    // Ist der Stand nicht bestanden, gibt es keinen Vorschlag (er würde nur Punkte kosten).
    const tausch = [];
    const nurVorschlag = !manuell || (manuellAnzahl === 0 && !Object.keys(behalten).length);
    if (!ohne && nurVorschlag && slotsOffen === 0 && ctx.schnitt && beste && beste.w.besteht) {
      let aktuell = gewaehlt.slice();
      let aktW = beste.w;
      const sStart = ctx.schnitt(aktW.E);
      for (let runde = 0; runde < 5; runde++) {
        let bester = null;
        for (const raus of aktuell) {
          if (raus.kand.k) continue;
          for (const rein of optionen) {
            if (aktuell.includes(rein) || rein.kand.k) continue;
            const neu = aktuell.filter((o) => o !== raus).concat([rein]);
            const w = auswerten(neu);
            if (ctx.schnitt(w.E) !== sStart || !w.besteht) continue;
            let besser = 0;
            let schlechter = false;
            for (const p of [raus.p, rein.p]) {
              const i = proFach.indexOf(p);
              const vor = stufeAusPunkten(aktW.ge[i]);
              const nach = stufeAusPunkten(w.ge[i]);
              if (nach < vor) besser++;
              if (nach > vor) schlechter = true;
            }
            if (schlechter || !besser) continue;
            const verlust = aktW.E - w.E;
            if (!bester || besser > bester.besser || (besser === bester.besser && verlust < bester.verlust)) bester = { raus, rein, w, besser, verlust };
          }
        }
        if (!bester) break;
        const i = proFach.indexOf(bester.rein.p);
        tausch.push({
          stattFachId: bester.raus.p.f.id, stattHj: bester.raus.kand.hj,
          fachId: bester.rein.p.f.id, hj: bester.rein.kand.hj,
          gePunkteVorher: aktW.ge[i], gePunkteNachher: bester.w.ge[i],
          punkteVerlust: bester.verlust,
        });
        aktuell = aktuell.filter((o) => o !== bester.raus).concat([bester.rein]);
        aktW = bester.w;
      }
    }

    return {
      kandidaten, slotsGesamt, slotsOffen, zuStreichen, faecherMitSlots: proFach.length, kAnzahl, kOffen, hinweise, tausch,
      modus: ohne ? 'aus' : manuell ? 'ein' : 'auto', waehlbar, festAnzahl: fest.length, manuellAnzahl,
    };
  }

  /**
   * Gesamtauswertung. art: 'fachabi' (Anlage 4 Nr. 1) oder 'abitur' (Anlage 4 Nr. 3).
   * Ergebnis: E, M (erfasster Teil), Mgesamt, S (Hochrechnung bzw. Endergebnis), Einbringung, Bestehen.
   */
  function auswertung(state, art = 'fachabi') {
    const abi = art === 'abitur';
    const faecher = state.faecher || [];
    const warnungen = [];
    const hinweise = [];
    const faktor = abi ? 2 : 3;
    const anzahlHj = abi ? 16 : 25;
    const slotsVon = abi ? einbringbareHalbjahreAbitur : einbringbareHalbjahre;

    // Zweite Fremdsprache beim Abitur (§ 35 Abs. 7, § 38 Abs. 2)
    const fs = (abi && state.zweiteFS) || { modus: 'keine' };
    const fsPflicht = fs.modus === 'jgst13' && fs.fachId ? (f, hj) => f.id === fs.fachId && hj.startsWith('13') : null;
    let Mgesamt = abi ? M_ABITUR : M_GESAMT;
    if (abi && (fs.modus === 'wpf12' || fs.modus === 'ergaenzung')) Mgesamt = 420;
    const min1 = Math.round(Mgesamt / 3);
    const min2 = Math.round(Mgesamt * 0.4);

    let Erest = 0;
    let M = 0;
    let restMax = 0;

    // Prüfungen
    const pruefungsfaecher = faecher.filter((f) => (abi ? f.pruefungsfachAbi : f.pruefungsfach));
    if (pruefungsfaecher.length !== 4) {
      warnungen.push(`Es müssen genau 4 Prüfungsfächer${abi ? ' fürs Abitur' : ''} markiert sein (aktuell ${pruefungsfaecher.length}).`);
    }
    const pruefungen = pruefungsfaecher.map((f) => ({ fachId: f.id, punkte: pruefungsergebnis(f, art) }));
    for (const p of pruefungen) if (p.punkte !== null) { Erest += faktor * p.punkte; M += faktor * 15; }
    restMax += Math.max(0, 4 - pruefungen.filter((p) => p.punkte !== null).length) * faktor * 15;
    const pruefFeld = abi ? 'pruefungAbi' : 'pruefung';
    const englisch = pruefungsfaecher.find((f) => /englisch/i.test(f.name || ''));
    const englischMuendlichFehlt = !!englisch && zahl((englisch[pruefFeld] || {}).muendlich) === null;

    // Fachabi: fachpraktische Ausbildung
    let fpa = [];
    let fpaGesamt = null;
    if (!abi) {
      fpa = ['11_1', '11_2'].map((hj) => ({ hj, ...fpaHalbjahr(state.fpa, hj) }));
      for (const r of fpa) if (r.punkte !== null) { Erest += r.punkte; M += 15; } else restMax += 15;
      if (fpa.some((r) => r.null0)) warnungen.push('Ein Bereich der fachpraktischen Ausbildung hat 0 Punkte: Die fpA ist dann nicht bestanden (§ 13 Abs. 2).');
      const werte = fpa.filter((r) => r.punkte !== null).map((r) => r.punkte);
      // fpA-Gesamtnote: Mittel der zwei Halbjahre, gerundet wie ein Gesamtergebnis; zählt bei den Unterpunktungen mit.
      fpaGesamt = werte.length ? (fpa.some((r) => r.null0) ? 0 : gesamtergebnisRunden(werte.reduce((a, b) => a + b, 0) / werte.length)) : null;
    }

    // Abitur: Seminar und ggf. zweite Fremdsprache
    let seminar = null;
    let zweiteFS = null;
    if (abi) {
      seminar = seminarErgebnis(state.seminar);
      if (seminar.punkte !== null) { Erest += 2 * seminar.punkte; M += 30; } else restMax += 30;
      if (seminar.null0) warnungen.push('Eine Seminarleistung hat 0 Punkte: Das Seminar ist dann nicht bestanden (§ 17 Abs. 2).');
      if (fs.modus === 'wpf12') {
        const werte = [zahl(fs.hj1), zahl(fs.hj2)];
        zweiteFS = { punkte: werte };
        for (const w of werte) if (w !== null) { Erest += w; M += 15; } else restMax += 15;
      } else if (fs.modus === 'ergaenzung') {
        const w = zahl(fs.pruefung);
        zweiteFS = { punkte: [w] };
        if (w !== null) { Erest += 2 * w; M += 30; } else restMax += 30;
      }
    }

    // Einbringung und Streichvorschlag
    const extraGE = fpaGesamt === null ? [] : [fpaGesamt];
    const geRegel = (E, u) => u === 0 || (u === 1 && E >= min1) || (u === 2 && E >= min2);
    const modus = streichModusVon(state, art);
    const aus = modus === 'aus';
    const ein = einbringen(faecher, slotsVon, anzahlHj, {
      pflicht: fsPflicht,
      faktor,
      apVon: (f) => pruefungsergebnis(f, art),
      ohneStreichen: aus,
      manuell: aus ? null : auswahlListe((state.gestrichen || {})[art]),
      behalten: (state.behalten && state.behalten[art]) || {},
      rang: toolRang(faecher, state.richtung),
      bewerten: (eHjl, ge) => {
        const E = Erest + eHjl;
        const u = zaehleUnter4(ge.concat(extraGE));
        return { E, geUnter4: u, besteht: geRegel(E, u) };
      },
      schnitt: (E) => durchschnitt(E, Mgesamt),
    });
    if (ein.slotsGesamt < anzahlHj) {
      warnungen.push(`Es sind nur ${ein.slotsGesamt} einbringbare Halbjahre${abi ? ' in der 13. Klasse' : ''} eingerichtet, nötig sind ${anzahlHj}. Prüfe deine Fächer.`);
    }
    if (ein.zuStreichen > ein.faecherMitSlots) {
      warnungen.push(`Es müssten ${ein.zuStreichen} Halbjahre gestrichen werden, erlaubt ist aber nur eins pro Fach. Prüfe deine Fächer.`);
    }
    if (ein.kOffen > 0) {
      warnungen.push(`Zu viele Halbjahre ohne Note (k): ${ein.kAnzahl} k, aber nur ${ein.zuStreichen} Streichungen möglich (höchstens eine je Fach). Ein k-Halbjahr muss immer gestrichen werden.`);
    }
    warnungen.push(...ein.hinweise);

    // Modus 'aus': k-Halbjahre zählen nicht (auch nicht als 0), alle anderen zählen mit.
    const eingebracht = ein.kandidaten.filter((k) => !k.gestrichen && !(aus && k.k));
    const eHjl = eingebracht.reduce((s, k) => s + k.punkte, 0);
    let E;
    let zaehlbarHj = null;
    if (aus) {
      // Halbjahresteil auf anzahlHj (25 bzw. 16) umrechnen: × anzahlHj / Z, Z = alle zählbaren Halbjahre.
      // Im Teilstand gilt dasselbe Gewicht für erfasste und noch offene Halbjahre. Keine Zwischenrundung.
      zaehlbarHj = ein.slotsGesamt - ein.kAnzahl;
      const skal = (x) => (zaehlbarHj > 0 ? (x * anzahlHj) / zaehlbarHj : 0);
      E = Erest + skal(eHjl);
      M += skal(eingebracht.length * 15);
      restMax += skal(ein.slotsOffen * 15);
    } else {
      E = Erest + eHjl;
      M += eingebracht.length * 15;
      restMax += Math.max(0, anzahlHj - eingebracht.length) * 15;
    }
    const punkteText = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100).replace('.', ','));

    // Gesamtergebnisse je Fach (§ 35 Abs. 3)
    const gesamtergebnisse = [];
    for (const f of faecher) {
      if (!slotsVon(f).length) continue;
      const eigene = eingebracht.filter((k) => k.fachId === f.id).map((k) => k.punkte);
      gesamtergebnisse.push({ fachId: f.id, punkte: gesamtergebnis(eigene, pruefungsergebnis(f, art), faktor).punkte });
    }

    // Fehlende Eingaben
    if (ein.slotsOffen > 0) hinweise.push(`Es fehlen noch ${ein.slotsOffen} Halbjahresleistungen.`);
    const ohneSap = pruefungen.filter((p) => p.punkte === null).length + Math.max(0, 4 - pruefungen.length);
    if (ohneSap > 0) hinweise.push(`Es fehlen noch ${ohneSap} Ergebnisse der schriftlichen Abschlussprüfung.`);
    if (englischMuendlichFehlt) hinweise.push('Die mündliche Prüfung (Gruppenprüfung) in Englisch fehlt noch.');
    if (!abi && fpa.some((r) => r.punkte === null)) hinweise.push('Für die fachpraktische Ausbildung fehlt noch ein Halbjahresergebnis.');
    if (abi && seminar.punkte === null) hinweise.push('Das Seminarergebnis fehlt noch.');

    // Bestehen
    const pruefWerte = pruefungen.map((p) => p.punkte);
    const geWerte = gesamtergebnisse.map((g) => g.punkte).concat(extraGE);
    const geUnter4 = zaehleUnter4(geWerte);
    const vollstaendig =
      ein.slotsOffen === 0 && ein.slotsGesamt >= anzahlHj && (aus ? eingebracht.length > 0 : eingebracht.length === anzahlHj) &&
      pruefungsfaecher.length === 4 && pruefungen.every((p) => p.punkte !== null) &&
      (abi ? seminar.punkte !== null && (!zweiteFS || zweiteFS.punkte.every((w) => w !== null)) : fpa.every((r) => r.punkte !== null) && !englischMuendlichFehlt);

    const bestehen = [];
    if (ein.kAnzahl > 0) bestehen.push({ ok: ein.kOffen === 0, text: `Jedes Halbjahr ohne Note (k) ${aus ? 'lässt sich streichen' : 'wird gestrichen'} (${ein.kAnzahl - ein.kOffen} von ${ein.kAnzahl})` });
    if (abi) {
      const unter4 = pruefWerte.filter((p) => p !== null && p >= 1 && p <= 3).length;
      const null0 = pruefWerte.filter((p) => p === 0).length;
      bestehen.push({ ok: unter4 <= 2, text: `Höchstens 2 Prüfungsergebnisse mit 1–3 Punkten (aktuell ${unter4})` });
      bestehen.push({ ok: null0 === 0, text: `Keine Prüfung mit 0 Punkten (aktuell ${null0})` });
    } else {
      const pruefUnter4 = zaehleUnter4(pruefWerte);
      bestehen.push({ ok: pruefUnter4 <= 2, text: `Höchstens 2 Prüfungsergebnisse unter 4 Punkten (aktuell ${pruefUnter4}, 0 Punkte zählen doppelt)` });
    }
    bestehen.push({ ok: geUnter4 <= 2, text: `Höchstens 2 Gesamtergebnisse unter 4 Punkten${abi ? '' : ', fpA eingeschlossen'} (aktuell ${geUnter4}, 0 Punkte zählen doppelt)` });
    if (geUnter4 === 1) bestehen.push({ ok: E >= min1, text: `Bei einem Gesamtergebnis unter 4 Punkten mindestens ${min1} Punkte (aktuell ${punkteText(E)})` });
    if (geUnter4 === 2) bestehen.push({ ok: E >= min2, text: `Bei zwei Gesamtergebnissen unter 4 Punkten mindestens ${min2} Punkte (aktuell ${punkteText(E)})` });
    if (!abi && fpa.some((r) => r.null0)) bestehen.push({ ok: false, text: 'Fachpraktische Ausbildung bestanden' });
    if (abi && seminar.null0) bestehen.push({ ok: false, text: 'Seminar bestanden' });

    // Gesamturteil: k-Problem schlägt alles, dann unvollständig, dann die Regeln
    let ergebnis;
    if (ein.kOffen > 0) ergebnis = 'nicht bestanden';
    else if (!vollstaendig) ergebnis = 'unvollständig';
    else ergebnis = bestehen.every((b) => b.ok) ? 'bestanden' : 'nicht bestanden';
    // Ohne Streichen gibt es nie ein endgültiges Ergebnis
    if (aus && ergebnis !== 'unvollständig') ergebnis = `vorläufig ${ergebnis}`;

    return {
      art,
      E,
      M,
      Mgesamt,
      S: M > 0 ? durchschnitt(E, M) : null,
      vollstaendig,
      ergebnis,
      vorlaeufig: aus,
      zaehlbarHj,
      restMax,
      kandidaten: ein.kandidaten,
      eingebrachtAnzahl: eingebracht.length,
      anzahlHj,
      slotsGesamt: ein.slotsGesamt,
      slotsOffen: ein.slotsOffen,
      zuStreichen: ein.zuStreichen,
      kAnzahl: ein.kAnzahl,
      kOffen: ein.kOffen,
      tausch: ein.tausch,
      streichModus: modus,
      waehlbar: ein.waehlbar,
      gestrichenAnzahl: ein.kandidaten.filter((k) => k.gestrichen).length,
      festAnzahl: ein.festAnzahl,
      manuellAnzahl: ein.manuellAnzahl,
      faktor,
      pruefungen,
      fpa,
      fpaGesamt,
      seminar,
      zweiteFS,
      gesamtergebnisse,
      geUnter4,
      bestehen,
      hinweise,
      warnungen,
    };
  }

  /** Gespeicherten Modus lesen. Alt: 'manuell' => 'ein', 'auto' => 'aus'; fehlt er, gilt 'aus'. */
  function streichModusNormalisieren(m) {
    return m === 'ein' || m === 'manuell' ? 'ein' : 'aus';
  }

  /** Streichmodus einer Abschlussart ('aus' | 'ein'). */
  function streichModusVon(state, art) {
    return streichModusNormalisieren(state && state.streichModus && state.streichModus[art]);
  }

  const STREICH_ARTEN = ['fachabi', 'abitur'];
  function auswahlAus(g) {
    const res = {};
    if (g && typeof g === 'object' && !Array.isArray(g)) for (const [id, hj] of Object.entries(g)) if (typeof hj === 'string') res[id] = hj;
    return res;
  }
  function behaltenAus(g) {
    const res = {};
    if (g && typeof g === 'object' && !Array.isArray(g)) for (const [id, v] of Object.entries(g)) if (v === true) res[id] = true;
    return res;
  }

  /**
   * Streichfelder aus gespeicherten Daten oder einer Sicherung (Laden und Import).
   * 'auto' => 'aus', 'manuell' => 'ein' (Auswahl und behalten bleiben), fehlt => 'aus'.
   */
  function streichDatenNormalisieren(d) {
    const sm = (d && d.streichModus) || {};
    const gs = (d && d.gestrichen) || {};
    const bh = (d && d.behalten) || {};
    return {
      streichModus: Object.fromEntries(STREICH_ARTEN.map((a) => [a, streichModusNormalisieren(sm[a])])),
      gestrichen: Object.fromEntries(STREICH_ARTEN.map((a) => [a, auswahlAus(gs[a])])),
      behalten: Object.fromEntries(STREICH_ARTEN.map((a) => [a, behaltenAus(bh[a])])),
    };
  }

  /**
   * Der automatische Streichvorschlag als { fachId: hj } (ohne k-Halbjahre, die immer dazukommen):
   * Modus 'ein' ohne eigene Wahl und ohne zurückgeholte Fächer.
   */
  function autoAuswahl(state, art = 'fachabi') {
    const a = auswertung({
      ...state,
      streichModus: { ...(state.streichModus || {}), [art]: 'ein' },
      gestrichen: { ...(state.gestrichen || {}), [art]: {} },
      behalten: { ...(state.behalten || {}), [art]: {} },
    }, art);
    const res = {};
    for (const k of a.kandidaten) if (k.gestrichen && !k.k) res[k.fachId] = k.hj;
    return res;
  }

  function streichFelder(state, art) {
    state.streichModus = state.streichModus || {};
    state.gestrichen = state.gestrichen || {};
    state.behalten = state.behalten || {};
    state.gestrichen[art] = state.gestrichen[art] || {};
    state.behalten[art] = state.behalten[art] || {};
  }

  /**
   * Modus 'ein': Halbjahr antippen (ändert state). Gestrichenes Halbjahr (eigene Wahl oder automatisch
   * ergänzt) => zurückholen und Fach behalten. Ungestrichenes => streichen (im selben Fach wandert
   * die Streichung), Behalten des Fachs endet. Ergebnis: { geaendert, meldung }.
   */
  function streichTippen(state, art, fachId, hj) {
    streichFelder(state, art);
    const a = auswertung(state, art);
    if (a.streichModus !== 'ein' || !(a.waehlbar[fachId] || []).includes(hj)) return { geaendert: false, meldung: null };
    const auswahl = state.gestrichen[art];
    const behalten = state.behalten[art];
    const k = a.kandidaten.find((x) => x.fachId === fachId && x.hj === hj);
    if (k && k.gestrichen) {
      if (auswahl[fachId] === hj) delete auswahl[fachId];
      behalten[fachId] = true;
      return { geaendert: true, meldung: null };
    }
    const n = a.zuStreichen;
    const schonGewaehlt = a.kandidaten.some((x) => x.fachId === fachId && x.gestrichen && x.wahl === 'manuell');
    if (!schonGewaehlt) {
      if (!n) return { geaendert: false, meldung: 'Hier musst du kein Halbjahr streichen.' };
      if (a.festAnzahl >= n) return { geaendert: false, meldung: `Du hast schon ${n} ${n === 1 ? 'Halbjahr' : 'Halbjahre'} gestrichen. Tipp erst ein gestrichenes an, um es zurückzunehmen.` };
    }
    auswahl[fachId] = hj;
    delete behalten[fachId];
    return { geaendert: true, meldung: null };
  }

  /**
   * Modus setzen (ändert state): 'ein' oder 'aus'. Eigene Auswahl und zurückgeholte Fächer bleiben
   * in beiden Richtungen gespeichert (im Modus 'aus' wird trotzdem nichts gestrichen). Einträge
   * gelöschter Fächer fallen weg. Ohne eigene Auswahl zeigt 'ein' den automatischen Vorschlag.
   */
  function streichModusSetzen(state, art, modus) {
    streichFelder(state, art);
    const ids = new Set((state.faecher || []).map((f) => f.id));
    for (const feld of [state.gestrichen[art], state.behalten[art]]) for (const id of Object.keys(feld)) if (!ids.has(id)) delete feld[id];
    state.streichModus[art] = streichModusNormalisieren(modus);
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
    rundePunkte, runde2, gesamtergebnisRunden, toolRang, gesamtergebnis, istKeineNote, durchschnitt, notenstufe, noteAusPunkten, stufeAusPunkten, gewichteterSchnitt,
    halbjahr, halbjahreDesFachs, einbringbareHalbjahre, einbringbareHalbjahreAbitur,
    pruefungsergebnis, fpaHalbjahr, seminarErgebnis,
    auswertung, fachabitur, abitur, benoetigteSumme, naechsteNoteFuer,
    streichModusVon, streichModusNormalisieren, streichDatenNormalisieren, autoAuswahl, auswahlListe, streichTippen, streichModusSetzen,
  };
})();

if (typeof module !== 'undefined') module.exports = Calc;
