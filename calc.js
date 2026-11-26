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
 *    Gleichstand). Reihenfolge: k-Halbjahre, vom Nutzer erzwungene ("ja"), Rettung eines
 *    Gesamtergebnisses vor der Unterpunktung, sonst die niedrigsten Punkte. "nein" und
 *    Streichungen, die eine Unterpunktung erzeugen, kommen nur zum Zug, wenn es nötig ist.
 *  - "k" (keine Note möglich) muss gestrichen werden; mehr k als Streichungen => nicht bestanden.
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
  const streichWahl = (f, feld) => (f[feld] === 'ja' || f[feld] === 'nein' ? f[feld] : 'auto');

  /**
   * Einbringung und Streichvorschlag (in Anlehnung an das Streichvorschlag-Tool der FOS).
   * Gestrichen werden (slots - anzahl) Halbjahre, höchstens eins je Fach.
   * Kandidat je Fach: niedrigste HJL, bei Gleichstand das frühere Halbjahr; "k" immer zuerst.
   * Im Teilstand nur Fächer, deren einbringbare Halbjahre alle feststehen (k-Halbjahre immer).
   * Priorität: k > "ja" > Rettung vor Unterpunktung > automatisch (niedrigste Punkte)
   *   > Streichung, die eine Unterpunktung erzeugt/verschlimmert > "nein".
   * Rettungen und der Schutz vor neuen Unterpunktungen kosten unter Umständen Punkte. Wie das Tool
   * setzen wir sie nur so weit ein, wie es fürs Bestehen nötig ist: Von allen Varianten gewinnt die,
   * die besteht und die meisten Punkte bringt.
   * ctx: { pflicht(f, hj), faktor, apVon(f), streichFeld, bewerten(eHjl, geWerte) }
   */
  function einbringen(faecher, slotsVon, anzahl, ctx = {}) {
    const faktor = ctx.faktor || 3;
    const apVon = ctx.apVon || (() => null);
    const feld = ctx.streichFeld || 'streichen';
    const bewerten = ctx.bewerten || ((eHjl) => ({ besteht: true, geUnter4: 0, E: eHjl }));
    let slotsGesamt = 0;
    let slotsOffen = 0;
    const kandidaten = [];
    const proFach = [];
    faecher.forEach((f, index) => {
      const slots = slotsVon(f);
      if (!slots.length) return;
      const eigene = [];
      let komplett = true;
      for (const hj of slots) {
        slotsGesamt++;
        const r = halbjahr(f, hj);
        if (!r.k && r.punkte === null) { slotsOffen++; komplett = false; continue; }
        const k = { fachId: f.id, hj, punkte: r.k ? 0 : r.punkte, k: r.k, gestrichen: false, pflicht: !!(ctx.pflicht && ctx.pflicht(f, hj)) };
        kandidaten.push(k);
        eigene.push(k);
      }
      proFach.push({ f, index, eigene, komplett, ap: apVon(f), wahl: streichWahl(f, feld) });
    });
    const zuStreichen = Math.max(0, slotsGesamt - anzahl);

    // Eine Option je Fach
    const optionen = [];
    for (const p of proFach) {
      const moeglich = p.eigene.filter((k) => !k.pflicht);
      if (!moeglich.length) continue;
      let kand = moeglich[0];
      const schluessel = (k) => (k.k ? -1 : k.punkte);
      for (const k of moeglich) if (schluessel(k) < schluessel(kand)) kand = k;
      if (!p.komplett && !kand.k) continue;
      const ohne = gesamtergebnis(p.eigene.map((k) => k.punkte), p.ap, faktor);
      const mit = gesamtergebnis(p.eigene.filter((k) => k !== kand).map((k) => k.punkte), p.ap, faktor);
      optionen.push({
        kand, p, ohne, mit,
        gewinn: (mit.roh ?? 0) - (ohne.roh ?? 0),
        rettung: p.wahl === 'auto' && !kand.k && ohne.punkte !== null && ohne.punkte < 4 && mit.punkte !== null && mit.punkte >= 4,
        gefahr: p.wahl === 'auto' && !kand.k && unterpunktung(mit.punkte) > unterpunktung(ohne.punkte),
      });
    }
    const vergleich = (a, b) => a.kand.punkte - b.kand.punkte || b.gewinn - a.gewinn || (a.ohne.roh ?? 99) - (b.ohne.roh ?? 99) || a.p.index - b.p.index;
    const rettungen = optionen.filter((o) => o.rettung).sort(vergleich);

    function auswahl(anzahlRettungen, schutz) {
      const gerettet = new Set(rettungen.slice(0, anzahlRettungen));
      const stufe = (o) => (o.kand.k ? 0 : o.p.wahl === 'ja' ? 1 : gerettet.has(o) ? 2 : o.p.wahl === 'nein' ? 5 : schutz && o.gefahr ? 4 : 3);
      return optionen.slice().sort((a, b) => stufe(a) - stufe(b) || vergleich(a, b)).slice(0, zuStreichen);
    }

    function auswerten(gewaehlt) {
      const weg = new Set(gewaehlt.map((o) => o.kand));
      let eHjl = 0;
      for (const k of kandidaten) if (!weg.has(k)) eHjl += k.punkte;
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
    for (const o of gewaehlt) o.kand.gestrichen = true;

    const hinweise = [];
    const name = (p) => p.f.name || 'Fach';
    for (const o of optionen) {
      if (o.p.wahl === 'nein' && o.kand.gestrichen) hinweise.push(`${name(o.p)} ist auf „nicht streichen“ gestellt, musste aber gestrichen werden, weil sonst zu wenige Halbjahre wegfallen.`);
      if (o.p.wahl === 'ja' && !o.kand.gestrichen) hinweise.push(`${name(o.p)} soll gestrichen werden, aber es sind schon alle ${zuStreichen} Streichungen vergeben.`);
    }
    for (const p of proFach) {
      if (p.wahl === 'ja' && !optionen.some((o) => o.p === p) && p.eigene.length) hinweise.push(`${name(p)} wird erst gestrichen, wenn alle Halbjahre des Fachs feststehen.`);
    }
    const kAnzahl = kandidaten.filter((k) => k.k).length;
    const kOffen = kandidaten.filter((k) => k.k && !k.gestrichen).length;

    // Gesamtergebnisoptimierter Vorschlag: Tausch einer Streichung, der ein Gesamtergebnis um
    // eine Notenstufe verbessert, ohne den Schnitt zu senken oder das Bestehen zu gefährden.
    const tausch = [];
    if (slotsOffen === 0 && ctx.schnitt && beste) {
      let aktuell = gewaehlt.slice();
      let aktW = beste.w;
      const sStart = ctx.schnitt(aktW.E);
      for (let runde = 0; runde < 5; runde++) {
        let bester = null;
        for (const raus of aktuell) {
          if (raus.kand.k || raus.p.wahl === 'ja') continue;
          for (const rein of optionen) {
            if (aktuell.includes(rein) || rein.p.wahl === 'nein' || rein.kand.k) continue;
            const neu = aktuell.filter((o) => o !== raus).concat([rein]);
            const w = auswerten(neu);
            if (ctx.schnitt(w.E) !== sStart || (aktW.besteht && !w.besteht)) continue;
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

    return { kandidaten, slotsGesamt, slotsOffen, zuStreichen, faecherMitSlots: proFach.length, kAnzahl, kOffen, hinweise, tausch };
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
    const ein = einbringen(faecher, slotsVon, anzahlHj, {
      pflicht: fsPflicht,
      faktor,
      apVon: (f) => pruefungsergebnis(f, art),
      streichFeld: abi ? 'streichenAbi' : 'streichen',
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

    const eingebracht = ein.kandidaten.filter((k) => !k.gestrichen);
    const eHjl = eingebracht.reduce((s, k) => s + k.punkte, 0);
    const E = Erest + eHjl;
    M += eingebracht.length * 15;
    restMax += Math.max(0, anzahlHj - eingebracht.length) * 15;

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
      ein.slotsOffen === 0 && ein.slotsGesamt >= anzahlHj && eingebracht.length === anzahlHj &&
      pruefungsfaecher.length === 4 && pruefungen.every((p) => p.punkte !== null) &&
      (abi ? seminar.punkte !== null && (!zweiteFS || zweiteFS.punkte.every((w) => w !== null)) : fpa.every((r) => r.punkte !== null) && !englischMuendlichFehlt);

    const bestehen = [];
    if (ein.kAnzahl > 0) bestehen.push({ ok: ein.kOffen === 0, text: `Jedes Halbjahr ohne Note (k) wird gestrichen (${ein.kAnzahl - ein.kOffen} von ${ein.kAnzahl})` });
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
    if (geUnter4 === 1) bestehen.push({ ok: E >= min1, text: `Bei einem Gesamtergebnis unter 4 Punkten mindestens ${min1} Punkte (aktuell ${E})` });
    if (geUnter4 === 2) bestehen.push({ ok: E >= min2, text: `Bei zwei Gesamtergebnissen unter 4 Punkten mindestens ${min2} Punkte (aktuell ${E})` });
    if (!abi && fpa.some((r) => r.null0)) bestehen.push({ ok: false, text: 'Fachpraktische Ausbildung bestanden' });
    if (abi && seminar.null0) bestehen.push({ ok: false, text: 'Seminar bestanden' });

    // Gesamturteil: k-Problem schlägt alles, dann unvollständig, dann die Regeln
    let ergebnis;
    if (ein.kOffen > 0) ergebnis = 'nicht bestanden';
    else if (!vollstaendig) ergebnis = 'unvollständig';
    else ergebnis = bestehen.every((b) => b.ok) ? 'bestanden' : 'nicht bestanden';

    return {
      art,
      E,
      M,
      Mgesamt,
      S: M > 0 ? durchschnitt(E, M) : null,
      vollstaendig,
      ergebnis,
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
    rundePunkte, runde2, gesamtergebnisRunden, gesamtergebnis, istKeineNote, durchschnitt, notenstufe, noteAusPunkten, stufeAusPunkten, gewichteterSchnitt,
    halbjahr, halbjahreDesFachs, einbringbareHalbjahre, einbringbareHalbjahreAbitur,
    pruefungsergebnis, fpaHalbjahr, seminarErgebnis,
    auswertung, fachabitur, abitur, benoetigteSumme, naechsteNoteFuer,
  };
})();

if (typeof module !== 'undefined') module.exports = Calc;
