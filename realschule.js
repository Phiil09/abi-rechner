/*
 * Rechenlogik Realschule Bayern und freies Notensystem („andere Schule“).
 * Rechtsgrundlage: RSO, Fassung ab 01.08.2026. Der Wortlaut wurde nur über Zusammenfassungen
 * gelesen. Alles hier ist vorläufig, ohne Gewähr.
 *
 *  Notenskala   Noten 1–6 (Realschule fest) oder Punkte 15–0 (nur „andere Schule“).
 *  Tendenzen    2+ / 2− sind gängige Praxis, gesetzlich nicht geregelt. Einstellung: aus, ±0,25
 *               (Standard, 2− = 2,25) oder ±0,33 (2− = 2,33). Werte bleiben in 1 bis 6.
 *  § 23 Abs. 2  Jahresfortgangsnote: Schulaufgaben (und Kurzarbeit/Test statt Schulaufgabe) zählen
 *               doppelt, kleine Leistungsnachweise einfach: Σ(Gewicht × Note) / Σ Gewicht.
 *               Jede Note kann ein eigenes Gewicht haben (überschreibt den Standard der Notenart).
 *               Vorlagen: „doppelt“ (Standard), „gleich“ (alle ×1), „prozent“ (Schulaufgaben X %,
 *               kleine 100 − X %, wie der Modus „anteil“ je Fach), „eigen“ (Gewichte je Notenart).
 *  Zeitraum     Schlüssel '10_1' (1. Halbjahr = Zwischenzeugnis), '10_2' (2. Halbjahr) und
 *               '10_J' (ganzes Jahr = Jahreszeugnis). Noten tragen hj '10_1' oder '10_2'.
 *  Rundung      Die Zeugnisnote legt die Lehrkraft fest (§ 23 RSO), es gibt keine feste Regel.
 *               Die App rundet erst auf zwei Nachkommastellen, dann auf eine ganze Note:
 *               'schlechter' (Standard bei Noten): bis ,49 die bessere, ab ,50 die schlechtere Note;
 *               'besser': ab ,50 die bessere Note (bei Punkten der Standard: ab ,5 aufrunden).
 *  § 24–27      Vorrücken (Jgst. 5–9): gefährdet bei einer 6 oder zwei 5 in Vorrückungsfächern
 *               (Jahresnoten, gerundet wie oben). Kunst, Musik, Sport, Werken, Textiles Gestalten
 *               sind keine Vorrückungsfächer, außer als Wahlpflichtfach der Gruppe III.
 *  § 35–36      Prüfungsnote (ungerundet): nur schriftlich P = W; mit mündlicher P = (2W + O) / 3;
 *               praktisches Fach P = (W + Pr) / 2; beides P = (2 × (W + Pr) / 2 + O) / 3.
 *  § 39 Abs. 2  Gesamtnote im Prüfungsfach: die Prüfungsnote, gerundet nach Einstellung
 *               („im Allgemeinen gibt die Prüfungsnote den Ausschlag“). Ohne Prüfung: Jahresnote.
 *  § 39 Abs. 4, § 40  Bestehen: nicht bestanden bei einer 6 in Deutsch, sonst bei einer 6 in einem
 *               oder einer 5 in zwei Vorrückungsfächern, außer der Notenausgleich greift: eine 1,
 *               zwei 2 oder vier 3 in anderen Vorrückungsfächern (die App zählt bessere Noten mit,
 *               z. B. 2, 3, 3, 3 = vier 3 oder besser). Kein Ausgleich bei einer 6 in Deutsch oder
 *               bei einer weiteren 5 oder 6 (z. B. 6 und 5, drei 5).
 *  FOS-Info     Schnitt der Gesamtnoten in Deutsch, Englisch, Mathematik; 3,5 oder besser reicht.
 */
const Realschule = (function () {
  'use strict';

  const EPS = 1e-9;
  const istZahl = (v) => typeof v === 'number' && Number.isFinite(v);
  const zahl = (v) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const grenzen = (x, min, max) => Math.min(max, Math.max(min, x));
  const schluessel = (s) => String(s || '').toLowerCase().replace(/[^a-zäöüß]/g, '');

  // ---------- Notenarten und Notensystem ----------
  const NOTENARTEN = [
    { id: 'sa', name: 'Schulaufgabe', gross: true },
    { id: 'ersatz', name: 'Kurzarbeit/Test statt Schulaufgabe', gross: true },
    { id: 'stegreif', name: 'Stegreifaufgabe' },
    { id: 'kurzarbeit', name: 'Kurzarbeit' },
    { id: 'test', name: 'Fachlicher Leistungstest' },
    { id: 'muendlich', name: 'Rechenschaftsablage (mündlich)' },
    { id: 'referat', name: 'Referat' },
    { id: 'beitrag', name: 'Unterrichtsbeitrag' },
    { id: 'praktisch', name: 'Praktische Leistung' },
    { id: 'sonstiges', name: 'Sonstiges' },
  ];
  const ART = Object.fromEntries(NOTENARTEN.map((a) => [a.id, a]));
  /** Große Leistungsnachweise: Schulaufgabe und Ersatz (Kurzarbeit/Test statt Schulaufgabe). */
  const istGross = (art) => !!(ART[art] && ART[art].gross);

  const GEWICHTUNGEN = [
    { id: 'doppelt', name: 'Schulaufgaben doppelt (Realschule Bayern)' },
    { id: 'gleich', name: 'Alle gleich (1:1)' },
    { id: 'prozent', name: 'Prozent: Schulaufgaben / kleine Noten' },
    { id: 'eigen', name: 'Eigene Gewichte je Notenart' },
  ];
  const TENDENZEN = [0, 0.25, 0.33];
  const STANDARD_GEWICHTE = Object.fromEntries(NOTENARTEN.map((a) => [a.id, a.gross ? 2 : 1]));

  function standardSystem() {
    return { skala: 'noten', gewichtung: 'doppelt', saAnteil: 50, gewichte: { ...STANDARD_GEWICHTE }, tendenz: 0.25, rundung: 'schlechter' };
  }

  /** Einstellung „Notensystem der Schule“ mit Standardwerten auffüllen. Rundung fehlt => Standard der Skala. */
  function systemNormalisieren(s) {
    const d = s && typeof s === 'object' ? s : {};
    const n = standardSystem();
    const skala = d.skala === 'punkte' ? 'punkte' : 'noten';
    const gewichte = { ...n.gewichte };
    if (d.gewichte && typeof d.gewichte === 'object') {
      for (const [k, v] of Object.entries(d.gewichte)) { const g = zahl(v); if (g !== null && g > 0) gewichte[k] = g; }
    }
    const t = d.tendenz === null || d.tendenz === undefined || d.tendenz === '' ? null : Number(d.tendenz);
    const anteil = zahl(d.saAnteil);
    return {
      skala,
      gewichtung: GEWICHTUNGEN.some((g) => g.id === d.gewichtung) ? d.gewichtung : n.gewichtung,
      saAnteil: anteil === null ? 50 : grenzen(anteil, 0, 100),
      gewichte,
      tendenz: TENDENZEN.includes(t) ? t : n.tendenz,
      rundung: d.rundung === 'besser' || d.rundung === 'schlechter' ? d.rundung : skala === 'punkte' ? 'besser' : 'schlechter',
    };
  }

  // ---------- Noten mit Tendenz ----------
  const NOTE_RE = /^([1-6])\s*([+\-−–]?)$/;
  const DEZIMAL_RE = /^\d+(?:[.,]\d+)?$/;
  const NOTENSTUFEN = { 1: 'sehr gut', 2: 'gut', 3: 'befriedigend', 4: 'ausreichend', 5: 'mangelhaft', 6: 'ungenügend' };
  // Von schlecht nach gut (für „Was brauche ich?“). 1+ und 6− gibt es nicht.
  const LABELS_MIT_TENDENZ = ['6', '5-', '5', '5+', '4-', '4', '4+', '3-', '3', '3+', '2-', '2', '2+', '1-', '1'];
  const LABELS_GANZ = ['6', '5', '4', '3', '2', '1'];

  /** Einheitliche Schreibweise: '2', '2-', '2+' oder eine Dezimalnote wie '2.5'. null bei ungültiger Eingabe. */
  function noteLabel(eingabe) {
    if (istZahl(eingabe)) return eingabe >= 1 && eingabe <= 6 ? String(eingabe) : null;
    if (typeof eingabe !== 'string') return null;
    const t = eingabe.trim();
    const m = NOTE_RE.exec(t);
    if (m) return m[1] + (m[2] === '+' ? '+' : m[2] ? '-' : '');
    if (DEZIMAL_RE.test(t)) {
      const n = Number(t.replace(',', '.'));
      return n >= 1 && n <= 6 ? String(n) : null;
    }
    return null;
  }

  /** Zahlenwert einer Note. tendenz: 0 (aus), 0,25 oder 0,33. 2− = 2 + t, 2+ = 2 − t, begrenzt auf 1 bis 6. */
  function noteWert(eingabe, tendenz = 0.25) {
    const l = noteLabel(eingabe);
    if (l === null) return null;
    const t = istZahl(Number(tendenz)) ? Number(tendenz) : 0;
    const z = l.slice(-1);
    if (z === '+' || z === '-') return grenzen(Number(l.slice(0, -1)) + (z === '-' ? t : -t), 1, 6);
    return Number(l);
  }

  /** Anzeige mit echtem Minus und Komma: '2-' => '2−', '2.5' => '2,5'. */
  function anzeige(label) {
    if (label === null || label === undefined) return '–';
    return String(label).replace('-', '−').replace('.', ',');
  }

  /** Ganze Notenstufe einer Note (Tendenzen zusammengefasst): '2-' => 2. */
  function notenStufe(label) {
    const l = noteLabel(label);
    if (l === null) return null;
    const z = l.slice(-1);
    if (z === '+' || z === '-') return Number(l.slice(0, -1));
    return grenzen(Math.floor(Number(l) + 0.5), 1, 6);
  }

  const NOTE_AUS_PUNKTEN = ['6', '5-', '5', '5+', '4-', '4', '4+', '3-', '3', '3+', '2-', '2', '2+', '1-', '1', '1+'];
  function noteAusPunkten(p) {
    return istZahl(p) && p >= 0 && p <= 15 ? NOTE_AUS_PUNKTEN[Math.round(p)] : null;
  }
  /** Punkte einer Note mit Tendenz: 1 = 14, 2− = 10, 2+ = 12, 6 = 0. */
  function punkteAusNote(label) {
    const l = noteLabel(label);
    if (l === null) return null;
    const z = l.slice(-1);
    if (z === '+' || z === '-') return grenzen(17 - 3 * Number(l.slice(0, -1)) + (z === '+' ? 1 : -1), 0, 15);
    return grenzen(Math.round(17 - 3 * Number(l)), 0, 15);
  }
  function stufeAusPunkten(p) {
    if (!istZahl(p)) return null;
    if (p >= 13) return 1;
    if (p >= 10) return 2;
    if (p >= 7) return 3;
    if (p >= 4) return 4;
    if (p >= 1) return 5;
    return 6;
  }

  /** Wert einer gespeicherten Note in der Skala des Systems (n.note bei Noten, n.punkte bei Punkten). */
  function notenWert(n, system) {
    if (!n) return null;
    const s = systemNormalisieren(system);
    if (s.skala === 'punkte') return istZahl(n.punkte) && n.punkte >= 0 && n.punkte <= 15 ? n.punkte : null;
    return noteWert(n.note, s.tendenz);
  }

  /** Notenstufe 1–6 einer gespeicherten Note (für die Statistik). */
  function stufeDerNote(n, system) {
    const s = systemNormalisieren(system);
    return s.skala === 'punkte' ? stufeAusPunkten(notenWert(n, s)) : notenStufe(n && n.note);
  }

  // ---------- Rundung ----------
  const zweiStellen = (x) => (istZahl(x) ? Math.round(x * 100 + 1e-6) / 100 : null);

  /** Ganze Note (bzw. ganze Punkte) nach der Einstellung „Rundung“, über zwei Nachkommastellen. */
  function runden(wert, system) {
    if (!istZahl(wert)) return null;
    const s = systemNormalisieren(system);
    const x = zweiStellen(wert);
    const besser = s.rundung === 'besser';
    if (s.skala === 'punkte') return grenzen(besser ? Math.floor(x + 0.5 + EPS) : Math.ceil(x - 0.5 - EPS), 0, 15);
    return grenzen(besser ? Math.ceil(x - 0.5 - EPS) : Math.floor(x + 0.5 + EPS), 1, 6);
  }

  // ---------- Gewichte ----------
  /** Standardgewicht einer Notenart nach der Vorlage im Notensystem. */
  function standardGewicht(art, system) {
    const s = systemNormalisieren(system);
    const gross = istGross(art);
    if (s.gewichtung === 'gleich' || s.gewichtung === 'prozent') return 1;
    if (s.gewichtung === 'eigen') {
      const g = s.gewichte[art];
      return istZahl(g) && g > 0 ? g : gross ? 2 : 1;
    }
    return gross ? 2 : 1;
  }
  /** Eigenes Gewicht der Note oder null (dann gilt der Standard der Notenart). */
  const eigenesGewicht = (n) => (n && istZahl(n.gewicht) && n.gewicht > 0 ? n.gewicht : null);
  const gewichtDerNote = (n, system) => eigenesGewicht(n) ?? standardGewicht(n.art, system);

  // ---------- Zeiträume ----------
  function zeitraeume(klasse) {
    const k = String(klasse);
    return [`${k}_1`, `${k}_2`, `${k}_J`];
  }
  function zeitraumTeile(z) {
    const [klasse, teil] = String(z || '').split('_');
    return { klasse, teil: teil === '1' || teil === '2' ? teil : 'J' };
  }
  function zeitraumLabel(z, lang = false, mitKlasse = false) {
    const { klasse, teil } = zeitraumTeile(z);
    const t = teil === 'J' ? (lang ? 'ganzes Jahr' : 'Jahr') : `${teil}. ${lang ? 'Halbjahr' : 'Hj'}`;
    return mitKlasse ? `Kl. ${klasse} · ${t}` : t;
  }
  function zeugnisName(z) {
    const { teil } = zeitraumTeile(z);
    return teil === '1' ? 'Zwischenzeugnis' : teil === '2' ? '2. Halbjahr' : 'Jahreszeugnis';
  }
  function jahrgaengeDesFachs(fach) {
    const jg = (fach && fach.jahrgaenge) || {};
    return Object.keys(jg).filter((k) => jg[k]).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  }
  const unterrichtetIn = (fach, klasse) => !!(fach && fach.jahrgaenge && fach.jahrgaenge[String(klasse)]);
  const halbjahreDesFachs = (fach) => jahrgaengeDesFachs(fach).flatMap((k) => [`${k}_1`, `${k}_2`]);

  /** Noten eines Zeitraums: '_1' und '_2' je Halbjahr, '_J' beide Halbjahre. */
  function notenImZeitraum(fach, z) {
    const { klasse, teil } = zeitraumTeile(z);
    const hjs = teil === 'J' ? [`${klasse}_1`, `${klasse}_2`] : [`${klasse}_${teil}`];
    return ((fach && fach.noten) || []).filter((n) => hjs.includes(n.hj));
  }

  // ---------- Jahresfortgangsnote ----------
  /**
   * Note eines Fachs in einem Zeitraum (Zwischenzeugnis, 2. Halbjahr oder Jahreszeugnis).
   * roh: ungerundeter Schnitt, berechnet: gerundet, wert: Zeugniswert oder berechnet.
   * teile: [{ gewicht, wert, gross }] in Anzeigereihenfolge (Schulaufgaben zuerst, dann nach Datum).
   * Fach-Modus 'anteil' (eigene Prozent-Aufteilung) geht vor der Vorlage im Notensystem.
   */
  function jahresnote(fach, z, system) {
    const s = systemNormalisieren(system);
    const sortiert = notenImZeitraum(fach, z).slice().sort((a, b) => (istGross(b.art) - istGross(a.art)) || String(a.datum || '').localeCompare(String(b.datum || '')));
    const liste = sortiert.map((n) => ({ n, v: notenWert(n, s), gross: istGross(n.art) })).filter((x) => x.v !== null);
    const gross = liste.filter((x) => x.gross);
    const klein = liste.filter((x) => !x.gross);
    const g = (fach && fach.gewichtung) || {};
    const anteil = g.modus === 'anteil' ? grenzen(zahl(g.saAnteil) ?? 50, 0, 100) : s.gewichtung === 'prozent' ? s.saAnteil : null;
    const schnitt = (xs, wf) => {
      let su = 0;
      let ge = 0;
      for (const x of xs) { const w = wf(x); su += w * x.v; ge += w; }
      return ge > 0 ? su / ge : null;
    };

    let roh = null;
    let wf;
    if (anteil !== null) {
      wf = (x) => eigenesGewicht(x.n) ?? 1;
      const sa = schnitt(gross, wf);
      const kl = schnitt(klein, wf);
      roh = sa !== null && kl !== null ? (anteil / 100) * sa + (1 - anteil / 100) * kl : sa ?? kl;
    } else {
      wf = (x) => gewichtDerNote(x.n, s);
      roh = schnitt(liste, wf);
    }
    const teile = liste.map((x) => ({ gewicht: wf(x), wert: x.v, gross: x.gross }));
    const berechnet = runden(roh, s);
    let zeugnis = zahl(fach && fach.zeugnis ? fach.zeugnis[z] : null);
    if (zeugnis !== null && !(s.skala === 'punkte' ? zeugnis >= 0 && zeugnis <= 15 : zeugnis >= 1 && zeugnis <= 6)) zeugnis = null;
    return {
      roh,
      schnitt: zweiStellen(roh),
      berechnet,
      wert: zeugnis ?? berechnet,
      quelle: zeugnis !== null ? 'zeugnis' : berechnet !== null ? 'noten' : null,
      anteil,
      saSchnitt: schnitt(gross, wf),
      kleinSchnitt: schnitt(klein, wf),
      teile,
      nenner: anteil === null ? teile.reduce((a, t) => a + t.gewicht, 0) : null,
      anzahl: liste.length,
      anzahlGross: gross.length,
      anzahlKlein: klein.length,
    };
  }

  /**
   * „Was brauche ich?“: die schlechteste nächste Note, mit der die gerundete Zeugnisnote im Zeitraum z
   * das Ziel erreicht. Ergebnis { wert, sicher } (wert: Label wie '3-' bzw. Punkte) oder null (nicht erreichbar).
   * sicher: Auch die schlechteste Note reicht.
   */
  function naechsteNoteFuer(fach, z, ziel, art, system, gewicht = null) {
    const s = systemNormalisieren(system);
    const { klasse, teil } = zeitraumTeile(z);
    const hj = `${klasse}_${teil === '1' ? 1 : 2}`;
    const punkte = s.skala === 'punkte';
    const kandidaten = punkte ? Array.from({ length: 16 }, (_, i) => i) : s.tendenz ? LABELS_MIT_TENDENZ : LABELS_GANZ;
    for (let i = 0; i < kandidaten.length; i++) {
      const c = kandidaten[i];
      const neu = { hj, art, gewicht, ...(punkte ? { punkte: c } : { note: c }) };
      const r = jahresnote({ ...fach, zeugnis: {}, noten: ((fach && fach.noten) || []).concat([neu]) }, z, s);
      if (r.berechnet !== null && (punkte ? r.berechnet >= ziel : r.berechnet <= ziel)) return { wert: c, sicher: i === 0 };
    }
    return null;
  }

  // ---------- Vorrücken (Klasse 5–9) ----------
  const NICHT_VORRUECKUNG = ['kunst', 'musik', 'sport', 'werken', 'textilesgestalten'];
  const istDeutsch = (name) => /^deutsch/i.test(String(name || '').trim());

  /** Standard nach Namen: Kunst, Musik, Sport, Werken, Textiles Gestalten nicht, außer als Wahlpflichtfach der Gruppe III. */
  function vorrueckungsfachNachName(name, gruppe, wpf) {
    if (wpf && String(gruppe || '').startsWith('III')) return true;
    const teile = String(name || '').split('/').map(schluessel).filter(Boolean);
    if (!teile.length) return true;
    return !teile.every((t) => NICHT_VORRUECKUNG.some((x) => t.startsWith(x)));
  }
  /** Flag fach.vorrueckungsfach (im Fach-Dialog änderbar), sonst der Standard nach Namen. */
  function istVorrueckungsfach(fach, gruppe) {
    if (fach && typeof fach.vorrueckungsfach === 'boolean') return fach.vorrueckungsfach;
    return vorrueckungsfachNachName(fach && fach.name, gruppe, fach && fach.wpf);
  }

  const ganzeNote = (x) => (istZahl(x) ? Math.round(x) : null);

  /**
   * Vorrücken nach den Jahresnoten der Klasse. gefaehrdet: eine 6 oder zwei 5 in Vorrückungsfächern.
   * probe: Vorrücken auf Probe denkbar (§ 26, Jgst. 5–9); nachpruefung: Nachprüfung denkbar
   * (§ 27, Jgst. 7–9, nicht bei einer 6 in Deutsch).
   */
  function vorruecken(faecher, klasse, system, gruppe) {
    const s = systemNormalisieren(system);
    const k = String(klasse);
    const liste = (faecher || []).filter((f) => unterrichtetIn(f, k)).map((f) => ({
      fachId: f.id, name: f.name, vorrueckungsfach: istVorrueckungsfach(f, gruppe), note: jahresnote(f, `${k}_J`, s).wert,
    }));
    const relevant = liste.filter((x) => x.vorrueckungsfach);
    const sechser = relevant.filter((x) => ganzeNote(x.note) === 6).map((x) => x.name);
    const fuenfer = relevant.filter((x) => ganzeNote(x.note) === 5).map((x) => x.name);
    const fehlend = relevant.filter((x) => x.note === null).map((x) => x.name);
    const gefaehrdet = sechser.length > 0 || fuenfer.length >= 2;
    const deutsch6 = relevant.some((x) => istDeutsch(x.name) && ganzeNote(x.note) === 6);
    const kn = Number(k);
    return {
      status: gefaehrdet ? 'gefaehrdet' : relevant.length > fehlend.length ? 'ok' : 'leer',
      gefaehrdet,
      sechser,
      fuenfer,
      fehlend,
      vollstaendig: fehlend.length === 0,
      liste,
      deutsch6,
      probe: kn >= 5 && kn <= 9,
      nachpruefung: kn >= 7 && kn <= 9 && !deutsch6,
    };
  }

  // ---------- Realschulabschluss (Klasse 10) ----------
  const pruefNote = (v) => {
    const n = zahl(v);
    return n !== null && n >= 1 && n <= 6 ? n : null;
  };

  /**
   * Prüfungsnote P (ungerundet) aus schriftlich W, mündlich O, praktisch Pr.
   * vollstaendig: false, wenn im praktischen Fach die praktische Prüfung fehlt.
   */
  function pruefungsnote(pr, praktisch = false) {
    const p = pr || {};
    const W = pruefNote(p.schriftlich);
    const O = pruefNote(p.muendlich);
    const Pr = pruefNote(p.praktisch);
    if (W === null) return { wert: null, vollstaendig: false };
    let basis = W;
    let vollstaendig = true;
    if (praktisch) {
      if (Pr !== null) basis = (W + Pr) / 2;
      else vollstaendig = false;
    }
    return { wert: O !== null ? (2 * basis + O) / 3 : basis, vollstaendig };
  }

  /**
   * Gesamtnote eines Fachs der 10. Klasse. Prüfungsfach: Prüfungsnote, gerundet (J daneben).
   * Ohne Prüfung bzw. solange sie fehlt: Jahresfortgangsnote J.
   * muendlichMoeglich: |J − P| ≥ 0,5 und noch keine mündliche Prüfung (freiwillige mündliche Prüfung).
   */
  function gesamtnote(fach, system, klasse = 10) {
    const s = systemNormalisieren(system);
    const j = jahresnote(fach, `${klasse}_J`, s);
    const basis = { fachId: fach.id, name: fach.name, J: j.wert, Jroh: j.roh, pruefungsfach: !!fach.pruefungsfach, praktisch: !!fach.praktischePruefung };
    if (!fach.pruefungsfach) return { ...basis, P: null, Pnote: null, note: j.wert, quelle: j.wert === null ? null : 'jahr', pruefungFehlt: false };
    const pr = fach.pruefung || {};
    const p = pruefungsnote(pr, !!fach.praktischePruefung);
    if (p.wert === null) return { ...basis, P: null, Pnote: null, note: j.wert, quelle: j.wert === null ? null : 'jahr', pruefungFehlt: true };
    const Pnote = runden(p.wert, s);
    return {
      ...basis,
      P: p.wert,
      Pnote,
      note: Pnote,
      quelle: 'pruefung',
      pruefungFehlt: false,
      pruefungVollstaendig: p.vollstaendig,
      muendlichMoeglich: pruefNote(pr.muendlich) === null && j.wert !== null && Math.abs(j.wert - p.wert) >= 0.5 - EPS,
    };
  }

  /**
   * Bestehen (§ 39 Abs. 4, § 40). liste: [{ name, note, vorrueckungsfach }] mit ganzen Gesamtnoten.
   * ergebnis: 'bestanden' | 'ausgleich' (bestanden durch Notenausgleich) | 'nicht'.
   */
  function bestehen(liste) {
    const vf = (liste || []).filter((x) => x.vorrueckungsfach);
    const mitNote = vf.filter((x) => istZahl(x.note));
    const fehlend = vf.filter((x) => !istZahl(x.note)).map((x) => x.name);
    const deutsch6 = (liste || []).some((x) => istDeutsch(x.name) && ganzeNote(x.note) === 6);
    const sechser = mitNote.filter((x) => ganzeNote(x.note) === 6).map((x) => x.name);
    const fuenfer = mitNote.filter((x) => ganzeNote(x.note) === 5).map((x) => x.name);
    const res = { ergebnis: 'bestanden', anzahl: mitNote.length, vollstaendig: fehlend.length === 0, fehlend, sechser, fuenfer, deutsch6, ausgleichNoetig: false, ausgleich: null, grund: '' };
    if (deutsch6) return { ...res, ergebnis: 'nicht', grund: 'Note 6 in Deutsch: Ein Notenausgleich ist nicht möglich.' };
    if (!sechser.length && fuenfer.length <= 1) return res;
    res.ausgleichNoetig = true;
    const ausgleichbar = (sechser.length === 1 && fuenfer.length === 0) || (sechser.length === 0 && fuenfer.length === 2);
    if (!ausgleichbar) return { ...res, ergebnis: 'nicht', grund: 'Zu viele 5 und 6: Ein Notenausgleich ist nicht möglich.' };
    const andere = mitNote.map((x) => ganzeNote(x.note)).filter((n) => n <= 4);
    let ausgleich = null;
    if (andere.filter((n) => n === 1).length >= 1) ausgleich = 'eine 1';
    else if (andere.filter((n) => n <= 2).length >= 2) ausgleich = 'zwei 2';
    else if (andere.filter((n) => n <= 3).length >= 4) ausgleich = 'vier 3';
    return ausgleich
      ? { ...res, ergebnis: 'ausgleich', ausgleich }
      : { ...res, ergebnis: 'nicht', grund: 'Für den Notenausgleich fehlt eine 1, zwei 2 oder vier 3 in anderen Vorrückungsfächern.' };
  }

  /** FOS-Info: Schnitt der Gesamtnoten in Deutsch, Englisch und Mathematik. ok: 3,5 oder besser. */
  function demSchnitt(liste) {
    const finde = (re) => (liste || []).find((x) => re.test(String(x.name || '').trim()));
    const teile = [finde(/^deutsch/i), finde(/^englisch/i), finde(/^mathe/i)].map((x) => (x && istZahl(x.note) ? x.note : null));
    const da = teile.filter(istZahl);
    const schnitt = da.length ? da.reduce((a, b) => a + b, 0) / da.length : null;
    return { deutsch: teile[0], englisch: teile[1], mathematik: teile[2], schnitt, vollstaendig: da.length === 3, ok: schnitt !== null && schnitt <= 3.5 + EPS };
  }

  /** Auswertung der 10. Klasse: Gesamtnoten, Bestehen, D/E/M-Info und Info-Schnitt (steht nicht im Zeugnis). */
  function abschluss(faecher, system, gruppe, klasse = 10) {
    const s = systemNormalisieren(system);
    const liste = (faecher || []).filter((f) => unterrichtetIn(f, klasse)).map((f) => ({ ...gesamtnote(f, s, klasse), vorrueckungsfach: istVorrueckungsfach(f, gruppe) }));
    const mitNote = liste.filter((x) => istZahl(x.note));
    return {
      liste,
      bestehen: bestehen(liste),
      dem: demSchnitt(liste),
      infoSchnitt: mitNote.length ? mitNote.reduce((a, x) => a + x.note, 0) / mitNote.length : null,
      pruefungFehlt: liste.filter((x) => x.pruefungsfach && x.pruefungFehlt).map((x) => x.name),
    };
  }

  // ---------- Fächer-Vorlagen (unverifiziert, alles editierbar) ----------
  const GRUPPEN = [
    { id: 'I', name: 'I: Mathematik, Naturwissenschaften, Technik' },
    { id: 'II', name: 'II: Wirtschaft' },
    { id: 'IIIa', name: 'IIIa: Französisch' },
    { id: 'IIIb', name: 'IIIb: Kunst, Werken, Ernährung, Sozialwesen oder Musik' },
    { id: 'keine', name: 'noch keine (Klasse 5/6)' },
  ];
  const PROFIL_IIIB = ['Kunst', 'Werken', 'Ernährung und Gesundheit', 'Sozialwesen', 'Musik'];
  const PRAKTISCH = ['Kunst', 'Werken', 'Ernährung und Gesundheit'].map(schluessel);
  /** Kunst, Werken, Ernährung und Gesundheit haben zusätzlich eine praktische Prüfung. */
  const mitPraktischerPruefung = (name) => PRAKTISCH.includes(schluessel(name));

  const FARBEN = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7', '#e11d48', '#0ea5e9', '#65a30d', '#78716c'];

  let zaehler = 0;
  function neueId() {
    zaehler++;
    return Date.now().toString(36) + '-r' + zaehler.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  const V = (name, opt = {}) => ({ name, sa: !!opt.sa, vorr: opt.vorr !== false, pruef: !!opt.pruef, prakt: !!opt.prakt, wpf: !!opt.wpf });

  /** Vorlage je Gruppe und Jahrgangsstufe (5–10). */
  function vorlage(gruppe, klasse) {
    const k = Number(klasse);
    if (k <= 6) {
      const l = [V('Deutsch', { sa: true }), V('Englisch', { sa: true }), V('Mathematik', { sa: true }), V('Religionslehre/Ethik'), V('Geographie'), V('Biologie')];
      if (k >= 6) l.push(V('Geschichte'));
      l.push(V('Informationstechnologie'), V('Musik', { vorr: false }), V('Kunst', { vorr: false }), V('Sport', { vorr: false }), V('Werken/Textiles Gestalten', { vorr: false }));
      return l;
    }
    const p = k === 10;
    const l = [
      V('Deutsch', { sa: true, pruef: p }),
      V('Englisch', { sa: true, pruef: p }),
      V(gruppe === 'I' ? 'Mathematik I' : 'Mathematik', { sa: true, pruef: p }),
    ];
    if (gruppe === 'II') l.push(V('BwR', { sa: true, pruef: p }), V('Wirtschaft und Recht'));
    if (gruppe === 'IIIa') l.push(V('Französisch', { sa: true, pruef: p }));
    if (gruppe === 'IIIb') l.push(V('Wahlpflichtfach (Profil)', { sa: true, pruef: p, wpf: true }));
    l.push(V('Physik', { sa: true, pruef: p && gruppe === 'I' }));
    if (k >= (gruppe === 'I' ? 8 : 9)) l.push(V('Chemie', { sa: true }));
    l.push(V('Biologie'), V('Geschichte'));
    if (k <= 9) l.push(V('Geographie'));
    if (k >= 10) l.push(V('Politik und Gesellschaft'));
    l.push(V('Religionslehre/Ethik'));
    if (k <= 9) l.push(V('Informationstechnologie'), V('Musik', { vorr: false }), V('Kunst', { vorr: false }));
    l.push(V('Sport', { vorr: false }));
    return l;
  }

  function fachAusVorlage(v, i, klasse) {
    return {
      id: neueId(),
      name: v.name,
      farbe: FARBEN[i % FARBEN.length],
      jahrgaenge: { [String(klasse)]: true },
      schulaufgaben: v.sa,
      vorrueckungsfach: v.vorr,
      wpf: v.wpf,
      pruefungsfach: v.pruef,
      praktischePruefung: v.prakt,
      gewichtung: { modus: 'standard', saAnteil: 50 },
      noten: [],
      zeugnis: {},
      pruefung: { schriftlich: null, muendlich: null, praktisch: null },
    };
  }

  /** Fächerliste Realschule für Gruppe und Klasse. */
  function faecherFuer(gruppe, klasse) {
    return vorlage(gruppe, klasse).map((v, i) => fachAusVorlage(v, i, klasse));
  }

  /** „Andere Schule“: Deutsch, Englisch, Mathematik mit Schulaufgaben. */
  function standardFaecher(klasse) {
    return ['Deutsch', 'Englisch', 'Mathematik'].map((n, i) => fachAusVorlage(V(n, { sa: true }), i, klasse));
  }

  function leeresFach(name, index, klasse) {
    return fachAusVorlage(V(name), index, klasse);
  }

  /**
   * Neue Klasse ergänzen, ohne Noten zu verlieren: Fächer mit gleichem Namen (das Profilfach über wpf)
   * bekommen die Klasse dazu, fehlende Fächer der Vorlage kommen neu hinzu.
   */
  function klasseErgaenzen(faecher, gruppe, klasse) {
    const k = String(klasse);
    const res = (faecher || []).map((f) => ({ ...f, jahrgaenge: { ...(f.jahrgaenge || {}) } }));
    let neu = 0;
    for (const v of faecherFuer(gruppe, k)) {
      const vorhanden = res.find((f) => !unterrichtetIn(f, k) && (v.wpf ? !!f.wpf : schluessel(f.name) === schluessel(v.name)));
      if (vorhanden) {
        vorhanden.jahrgaenge[k] = true;
        vorhanden.schulaufgaben = !!vorhanden.schulaufgaben || v.schulaufgaben;
        if (Number(k) === 10) {
          vorhanden.pruefungsfach = v.pruefungsfach;
          vorhanden.praktischePruefung = v.wpf ? mitPraktischerPruefung(vorhanden.name) : v.praktischePruefung;
        }
        if (!vorhanden.pruefung) vorhanden.pruefung = { schriftlich: null, muendlich: null, praktisch: null };
      } else if (!res.some((f) => unterrichtetIn(f, k) && schluessel(f.name) === schluessel(v.name))) {
        res.push({ ...v, farbe: FARBEN[(res.length + neu) % FARBEN.length] });
        neu++;
      }
    }
    return res;
  }

  /** „Andere Schule“: alle Fächer in die neue Klasse übernehmen. */
  function klasseUebernehmen(faecher, klasse) {
    return (faecher || []).map((f) => ({ ...f, jahrgaenge: { ...(f.jahrgaenge || {}), [String(klasse)]: true } }));
  }

  /** Noten und Zeugniswerte in die andere Skala umrechnen (2− <=> 10 Punkte, Zeugnis 2 <=> 11 Punkte). */
  function skalaUmrechnen(faecher, nach) {
    return (faecher || []).map((f) => ({
      ...f,
      noten: (f.noten || []).map((n) => {
        const m = { ...n };
        if (nach === 'punkte') {
          if (m.note !== undefined && m.note !== null) {
            const p = punkteAusNote(m.note);
            if (p !== null) m.punkte = p;
            delete m.note;
          }
        } else if (istZahl(m.punkte)) {
          const l = noteAusPunkten(m.punkte);
          if (l) m.note = l;
          delete m.punkte;
        }
        return m;
      }),
      zeugnis: Object.fromEntries(Object.entries(f.zeugnis || {}).map(([k, v]) => {
        const n = zahl(v);
        if (n === null) return [k, v];
        if (nach === 'punkte') return [k, n >= 1 && n <= 6 ? grenzen(Math.round(17 - 3 * n), 0, 15) : null];
        return [k, n >= 0 && n <= 15 ? stufeAusPunkten(n) : null];
      })),
    }));
  }

  /** Farbverlauf: Punkte-Äquivalent 17 − 3 × Note (1 grün, 3 orange, 6 rot), begrenzt auf 0–15. */
  function farbPunkte(wert, skala = 'noten') {
    if (!istZahl(wert)) return null;
    return skala === 'punkte' ? grenzen(wert, 0, 15) : grenzen(17 - 3 * wert, 0, 15);
  }

  return {
    NOTENARTEN, GEWICHTUNGEN, TENDENZEN, NOTENSTUFEN, GRUPPEN, PROFIL_IIIB, FARBEN,
    standardSystem, systemNormalisieren, istGross, standardGewicht, eigenesGewicht, gewichtDerNote,
    noteLabel, noteWert, anzeige, notenStufe, noteAusPunkten, punkteAusNote, stufeAusPunkten, notenWert, stufeDerNote,
    zweiStellen, runden,
    zeitraeume, zeitraumTeile, zeitraumLabel, zeugnisName, jahrgaengeDesFachs, unterrichtetIn, halbjahreDesFachs, notenImZeitraum,
    jahresnote, naechsteNoteFuer,
    istDeutsch, vorrueckungsfachNachName, istVorrueckungsfach, vorruecken,
    pruefungsnote, gesamtnote, bestehen, demSchnitt, abschluss,
    mitPraktischerPruefung, vorlage, faecherFuer, standardFaecher, leeresFach, klasseErgaenzen, klasseUebernehmen, neueId,
    skalaUmrechnen, farbPunkte,
  };
})();

if (typeof module !== 'undefined') module.exports = Realschule;
