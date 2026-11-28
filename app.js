/* Oberfläche des Fachabi-Rechners. Rechenlogik: calc.js (FOS), realschule.js (Realschule, andere Schule), Stundentafeln: presets.js */
/* global Calc, Presets, Realschule */
(function () {
  'use strict';

  const KEY = 'fachabitur-rechner-v2';

  const NOTENARTEN = [
    { id: 'sa', name: 'Schulaufgabe' },
    { id: 'stegreif', name: 'Stegreifaufgabe' },
    { id: 'kurzarbeit', name: 'Kurzarbeit' },
    { id: 'muendlich', name: 'Rechenschaftsablage (mündlich)' },
    { id: 'referat', name: 'Referat' },
    { id: 'beitrag', name: 'Unterrichtsbeitrag' },
    { id: 'praktisch', name: 'Praktische Leistung' },
    { id: 'projekt', name: 'Projekt / Portfolio' },
    { id: 'sonstiges', name: 'Sonstiges' },
  ];
  const ART = Object.fromEntries(NOTENARTEN.map((a) => [a.id, a]));
  const STANDARD_GEWICHTE = { sa: 1, stegreif: 1, kurzarbeit: 1, muendlich: 1, referat: 1, beitrag: 1, praktisch: 1, projekt: 1, sonstiges: 1 };
  const GEWICHT_CHIPS = [0.5, 1, 1.5, 2, 3];

  // ---------- Hilfsfunktionen ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: d }));
  const fmtS = (s) => (s === null || s === undefined ? '–' : s.toFixed(1).replace('.', ','));
  const datumDe = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
  const heute = () => new Date().toISOString().slice(0, 10);

  function zahlAus(v, min, max, ganz = true) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    let n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    if (ganz) n = Math.round(n);
    return Math.min(max, Math.max(min, n));
  }

  // Farbverlauf: 0 Punkte rot, um 8 Punkte gelb-orange, 15 Punkte kräftig grün
  const HUE_STOPS = [[0, 0], [3, 12], [6, 30], [8, 46], [10, 78], [12, 112], [15, 145]];
  function hue(p) {
    if (p === null || p === undefined || Number.isNaN(p)) return null;
    const x = Math.max(0, Math.min(15, p));
    for (let i = 1; i < HUE_STOPS.length; i++) {
      const [x0, h0] = HUE_STOPS[i - 1];
      const [x1, h1] = HUE_STOPS[i];
      if (x <= x1) return h0 + ((h1 - h0) * (x - x0)) / (x1 - x0);
    }
    return 145;
  }
  const punkteAusSchnitt = (s) => (s === null || s === undefined ? null : (17 / 3 - s) * 3);
  const hStyle = (p) => { const h = hue(p); return h === null ? '' : `--h:${Math.round(h)}`; };

  // farbe: Punkte für die Farbe (Standard: p), z. B. 0 für Rot
  function pill(p, gross = false, farbe = p) {
    const leer = p === null || p === undefined;
    const note = state.einstellungen.zeigeNote && !leer ? `<small>${Calc.noteAusPunkten(p)}</small>` : '';
    return `<span class="pill ${leer ? 'p-leer' : 'farbig'}${gross ? ' gross' : ''}" style="${hStyle(farbe)}">${leer ? '–' : p}${note}</span>`;
  }

  const kPill = (gross = false) => `<span class="pill p-leer${gross ? ' gross' : ''}" title="keine Note möglich">k</span>`;

  // Notenmodus: ganze Zeugnisnote (bzw. Punkte), klein daneben der Schnitt mit 2 Nachkommastellen
  function wertPill(wert, roh = null, gross = false) {
    const leer = wert === null || wert === undefined;
    let klein = '';
    if (!leer && punkteSkala()) klein = state.einstellungen.zeigeNote ? `<small>${Calc.noteAusPunkten(wert)}</small>` : '';
    else if (!leer && roh !== null && roh !== undefined && Math.abs(Realschule.zweiStellen(roh) - wert) > 1e-9) klein = `<small>${fmt2(roh)}</small>`;
    return `<span class="pill ${leer ? 'p-leer' : 'farbig'}${gross ? ' gross' : ''}" style="${leer ? '' : farbStil(wert)}">${leer ? '–' : wert}${klein}</span>`;
  }
  // Einzelnote: '2−' bzw. Punkte
  function einzelPill(n) {
    const s = system();
    const v = Realschule.notenWert(n, s);
    if (v === null) return '<span class="pill p-leer">?</span>';
    const text = s.skala === 'punkte' ? `${n.punkte}${state.einstellungen.zeigeNote ? `<small>${Calc.noteAusPunkten(n.punkte)}</small>` : ''}` : esc(Realschule.anzeige(Realschule.noteLabel(n.note)));
    return `<span class="pill farbig" style="${farbStil(v)}">${text}</span>`;
  }

  // ---------- Zustand ----------
  function neuerState() {
    return {
      version: 2,
      richtung: null,
      klasse: '12',
      aktivesHJ: '12_1',
      faecher: [],
      fpa: { '11_1': {}, '11_2': {} },
      seminar: {},
      zweiteFS: { modus: 'keine' },
      streichModus: { fachabi: 'aus', abitur: 'aus' }, // 'aus' (Standard, nichts gestrichen) | 'ein'
      gestrichen: { fachabi: {}, abitur: {} }, // eigene Auswahl: { fachId: hj }
      behalten: { fachabi: {}, abitur: {} }, // zurückgeholte Fächer: { fachId: true }
      einstellungen: { zeigeNote: true, theme: 'auto', gewichte: { ...STANDARD_GEWICHTE }, notensystem: Realschule.standardSystem() },
      abschluss: null, // 'realschule' | 'fachabi' | 'abitur' | 'andere'; null = noch nicht gewählt
      gruppe: null, // Realschule: Wahlpflichtfächergruppe 'I' | 'II' | 'IIIa' | 'IIIb' | 'keine'
      ziel: 2.0,
      zielAbi: 2.0,
    };
  }

  // Alte Felder fach.streichen/streichenAbi ('auto'/'ja'/'nein') bleiben liegen, werden aber nicht mehr benutzt.
  const ARTEN = ['fachabi', 'abitur'];

  const ABSCHLUESSE = ['realschule', 'fachabi', 'abitur', 'andere'];

  // Alte Stände und Sicherungen: 'auto' => 'aus', 'manuell' => 'ein' (Auswahl bleibt), fehlt => 'aus'.
  // Fehlt der Abschluss (Stände vor der Abschluss-Auswahl): Klasse 13 => 'abitur', sonst 'fachabi'.
  function normalisieren(d) {
    const n = neuerState();
    const e = d.einstellungen || {};
    const res = {
      ...n,
      ...d,
      faecher: (d.faecher || []).map((f) => ({ ...f })),
      fpa: { '11_1': {}, '11_2': {}, ...(d.fpa || {}) },
      seminar: d.seminar || {},
      zweiteFS: d.zweiteFS || { modus: 'keine' },
      ...Calc.streichDatenNormalisieren(d),
      einstellungen: { ...n.einstellungen, ...e, gewichte: { ...STANDARD_GEWICHTE, ...(e.gewichte || {}) }, notensystem: Realschule.systemNormalisieren(e.notensystem) },
    };
    if (!d.klasse && d.aktivesHJ) res.klasse = String(d.aktivesHJ).split('_')[0];
    res.abschluss = ABSCHLUESSE.includes(d.abschluss) ? d.abschluss : String(res.klasse) === '13' ? 'abitur' : 'fachabi';
    res.gruppe = d.gruppe || null;
    return res;
  }

  function laden() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.version === 2 && Array.isArray(d.faecher)) return normalisieren(d);
      }
    } catch (e) { /* kein Speicher verfügbar */ }
    return neuerState();
  }

  let state = laden();
  // archiv: { id, name } solange ein Archiv angezeigt wird (nur ansehen), sonst null
  const ui = { tab: 'faecher', fachId: null, zielHJ: {}, statHJ: 'alle', abschluss: null, hjAnsicht: null, archiv: null };
  let archivVorher = null; // aktueller Stand, solange ein Archiv angezeigt wird
  const archivAnsicht = () => !!ui.archiv;
  const NUR_LESEN = 'Im Archiv kann man nichts ändern';

  function speichern() {
    if (archivAnsicht()) return; // Archiv ansehen: nie in den normalen Speicher schreiben
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  }

  function aendern(fn) {
    if (archivAnsicht()) { toast(NUR_LESEN); render(); return; }
    fn();
    speichern();
    render();
  }

  // ---------- Archiv (alte Schuljahre) ----------
  // Liste [{ id, name, datum (ISO), stand }]; stand ist eine vollständige Kopie des App-Zustands
  const ARCHIV_KEY = 'fachabitur-rechner-archiv-v1';
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const archivGueltig = (a) => !!(a && a.id && a.stand && a.stand.version === 2 && Array.isArray(a.stand.faecher));
  // Stand aus Archiv oder Sicherung: ohne Feld „archiv“, alte Stände wie beim Laden normalisieren
  function standAus(d) {
    const { archiv, ...rest } = d;
    return normalisieren(rest);
  }

  function archivLaden() {
    try {
      const raw = localStorage.getItem(ARCHIV_KEY);
      const d = raw ? JSON.parse(raw) : [];
      if (Array.isArray(d)) return d.filter(archivGueltig);
    } catch (e) { /* kein Speicher verfügbar */ }
    return [];
  }

  function archivSpeichern(liste) {
    try { localStorage.setItem(ARCHIV_KEY, JSON.stringify(liste)); return true; } catch (e) { return false; }
  }

  /** Kopie von stand ins Archiv legen. Gibt den Eintrag zurück oder null, wenn der Speicher voll ist. */
  function archivAnlegen(name, stand) {
    const liste = archivLaden();
    const { archiv, ...rest } = kopie(stand);
    const eintrag = { id: `a-${Presets.neueId()}`, name: String(name || '').trim() || 'Schuljahr', datum: new Date().toISOString(), stand: rest };
    liste.push(eintrag);
    return archivSpeichern(liste) ? eintrag : null;
  }

  const archivSortiert = () => archivLaden().sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  const archivDatum = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  // Schuljahr ab August, z. B. 2025 => „2025/26“
  const schuljahrText = (jahr) => `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`;
  // Beim Wechsel ins neue Schuljahr das Schuljahr, das gerade zu Ende ist: bis Juli das laufende, ab August das vorige.
  // Beides beginnt im Vorjahr, z. B. Juli 2026 und September 2026 => „2025/26“.
  const altesSchuljahr = (datum = new Date()) => schuljahrText(datum.getFullYear() - 1);
  const laufendesSchuljahr = (datum = new Date()) => schuljahrText(Presets.schuljahr(datum));

  const fachById = (id) => state.faecher.find((f) => f.id === id);
  const hat13 = () => state.klasse === '13' || state.faecher.some((f) => f.jahrgaenge && f.jahrgaenge[13]);
  const sichtbareHJ = () => (hat13() ? Calc.HJ : Calc.HJ.slice(0, 4));
  const abschlussArt = () => ui.abschluss || (state.klasse === '13' ? 'abitur' : 'fachabi');
  const abschlussName = (art) => (art === 'abitur' ? 'Abitur' : 'Fachabitur');

  // Realschule und andere Schule: Noten (oder Punkte) mit Jahresnote, Rechnung in realschule.js
  const notenModus = () => state.abschluss === 'realschule' || state.abschluss === 'andere';
  const istRS = () => state.abschluss === 'realschule';
  const eingerichtet = () => (notenModus() ? true : !!state.richtung);
  const klasseNr = () => Number(state.klasse);
  const system = () => {
    const s = state.einstellungen.notensystem || Realschule.standardSystem();
    return istRS() ? { ...s, skala: 'noten' } : s;
  };
  const punkteSkala = () => system().skala === 'punkte';
  const zeitraeume = () => Realschule.zeitraeume(state.klasse);
  const aktiverZeitraum = () => (zeitraeume().includes(state.aktivesHJ) ? state.aktivesHJ : aktuellesHJ(state.klasse));
  const inKlasse = (f) => Realschule.unterrichtetIn(f, state.klasse);
  // Tab „Fachabi/Abitur“: Realschule Klasse 10 „Abschluss“, sonst „Zeugnis“
  const zeugnisTab = () => (istRS() && klasseNr() === 10 ? 'Abschluss' : 'Zeugnis');
  const fmt2 = (n) => (n === null || n === undefined || Number.isNaN(n) ? '–' : Realschule.zweiStellen(n).toFixed(2).replace('.', ','));
  // Schnitt: Noten mit 2, Punkte mit 1 Nachkommastelle
  const fmtSchnitt = (n) => (punkteSkala() ? fmt(n, 1) : fmt2(n));
  const farbStil = (wert) => hStyle(Realschule.farbPunkte(wert, system().skala));
  const STUFE_NAME = Realschule.NOTENSTUFEN;

  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('sichtbar');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('sichtbar'), Math.max(2600, text.length * 55));
  }

  function themeAnwenden() {
    const t = (archivVorher || state).einstellungen.theme; // im Archiv das Design des aktuellen Stands
    if (t === 'hell') document.documentElement.dataset.theme = 'light';
    else if (t === 'dunkel') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
  }

  function aktuellesHJ(klasse) {
    const monat = new Date().getMonth() + 1;
    return `${klasse}_${monat >= 2 && monat <= 7 ? 2 : 1}`;
  }

  // ---------- Bausteine ----------
  function hjChips(erlaubt) {
    return `<div class="chips" role="tablist" aria-label="Halbjahr">${sichtbareHJ().map((hj) => {
      const aus = erlaubt && !erlaubt.includes(hj);
      return `<button class="chip${hj === state.aktivesHJ && !aus ? ' aktiv' : ''}" data-action="hj" data-hj="${hj}" ${aus ? 'disabled' : ''}>${Calc.HJ_LABEL[hj]}</button>`;
    }).join('')}</div>`;
  }

  const klassenOptionen = (aktiv) => ['11', '12', '13'].map((k) => `<option value="${k}" ${k === aktiv ? 'selected' : ''}>${k}. Klasse</option>`).join('');

  // ---------- Ansicht: Willkommen ----------
  const WAHL = [
    ['realschule', 'Realschulabschluss', 'Realschule Bayern, Klasse 5–10'],
    ['fachabi', 'Fachabitur', 'FOS Bayern, 11. und 12. Klasse'],
    ['abitur', 'Abitur / Hochschulreife', 'FOS Bayern, 11. bis 13. Klasse'],
    ['andere', 'Andere Schule', 'Eigenes Notensystem, ohne Abschlussrechnung'],
  ];
  const fosKlassen = (abschluss) => (abschluss === 'abitur' ? ['11', '12', '13'] : ['11', '12']);
  const optionen = (liste, aktiv) => liste.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(aktiv) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const gruppenOptionen = (aktiv, leer = false) => (leer ? '<option value="">bitte wählen</option>' : '') + optionen(Realschule.GRUPPEN.map((g) => [g.id, g.name]), aktiv);
  const klassenBereich = (von, bis) => Array.from({ length: bis - von + 1 }, (_, i) => String(von + i));

  function viewWillkommen() {
    return `
      <section class="card willkommen">
        <img class="logo-gross" src="icon.svg" alt="" width="88" height="88">
        <h2>Willkommen</h2>
        <p>Welchen Abschluss strebst du an?</p>
        <div class="wahl-liste" role="radiogroup" aria-label="Abschluss">
          ${WAHL.map(([k, t, sub]) => `
            <label class="wahl-karte"><input type="radio" name="ob-abschluss" value="${k}"><span class="wahl-text"><b>${t}</b><small>${sub}</small></span></label>`).join('')}
        </div>
        <div class="ob-teil" data-ob="realschule" hidden>
          <label class="feld">Klasse
            <select id="ob-rs-klasse">${optionen(klassenBereich(5, 10).map((k) => [k, `${k}. Klasse`]), '10')}</select>
          </label>
          <label class="feld" id="ob-gruppe-feld">Wahlpflichtfächergruppe
            <select id="ob-gruppe">${gruppenOptionen('', true)}</select>
          </label>
          <p class="hinweis">Die App legt typische Fächer an. Passe die Fächer an deine Schule an: umbenennen, hinzufügen, löschen.</p>
        </div>
        <div class="ob-teil" data-ob="fos" hidden>
          <label class="feld">Ausbildungsrichtung
            <select id="ob-richtung">${Object.entries(Presets.RICHTUNGEN).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select>
          </label>
          <label class="feld">Aktuelle Klasse
            <select id="ob-klasse">${klassenOptionen('12')}</select>
          </label>
          <p class="hinweis">Die App legt deine Fächer nach der amtlichen Stundentafel (FOBOSO) an. Danach kannst du alles anpassen: Fächer umbenennen, hinzufügen, löschen, Farben ändern.</p>
        </div>
        <div class="ob-teil" data-ob="andere" hidden>
          <label class="feld">Notensystem
            <select id="ob-skala">${optionen([['noten', 'Noten 1–6'], ['punkte', 'Punkte 15–0']], 'noten')}</select>
          </label>
          <label class="feld">Fächer
            <select id="ob-faecher">${optionen([['standard', 'Deutsch, Englisch, Mathematik'], ['leer', 'Leere Liste']], 'standard')}</select>
          </label>
          <label class="feld">Klasse
            <select id="ob-andere-klasse">${optionen(klassenBereich(1, 13).map((k) => [k, `${k}. Klasse`]), '10')}</select>
          </label>
          <p class="hinweis">Gewichtung, Tendenzen und Rundung stellst du unter Einstellungen → „Notensystem der Schule“ ein.</p>
        </div>
        <p class="fehler" id="ob-fehler" hidden></p>
        <button class="btn primaer breit" data-action="onboarding">Los geht's</button>
      </section>`;
  }

  /** Onboarding: Teile zur gewählten Auswahl einblenden (ohne neu zu zeichnen). */
  function onboardingAnpassen() {
    const wahl = document.querySelector('input[name="ob-abschluss"]:checked');
    const a = wahl ? wahl.value : null;
    const teil = a === 'fachabi' || a === 'abitur' ? 'fos' : a;
    document.querySelectorAll('[data-ob]').forEach((el) => { el.hidden = el.dataset.ob !== teil; });
    if (teil === 'fos') {
      const k = $('#ob-klasse');
      const liste = fosKlassen(a);
      const alt = k.value;
      k.innerHTML = liste.map((x) => `<option value="${x}">${x}. Klasse</option>`).join('');
      k.value = liste.includes(alt) && a !== 'abitur' ? alt : a === 'abitur' ? '13' : '12';
    }
    const rk = $('#ob-rs-klasse');
    if (rk) $('#ob-gruppe-feld').hidden = Number(rk.value) <= 6;
    $('#ob-fehler').hidden = true;
  }

  // ---------- Ansicht: Fächer ----------
  function fachKarte(f, r, hj) {
    const n = (f.noten || []).filter((x) => x.hj === hj).length;
    const sub = r.k ? 'Keine Note (k)' : r.quelle === 'zeugnis' ? 'Zeugniswert' : n ? `${n} ${n === 1 ? 'Note' : 'Noten'}` : 'Noch keine Noten';
    const pruef = hj.startsWith('13') ? f.pruefungsfachAbi : f.pruefungsfach;
    const tags = (pruef ? '<span class="tag">Prüfung</span>' : '') + (f.wpf ? '<span class="tag">WPF</span>' : '') + (f.einbringbar === false ? '<span class="tag grau">zählt nicht</span>' : '');
    return `
      <button class="fach-karte" data-action="fach-oeffnen" data-id="${esc(f.id)}" style="--fach:${esc(f.farbe)}">
        <span class="fach-farbe" aria-hidden="true"></span>
        <span class="fach-text"><span class="fach-name">${esc(f.name)}</span><span class="fach-sub">${sub}${tags}</span></span>
        ${r.k ? kPill(true) : pill(r.punkte, true)}
      </button>`;
  }

  function viewFaecher() {
    if (!eingerichtet()) return viewWillkommen();
    if (notenModus()) return viewFaecherNoten();
    const hj = state.aktivesHJ;
    const aktive = state.faecher.filter((f) => Calc.halbjahreDesFachs(f).includes(hj));
    const liste = aktive.map((f) => ({ f, r: Calc.halbjahr(f, hj) }));
    const mitWert = liste.filter((x) => x.r.punkte !== null && x.f.einbringbar !== false);
    const schnitt = mitWert.length ? mitWert.reduce((s, x) => s + x.r.punkte, 0) / mitWert.length : null;
    const art = hj.startsWith('13') ? 'abitur' : 'fachabi';
    const abs = Calc.auswertung(state, art);
    return `
      ${hjChips()}
      <section class="kacheln">
        <div class="kachel${schnitt === null ? '' : ' flaeche'}" style="${hStyle(schnitt)}">
          <div class="kachel-label">Ø ${Calc.HJ_LABEL[hj]}</div>
          <div class="kachel-wert">${schnitt === null ? '–' : fmt(schnitt, 1)}</div>
          <div class="kachel-sub">Punkte aus ${mitWert.length} ${mitWert.length === 1 ? 'Fach' : 'Fächern'}</div>
        </div>
        <button class="kachel${abs.S === null ? '' : ' flaeche'}" style="${hStyle(punkteAusSchnitt(abs.S))}" data-action="tab" data-tab="abschluss" data-art="${art}">
          <div class="kachel-label">${abschlussName(art)}-Schnitt</div>
          <div class="kachel-wert">${fmtS(abs.S)}</div>
          <div class="kachel-sub">${abs.vollstaendig ? (abs.vorlaeufig ? 'Vorläufig, ohne Streichen' : 'Endergebnis') : abs.M ? (abs.vorlaeufig ? 'Hochrechnung, ohne Streichen' : 'Hochrechnung') : 'Noch keine Daten'}</div>
        </button>
      </section>
      <section class="liste">
        ${liste.length ? liste.map(({ f, r }) => fachKarte(f, r, hj)).join('') : `<p class="leer">Für ${Calc.HJ_LABEL[hj]} sind keine Fächer eingerichtet.</p>`}
      </section>
      <button class="btn sekundaer breit" data-action="fach-neu">+ Fach hinzufügen</button>`;
  }

  // ---------- Notenmodus: Fächer ----------
  function zeitraumChips() {
    const akt = aktiverZeitraum();
    return `<div class="chips" role="tablist" aria-label="Zeitraum">${zeitraeume().map((z) => `<button class="chip${z === akt ? ' aktiv' : ''}" data-action="hj" data-hj="${z}" title="${esc(Realschule.zeugnisName(z))}">${Realschule.zeitraumLabel(z)}</button>`).join('')}</div>`;
  }

  function fachTagsNoten(f) {
    if (!istRS()) return '';
    return (klasseNr() === 10 && f.pruefungsfach ? '<span class="tag">Prüfung</span>' : '')
      + (f.wpf ? '<span class="tag">Profil</span>' : '')
      + (!Realschule.istVorrueckungsfach(f, state.gruppe) ? '<span class="tag grau">kein Vorrückungsfach</span>' : '');
  }

  function fachKarteNoten(f, r) {
    const n = r.anzahl;
    const sub = r.quelle === 'zeugnis' ? 'Zeugniswert' : n ? `${n} ${n === 1 ? 'Note' : 'Noten'}` : 'Noch keine Noten';
    return `
      <button class="fach-karte" data-action="fach-oeffnen" data-id="${esc(f.id)}" style="--fach:${esc(f.farbe)}">
        <span class="fach-farbe" aria-hidden="true"></span>
        <span class="fach-text"><span class="fach-name">${esc(f.name)}</span><span class="fach-sub">${sub}${fachTagsNoten(f)}</span></span>
        ${wertPill(r.wert, r.quelle === 'noten' ? r.roh : null, true)}
      </button>`;
  }

  /** Kachel rechts oben: Vorrücken (Kl. 5–9), Abschluss (Kl. 10) oder Ø Jahreszeugnis (andere Schule). */
  function statusKachel() {
    const s = system();
    if (istRS() && klasseNr() === 10) {
      const b = Realschule.abschluss(state.faecher, s, state.gruppe, 10).bestehen;
      const leer = !b.anzahl;
      const wert = leer ? '–' : { bestanden: 'Bestanden', ausgleich: 'Bestanden', nicht: 'Nicht bestanden' }[b.ergebnis];
      const p = leer ? null : { bestanden: 13, ausgleich: 8, nicht: 0 }[b.ergebnis];
      return `<button class="kachel${leer ? '' : ' flaeche'}" style="${hStyle(p)}" data-action="tab" data-tab="abschluss">
          <div class="kachel-label">Realschulabschluss</div>
          <div class="kachel-wert text">${wert}</div>
          <div class="kachel-sub">${leer ? 'Noch keine Daten' : b.ergebnis === 'ausgleich' ? 'durch Notenausgleich, vorläufig' : 'vorläufig, ohne Gewähr'}</div>
        </button>`;
    }
    if (istRS()) {
      const v = Realschule.vorruecken(state.faecher, state.klasse, s, state.gruppe);
      const leer = v.status === 'leer';
      return `<button class="kachel${leer ? '' : ' flaeche'}" style="${hStyle(leer ? null : v.gefaehrdet ? 0 : 13)}" data-action="tab" data-tab="abschluss">
          <div class="kachel-label">Vorrücken</div>
          <div class="kachel-wert text">${leer ? '–' : v.gefaehrdet ? 'Gefährdet' : 'Sieht gut aus'}</div>
          <div class="kachel-sub">${leer ? 'Noch keine Daten' : 'vorläufig, ohne Gewähr'}</div>
        </button>`;
    }
    const jn = state.faecher.filter(inKlasse).map((f) => Realschule.jahresnote(f, `${state.klasse}_J`, s).wert).filter((x) => x !== null);
    const sc = jn.length ? jn.reduce((a, b) => a + b, 0) / jn.length : null;
    return `<button class="kachel${sc === null ? '' : ' flaeche'}" style="${farbStil(sc)}" data-action="tab" data-tab="abschluss">
        <div class="kachel-label">Ø Jahreszeugnis</div>
        <div class="kachel-wert">${sc === null ? '–' : fmtSchnitt(sc)}</div>
        <div class="kachel-sub">Info, steht nicht im Zeugnis</div>
      </button>`;
  }

  function viewFaecherNoten() {
    const s = system();
    const z = aktiverZeitraum();
    const liste = state.faecher.filter(inKlasse).map((f) => ({ f, r: Realschule.jahresnote(f, z, s) }));
    const mitWert = liste.filter((x) => x.r.wert !== null);
    const schnitt = mitWert.length ? mitWert.reduce((a, x) => a + x.r.wert, 0) / mitWert.length : null;
    return `
      ${zeitraumChips()}
      <section class="kacheln">
        <div class="kachel${schnitt === null ? '' : ' flaeche'}" style="${farbStil(schnitt)}">
          <div class="kachel-label">Ø ${esc(Realschule.zeugnisName(z))}</div>
          <div class="kachel-wert">${schnitt === null ? '–' : fmtSchnitt(schnitt)}</div>
          <div class="kachel-sub">${punkteSkala() ? 'Punkte' : 'Noten'} aus ${mitWert.length} ${mitWert.length === 1 ? 'Fach' : 'Fächern'}</div>
        </div>
        ${statusKachel()}
      </section>
      <section class="liste">
        ${liste.length ? liste.map(({ f, r }) => fachKarteNoten(f, r)).join('') : `<p class="leer">Für die ${esc(state.klasse)}. Klasse sind keine Fächer eingerichtet.</p>`}
      </section>
      <button class="btn sekundaer breit" data-action="fach-neu">+ Fach hinzufügen</button>`;
  }

  // ---------- Notenmodus: Fach ----------
  function rundungText(s) {
    if (s.skala === 'punkte') return s.rundung === 'besser' ? 'ab ,50 die bessere Punktzahl (aufrunden)' : 'bei ,50 die schlechtere Punktzahl (abrunden)';
    return s.rundung === 'besser' ? 'ab ,50 die bessere Note' : 'bis ,49 die bessere, ab ,50 die schlechtere Note';
  }

  function erklaerungNoten(r) {
    const s = system();
    const einheit = s.skala === 'punkte' ? ' Punkte' : '';
    if (r.quelle === 'zeugnis') return `Zeugniswert eingetragen: <b>${r.wert}${einheit}</b>${r.berechnet !== null ? ` (aus deinen Noten: ${fmt2(r.roh)} → ${r.berechnet})` : ''}.`;
    if (r.roh === null) return 'Noch keine Noten in diesem Zeitraum.';
    if (r.anteil !== null) {
      if (r.saSchnitt !== null && r.kleinSchnitt !== null) {
        return `${fmt(r.anteil, 1)} % × ${fmt2(r.saSchnitt)} (Schulaufgaben) + ${fmt(100 - r.anteil, 1)} % × ${fmt2(r.kleinSchnitt)} (kleine Noten) = ${fmt2(r.roh)} → <b>${r.berechnet}${einheit}</b>`;
      }
      return `Schnitt ${fmt2(r.roh)} → <b>${r.berechnet}${einheit}</b>`;
    }
    const teile = r.teile.map((t) => (Math.abs(t.gewicht - 1) > 1e-9 ? `${fmt(t.gewicht)}×${fmt(t.wert)}` : fmt(t.wert)));
    const formel = teile.length > 1 || Math.abs(r.nenner - 1) > 1e-9 ? `(${teile.join(' + ')}) / ${fmt(r.nenner)} = ${fmt2(r.roh)}` : fmt2(r.roh);
    return `${formel} → <b>${r.berechnet}${einheit}</b>`;
  }

  // prozent: Prozent-Aufteilung, dann zählt nur das eigene Gewicht innerhalb der Gruppe
  function notenZeileNoten(n, mitHalbjahr, prozent) {
    const s = system();
    const art = Realschule.NOTENARTEN.find((a) => a.id === n.art) || { name: ART[n.art] ? ART[n.art].name : 'Sonstiges' };
    const w = prozent ? Realschule.eigenesGewicht(n) ?? 1 : Realschule.gewichtDerNote(n, s);
    const g = Math.abs(w - 1) > 1e-9 ? `<span class="tag">×${fmt(w)}</span>` : '';
    const sub = [mitHalbjahr ? Realschule.zeitraumLabel(n.hj) : '', datumDe(n.datum), n.notiz ? esc(n.notiz) : ''].filter(Boolean).join(' · ');
    return `
      <button class="noten-zeile" data-action="note-bearbeiten" data-id="${esc(n.id)}">
        <span class="noten-text"><span class="noten-art">${esc(art.name)}${g}</span>${sub ? `<span class="noten-sub">${sub}</span>` : ''}</span>
        ${einzelPill(n)}
      </button>`;
  }

  function zielOptionenNoten(ziel) {
    if (punkteSkala()) return Array.from({ length: 16 }, (_, i) => 15 - i).map((p) => `<option value="${p}" ${p === ziel ? 'selected' : ''}>${p} Punkte (${Calc.noteAusPunkten(p)})</option>`).join('');
    return [1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === ziel ? 'selected' : ''}>${n} (${STUFE_NAME[n]})</option>`).join('');
  }

  function viewFachNoten(f) {
    const s = system();
    const punkte = s.skala === 'punkte';
    const z = aktiverZeitraum();
    ui.hjAnsicht = z;
    const { klasse, teil } = Realschule.zeitraumTeile(z);
    const r = Realschule.jahresnote(f, z, s);
    const noten = Realschule.notenImZeitraum(f, z).slice().sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
    const gross = noten.filter((n) => Realschule.istGross(n.art));
    const klein = noten.filter((n) => !Realschule.istGross(n.art));
    const zeigeSa = f.schulaufgaben || gross.length > 0;
    const jahr = teil === 'J';

    // „Was brauche ich?“: im 1. Halbjahr fürs Zwischenzeugnis, sonst fürs Jahreszeugnis
    const zielZ = teil === '1' ? z : `${klasse}_J`;
    const rz = zielZ === z ? r : Realschule.jahresnote(f, zielZ, s);
    let ziel = ui.zielHJ[f.id];
    if (!(punkte ? ziel >= 0 && ziel <= 15 : ziel >= 1 && ziel <= 6)) ziel = punkte ? Math.min(15, (rz.berechnet ?? 9) + 1) : Math.max(1, (rz.berechnet ?? 3) - 1);
    const zielText = (b, was) => {
      if (b === null) return `${was}: nicht mehr erreichbar`;
      if (b.sicher) return `${was}: Ziel ist schon sicher`;
      return punkte ? `${was}: mindestens <b>${b.wert} Punkte</b>` : `${was}: eine <b>${esc(Realschule.anzeige(b.wert))}</b> oder besser`;
    };
    const bSa = Realschule.naechsteNoteFuer(f, zielZ, ziel, 'sa', s);
    const bKl = Realschule.naechsteNoteFuer(f, zielZ, ziel, 'stegreif', s);
    const gSa = Realschule.standardGewicht('sa', s);
    const zeugnisWert = f.zeugnis && f.zeugnis[z] !== undefined && f.zeugnis[z] !== null ? f.zeugnis[z] : '';
    const hinweisRundung = istRS()
      ? `Die Zeugnisnote legt die Lehrkraft fest (§ 23 RSO), es gibt keine feste Rundungsregel. Die App rundet: ${rundungText(s)}.`
      : `Die Zeugnisnote legt deine Lehrkraft fest. Die App rundet: ${rundungText(s)}.`;
    const jahrZeile = teil === '2' ? (() => { const j = Realschule.jahresnote(f, `${klasse}_J`, s); return `<br><small>Jahreszeugnis bisher: ${j.wert === null ? '–' : `<b>${j.wert}</b>${j.quelle === 'noten' ? ` (${fmt2(j.roh)})` : ''}`}</small>`; })() : '';

    return `
      <div class="fach-kopf">
        <button class="zurueck" data-action="zurueck" aria-label="Zurück">‹ Fächer</button>
        <button class="icon-btn" data-action="fach-einstellungen" data-id="${esc(f.id)}">Bearbeiten</button>
      </div>
      ${zeitraumChips()}
      <section class="card ergebnis-fach${r.wert === null ? '' : ' flaeche'}" style="${farbStil(r.wert)}">
        <div class="ergebnis-zeile">
          <div><div class="kachel-label">${teil === '2' ? 'Schnitt 2. Halbjahr' : `${esc(Realschule.zeugnisName(z))} (voraussichtlich)`}</div><div class="erklaerung">${erklaerungNoten(r)}${jahrZeile}</div></div>
          ${wertPill(r.wert, r.quelle === 'noten' ? r.roh : null, true)}
        </div>
        <p class="hinweis klein-abstand">${hinweisRundung}</p>
      </section>

      <button class="btn primaer breit" data-action="note-neu">+ Note hinzufügen</button>

      ${zeigeSa ? `<section class="gruppe"><h3>Schulaufgaben <span class="zahl">${gross.length}</span>${r.saSchnitt !== null ? `<span class="rechts">Ø ${fmtSchnitt(r.saSchnitt)}</span>` : ''}</h3>${gross.length ? gross.map((n) => notenZeileNoten(n, jahr, r.anteil !== null)).join('') : '<p class="leer klein">Noch keine Schulaufgabe.</p>'}</section>` : ''}
      <section class="gruppe"><h3>Kleine Leistungsnachweise <span class="zahl">${klein.length}</span>${r.kleinSchnitt !== null ? `<span class="rechts">Ø ${fmtSchnitt(r.kleinSchnitt)}</span>` : ''}</h3>${klein.length ? klein.map((n) => notenZeileNoten(n, jahr, r.anteil !== null)).join('') : '<p class="leer klein">Noch keine Noten.</p>'}</section>

      <section class="card">
        <h3>Was brauche ich?</h3>
        <label class="feld inline">Wunschnote ${teil === '1' ? 'Zwischenzeugnis' : 'Jahreszeugnis'}
          <select data-bind="zielhj" data-id="${esc(f.id)}">${zielOptionenNoten(ziel)}</select>
        </label>
        <ul class="ziel-liste">
          ${zeigeSa ? `<li>${zielText(bSa, `Nächste Schulaufgabe${r.anteil === null ? ` (×${fmt(gSa)})` : ''}`)}</li>` : ''}
          <li>${zielText(bKl, 'Nächste kleine Note (×1)')}</li>
        </ul>
      </section>

      ${teil === '2' ? '' : `
      <section class="card">
        <h3>Zeugniswert</h3>
        <p class="hinweis">Steht im ${esc(Realschule.zeugnisName(z))} eine andere ${punkte ? 'Punktzahl' : 'Note'}? Trag sie hier ein. Sie ersetzt dann die Berechnung.</p>
        <label class="feld inline">${esc(Realschule.zeugnisName(z))}
          <input type="number" min="${punkte ? 0 : 1}" max="${punkte ? 15 : 6}" inputmode="numeric" placeholder="leer = berechnen" data-bind="zeugnis-noten" data-id="${esc(f.id)}" data-hj="${z}" value="${esc(zeugnisWert)}">
        </label>
      </section>`}`;
  }

  // ---------- Ansicht: Fach ----------
  function erklaerung(f, r, hj) {
    if (r.k) return 'Für dieses Halbjahr ist <b>keine Note</b> möglich (k). Es wird beim Fachabitur gestrichen.';
    if (r.quelle === 'zeugnis') {
      return `Zeugniswert eingetragen: <b>${r.punkte} Punkte</b>${r.berechnet !== null ? ` (aus deinen Noten berechnet: ${r.berechnet})` : ''}.`;
    }
    if (r.berechnet === null) return 'Noch keine Noten in diesem Halbjahr.';
    const g = f.gewichtung || {};
    if (g.modus === 'anteil') {
      const a = Math.min(100, Math.max(0, Number(g.saAnteil ?? 50)));
      if (r.saSchnitt !== null && r.kleinSchnitt !== null) {
        return `${fmt(a, 1)} % × ${fmt(r.saSchnitt)} (Schulaufgaben) + ${fmt(100 - a, 1)} % × ${fmt(r.kleinSchnitt)} (kleine Noten) = ${fmt(r.roh)} → <b>${r.berechnet} Punkte</b>`;
      }
      return `Schnitt ${fmt(r.roh)} → <b>${r.berechnet} Punkte</b>`;
    }
    const sa = (f.noten || []).filter((n) => n.hj === hj && n.art === 'sa');
    const teile = sa.map((n) => (n.gewicht && n.gewicht !== 1 ? `${fmt(n.gewicht)} × ${n.punkte}` : String(n.punkte)));
    let nenner = sa.reduce((s, n) => s + (n.gewicht > 0 ? n.gewicht : 1), 0);
    if (r.kleinSchnitt !== null) { teile.push(`${fmt(r.kleinSchnitt)}<sup>*</sup>`); nenner += 1; }
    const formel = teile.length > 1 || nenner !== 1 ? `(${teile.join(' + ')}) / ${fmt(nenner)} = ${fmt(r.roh)}` : `${fmt(r.roh)}`;
    return `${formel} → <b>${r.berechnet} Punkte</b>${r.kleinSchnitt !== null ? '<br><small><sup>*</sup> Schnitt der kleinen Noten. Er zählt so viel wie eine Schulaufgabe (§ 21 FOBOSO).</small>' : ''}`;
  }

  function notenZeile(n) {
    const art = ART[n.art] || ART.sonstiges;
    const g = n.gewicht && n.gewicht !== 1 ? `<span class="tag">×${fmt(n.gewicht)}</span>` : '';
    const sub = [datumDe(n.datum), n.notiz ? esc(n.notiz) : ''].filter(Boolean).join(' · ');
    return `
      <button class="noten-zeile" data-action="note-bearbeiten" data-id="${esc(n.id)}">
        <span class="noten-text"><span class="noten-art">${esc(art.name)}${g}</span>${sub ? `<span class="noten-sub">${sub}</span>` : ''}</span>
        ${pill(n.punkte)}
      </button>`;
  }

  function viewFach(f) {
    if (notenModus()) return viewFachNoten(f);
    const hjs = Calc.halbjahreDesFachs(f);
    const hj = hjs.includes(state.aktivesHJ) ? state.aktivesHJ : hjs[0] || state.aktivesHJ;
    ui.hjAnsicht = hj;
    const r = Calc.halbjahr(f, hj);
    const noten = (f.noten || []).filter((n) => n.hj === hj).sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
    const sa = noten.filter((n) => n.art === 'sa');
    const klein = noten.filter((n) => n.art !== 'sa');
    const zeigeSa = f.schulaufgaben || sa.length > 0;

    const ziel = ui.zielHJ[f.id] ?? Math.min(15, (r.berechnet ?? 9) + 1);
    const brauchtSa = Calc.naechsteNoteFuer(f, hj, ziel, 'sa');
    const brauchtKlein = Calc.naechsteNoteFuer(f, hj, ziel, 'klein', 1);
    const zielText = (y, was) => (y === null ? `${was}: nicht mehr erreichbar` : y === 0 ? `${was}: Ziel ist schon sicher` : `${was}: mindestens <b>${y} Punkte</b> (${Calc.noteAusPunkten(y)})`);
    const zeugnisWert = !r.k && f.zeugnis && f.zeugnis[hj] !== undefined && f.zeugnis[hj] !== null ? f.zeugnis[hj] : '';

    return `
      <div class="fach-kopf">
        <button class="zurueck" data-action="zurueck" aria-label="Zurück">‹ Fächer</button>
        <button class="icon-btn" data-action="fach-einstellungen" data-id="${esc(f.id)}">Bearbeiten</button>
      </div>
      ${hjChips(hjs)}
      <section class="card ergebnis-fach${r.punkte === null ? '' : ' flaeche'}" style="${hStyle(r.punkte)}">
        <div class="ergebnis-zeile">
          <div><div class="kachel-label">Halbjahresergebnis ${Calc.HJ_LABEL[hj]}</div><div class="erklaerung">${erklaerung(f, r, hj)}</div></div>
          ${r.k ? kPill(true) : pill(r.punkte, true)}
        </div>
      </section>

      <button class="btn primaer breit" data-action="note-neu">+ Note hinzufügen</button>

      ${zeigeSa ? `<section class="gruppe"><h3>Schulaufgaben <span class="zahl">${sa.length}</span></h3>${sa.length ? sa.map(notenZeile).join('') : '<p class="leer klein">Noch keine Schulaufgabe.</p>'}</section>` : ''}
      <section class="gruppe"><h3>Kleine Leistungsnachweise <span class="zahl">${klein.length}</span>${r.kleinSchnitt !== null ? `<span class="rechts">Ø ${fmt(r.kleinSchnitt)}</span>` : ''}</h3>${klein.length ? klein.map(notenZeile).join('') : '<p class="leer klein">Noch keine Noten.</p>'}</section>

      <section class="card">
        <h3>Was brauche ich?</h3>
        <label class="feld inline">Ziel für ${Calc.HJ_LABEL[hj]}
          <select data-bind="zielhj" data-id="${esc(f.id)}">${Array.from({ length: 16 }, (_, i) => 15 - i).map((p) => `<option value="${p}" ${p === ziel ? 'selected' : ''}>${p} Punkte (${Calc.noteAusPunkten(p)})</option>`).join('')}</select>
        </label>
        <ul class="ziel-liste">
          ${zeigeSa ? `<li>${zielText(brauchtSa, 'Nächste Schulaufgabe')}</li>` : ''}
          <li>${zielText(brauchtKlein, 'Nächste kleine Note (Gewicht 1)')}</li>
        </ul>
      </section>

      <section class="card">
        <h3>Zeugniswert</h3>
        <p class="hinweis">Steht im Zeugnis ein anderer Wert, etwa weil die Lehrkraft anders gewichtet hat? Trag ihn hier ein. Er ersetzt dann die Berechnung.</p>
        <label class="feld inline">Punkte ${Calc.HJ_LABEL[hj]}
          <input type="number" min="0" max="15" inputmode="numeric" placeholder="leer = berechnen" data-bind="zeugnis" data-id="${esc(f.id)}" data-hj="${hj}" value="${esc(zeugnisWert)}" ${r.k ? 'disabled' : ''}>
        </label>
        <label class="schalter"><input type="checkbox" data-bind="zeugnis-k" data-id="${esc(f.id)}" data-hj="${hj}" ${r.k ? 'checked' : ''}> Keine Note möglich (k), z. B. nach langer Krankheit</label>
        ${r.k ? '<p class="hinweis">Ein k-Halbjahr muss gestrichen werden. Gibt es mehr k-Halbjahre als Streichungen (höchstens eine je Fach), ist das Fachabitur nicht bestanden.</p>' : ''}
      </section>`;
  }

  // ---------- Ansicht: Fachabitur / Abitur ----------
  function eingabe(bind, attrs, wert, label, placeholder = '') {
    return `<label class="mini">${label}<input type="number" min="0" max="15" inputmode="numeric" placeholder="${placeholder}" data-bind="${bind}" ${attrs} value="${esc(wert ?? '')}"></label>`;
  }

  // Gesamturteil (Calc: ergebnis) als Farbklasse und Text
  const STATUS_KLASSE = { bestanden: 'ok', 'vorläufig bestanden': 'ok', 'nicht bestanden': 'nein', 'vorläufig nicht bestanden': 'nein' };
  const STATUS_TEXT = { bestanden: 'BESTANDEN', 'nicht bestanden': 'NICHT BESTANDEN', 'vorläufig bestanden': 'Vorläufig: bestanden', 'vorläufig nicht bestanden': 'Vorläufig: nicht bestanden' };
  const statusZeile = (ergebnis) => `<p class="status ${STATUS_KLASSE[ergebnis] || ''}">${STATUS_TEXT[ergebnis] || 'Eingaben unvollständig'}</p>`;
  // Bedingungen [{ ok, text }] mit ✓/✗; neutral: ohne Wertung (grau, –)
  const checkListe = (liste, neutral = false) => `<ul class="check-liste">${liste.map((b) => (neutral ? `<li class="neutral">– ${esc(b.text)}</li>` : `<li class="${b.ok ? 'ok' : 'nein'}">${b.ok ? '✓' : '✗'} ${esc(b.text)}</li>`)).join('')}</ul>`;

  // Abitur: zweite Fremdsprache (§ 38). 'pf2iw' nur in Internationale Wirtschaft (oder wenn schon gewählt).
  const FS_OPTIONEN = [
    ['keine', 'Kein Nachweis (nur fachgebundene Hochschulreife)'],
    ['jgst13', 'Belegung als Wahlpflichtfach in der 13. Klasse'],
    ['wpf12', 'Fortgeführt bzw. Wahlpflichtfach in der 12. Klasse (+2 Halbjahre, 420 Punkte)'],
    ['ergaenzung', 'Ergänzungsprüfung (zählt doppelt, 420 Punkte)'],
    ['b1', 'Sprachniveau B1 anderweitig nachgewiesen'],
    ['pf2iw', 'Französisch/Spanisch als Profilfach 2'],
  ];
  const FS_HINWEIS = {
    jgst13: '13/1 und 13/2 dieses Fachs zählen bei der allgemeinen Hochschulreife immer mit. Nötig: Mittel aus 13/1 und 13/2 mindestens 3,5 Punkte und 13/2 mindestens 4 Punkte. Ohne gewähltes Fach gibt es keine allgemeine Hochschulreife.',
    wpf12: 'Die zwei Halbjahre zählen zusätzlich (Höchstpunktzahl 420). Nötig: Mittel aus 12/1 und 12/2 mindestens 3,5 Punkte und 12/2 mindestens 4 Punkte.',
    ergaenzung: 'Zählt doppelt (Höchstpunktzahl 420). Nötig: mindestens 4 Punkte.',
    b1: 'Keine Zusatzpunkte, 390 Punkte. Die allgemeine Hochschulreife gibt es, wenn die fachgebundene bestanden ist.',
    pf2iw: '13/1 und 13/2 von Französisch/Spanisch zählen bei der allgemeinen Hochschulreife immer mit. Nötig: Mittel mindestens 3,5 Punkte und 13/2 mindestens 4 Punkte.',
  };

  // Abitur: eine Spalte „Fachgebundene“ bzw. „Allgemeine Hochschulreife“ (Teilergebnis r von Calc.auswertung)
  function hsrSpalte(titel, unterzeile, r) {
    return `
          <div class="hsr-spalte${r.S === null ? '' : ' flaeche'}" style="${hStyle(punkteAusSchnitt(r.S))}">
            <h4>${titel}</h4>
            <div class="kachel-sub">${unterzeile}</div>
            <div class="kachel-wert">${fmtS(r.S)}</div>
            <div class="kachel-sub">${r.vollstaendig ? `${fmt(r.E, 1)} von ${r.Mgesamt} Punkten` : `${fmt(r.E, 1)} von ${fmt(r.M, 1)} erfassten Punkten`}</div>
            ${statusZeile(r.ergebnis)}
          </div>`;
  }

  function hochschulreifeKarte(a, fsModus) {
    const fhr = hsrSpalte('Fachgebundene Hochschulreife', 'Ohne zweite Fremdsprache, immer 390 Punkte.', a.fhr);
    const ahr = a.ahr
      ? hsrSpalte('Allgemeine Hochschulreife', `Mit zweiter Fremdsprache, ${a.ahr.Mgesamt} Punkte.`, a.ahr)
      : `
          <div class="hsr-spalte">
            <h4>Allgemeine Hochschulreife</h4>
            <div class="kachel-sub">Für die allgemeine Hochschulreife fehlt der Nachweis der zweiten Fremdsprache. Wähle ihn unten unter „Zweite Fremdsprache“.</div>
          </div>`;
    return `
      <section class="card">
        <div class="hsr-spalten">${fhr}${ahr}
        </div>
        ${fsModus === 'b1' ? '<p class="hinweis klein-abstand">Sprachniveau B1 ist anderweitig nachgewiesen. Die allgemeine Hochschulreife gibt es mit bestandener fachgebundener Hochschulreife.</p>' : ''}
        <h4 class="hsr-titel">Nachweis der zweiten Fremdsprache</h4>
        ${checkListe(a.ahrBedingungen, !a.ahr)}
      </section>`;
  }

  function viewAbschluss() {
    if (!eingerichtet()) return viewWillkommen();
    if (notenModus()) return istRS() && klasseNr() === 10 ? viewAbschlussRS() : viewZeugnis();
    const art = abschlussArt();
    const abi = art === 'abitur';
    const a = Calc.auswertung(state, art);
    const fsModus = abi ? Calc.zweiteFSVon(state).modus : null;
    const name = (id) => esc((fachById(id) || {}).name || '');
    const anteil = Math.round((a.M / a.Mgesamt) * 100);

    const umschalter = hat13() ? `
      <div class="chips" role="tablist">
        <button class="chip${!abi ? ' aktiv' : ''}" data-action="abschluss" data-art="fachabi">Fachabitur (12.)</button>
        <button class="chip${abi ? ' aktiv' : ''}" data-action="abschluss" data-art="abitur">Abitur (13.)</button>
      </div>` : '';

    // Ziel
    const ziel = Number(abi ? state.zielAbi : state.ziel) || 2;
    const emin = Calc.benoetigteSumme(ziel, a.Mgesamt);
    let zielText;
    if (a.vollstaendig) {
      const vorl = a.vorlaeufig ? 'Vorläufig: ' : '';
      zielText = a.E >= emin ? `${vorl || 'Geschafft: '}${fmtS(ziel)} ist erreicht.` : `${vorl}${fmtS(ziel)} wurde verfehlt: Dir fehlen ${fmt(emin - a.E, 1)} Punkte.`;
    } else {
      const fehlt = emin - a.E;
      if (fehlt <= 0) zielText = `Mit dem bisherigen Stand ist ${fmtS(ziel)} schon sicher.`;
      else if (a.restMax <= 0 || fehlt > a.restMax) zielText = `${fmtS(ziel)} ist rechnerisch nicht mehr erreichbar.`;
      else zielText = `Für ${fmtS(ziel)} brauchst du in allem, was noch fehlt, im Schnitt <b>${fmt((fehlt / a.restMax) * 15, 1)} Punkte</b> (insgesamt ${emin} von ${a.Mgesamt}).`;
    }

    const pruefFeld = abi ? 'pruefungAbi' : 'pruefung';
    const pruefRows = state.faecher.filter((f) => (abi ? f.pruefungsfachAbi : f.pruefungsfach)).map((f) => {
      const p = Calc.pruefungsergebnis(f, art);
      const pr = f[pruefFeld] || {};
      const attrs = `data-id="${esc(f.id)}" data-feld="${pruefFeld}"`;
      return `
        <div class="pruef-zeile">
          <span class="pruef-name">${esc(f.name)}</span>
          ${eingabe('pruef', `${attrs} data-teil="schriftlich"`, pr.schriftlich, 'schriftl.')}
          ${eingabe('pruef', `${attrs} data-teil="muendlich"`, pr.muendlich, 'mündl.', /englisch/i.test(f.name || '') ? 'Pflicht' : '–')}
          ${pill(p)}
        </div>`;
    }).join('');

    let extraKarten = '';
    if (!abi) {
      const fpaRows = ['11_1', '11_2'].map((hj) => {
        const d = state.fpa[hj] || {};
        const r = a.fpa.find((x) => x.hj === hj);
        const at = `data-hj="${hj}"`;
        return `
          <div class="pruef-zeile fpa">
            <span class="pruef-name">fpA ${Calc.HJ_LABEL[hj]}</span>
            ${eingabe('fpa', `${at} data-teil="ergebnis"`, d.ergebnis, 'Ergebnis')}
            ${eingabe('fpa', `${at} data-teil="anleitung"`, d.anleitung, 'oder Anl.')}
            ${eingabe('fpa', `${at} data-teil="vertiefung"`, d.vertiefung, 'Vertief.')}
            ${eingabe('fpa', `${at} data-teil="praktikum"`, d.praktikum, 'Prakt.')}
            ${pill(r.punkte)}
          </div>`;
      }).join('');
      extraKarten = `
        <section class="card">
          <h3>Fachpraktische Ausbildung <span class="zahl">max. 30</span></h3>
          <p class="hinweis">Trag je Halbjahr das Ergebnis aus dem Zeugnis ein. Oder lass es aus Anleitung + Vertiefung + 2 × Praktikum (geteilt durch 4, gerundet, § 13 Abs. 2) berechnen. Die fpA-Gesamtnote (Mittel beider Halbjahre) zählt bei den Unterpunktungen mit.</p>
          ${fpaRows}
        </section>`;
    } else {
      const s = state.seminar || {};
      const fs = Calc.zweiteFSVon(state);
      const fsFaecher = state.faecher.filter((f) => f.jahrgaenge && f.jahrgaenge[13]);
      const fsOptionen = FS_OPTIONEN.filter(([k]) => k !== 'pf2iw' || state.richtung === 'intwirtschaft' || fs.modus === 'pf2iw');
      const semP = a.seminar.punkte;
      let fsFelder = '';
      if (fs.modus === 'wpf12') fsFelder = `<div class="pruef-zeile">${eingabe('fs', 'data-teil="hj1"', fs.hj1, '12/1')}${eingabe('fs', 'data-teil="hj2"', fs.hj2, '12/2')}</div>`;
      if (fs.modus === 'ergaenzung') fsFelder = `<div class="pruef-zeile">${eingabe('fs', 'data-teil="pruefung"', fs.pruefung, 'Ergänzungsprüfung')}</div>`;
      if (fs.modus === 'jgst13') fsFelder = `<label class="feld">Fach der 2. Fremdsprache<select data-bind="fs-fach"><option value="">bitte wählen</option>${fsFaecher.map((f) => `<option value="${esc(f.id)}" ${f.id === fs.fachId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>`;
      extraKarten = `
        <section class="card">
          <h3>Seminar <span class="zahl">×2</span></h3>
          <p class="hinweis">(2 × Seminarphase + 2 × Seminararbeit + Prüfungsgespräch) / 5, gerundet (§ 17 Abs. 2). Das Seminar zählt bei den Unterpunktungen mit wie ein Gesamtergebnis (unter 4 Punkten, 0 Punkte doppelt). Mit 0 Punkten ist das Abitur nicht bestanden.</p>
          <div class="pruef-zeile">
            ${eingabe('seminar', 'data-teil="phase"', s.phase, 'Phase')}
            ${eingabe('seminar', 'data-teil="arbeit"', s.arbeit, 'Arbeit')}
            ${eingabe('seminar', 'data-teil="gespraech"', s.gespraech, 'Gespräch')}
            ${eingabe('seminar', 'data-teil="ergebnis"', s.ergebnis, 'oder Zeugnis')}
            ${pill(semP, false, semP !== null && semP < 4 ? 0 : semP)}
          </div>
        </section>
        <section class="card">
          <h3>Zweite Fremdsprache (allgemeine Hochschulreife)</h3>
          <p class="hinweis">Nur nötig, wenn du die allgemeine Hochschulreife willst (§ 38). Die fachgebundene Hochschulreife rechnet immer mit 390 Punkten und ohne die zweite Fremdsprache. Mit Fortführung aus der 12. oder Ergänzungsprüfung hat die allgemeine Hochschulreife 420 Punkte.</p>
          <label class="feld">Nachweis
            <select data-bind="fs-modus">
              ${fsOptionen.map(([k, l]) => `<option value="${k}" ${k === fs.modus ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          ${FS_HINWEIS[fs.modus] ? `<p class="hinweis">${FS_HINWEIS[fs.modus]}</p>` : ''}
          ${fsFelder}
        </section>`;
    }

    const slotsVon = abi ? Calc.einbringbareHalbjahreAbitur : Calc.einbringbareHalbjahre;
    const manuell = a.streichModus === 'ein';
    const ohne = a.streichModus === 'aus';
    const N = a.zuStreichen;
    // Fach der 2. Fremdsprache (AHR, Modus 'jgst13' oder 'pf2iw'): 13/1 und 13/2 nicht streichbar
    const fsFachId = abi ? a.fsFachId : null;
    const einbringRows = state.faecher.filter((f) => slotsVon(f).length).map((f) => {
      const hatK = a.kandidaten.some((x) => x.fachId === f.id && x.k);
      const waehlbar = a.waehlbar[f.id] || [];
      const chips = slotsVon(f).map((hj) => {
        const k = a.kandidaten.find((x) => x.fachId === f.id && x.hj === hj);
        const wert = k && k.punkte !== null ? k.punkte : null;
        const gestr = !!(k && k.gestrichen);
        const istAuto = manuell && gestr && k.wahl === 'auto';
        const cls = gestr ? `gestrichen${istAuto ? ' auto' : ''}` : !k ? 'offen' : k.k ? (ohne ? 'offen k-neutral' : 'offen k-offen') : 'farbig';
        const style = k && !gestr && !k.k ? hStyle(k.punkte) : '';
        const inhalt = `<small>${Calc.HJ_LABEL[hj]}</small>${k && k.k ? 'k' : wert === null ? '–' : wert}`;
        const label = `${name(f.id)} ${Calc.HJ_LABEL[hj]}`;
        let titel = `${Calc.HJ_LABEL[hj]}${k && k.k ? (ohne ? ' (keine Note, zählt nicht mit)' : ' (keine Note)') : ''}${gestr ? (istAuto ? ' (Vorschlag der App)' : ' (gestrichen)') : ''}`;
        if (manuell && waehlbar.includes(hj)) {
          const gedrueckt = gestr && k.wahl === 'manuell';
          const aktion = gestr ? 'zurückholen' : 'streichen';
          return `<button type="button" class="hj-chip tippbar ${cls}" style="${style}" data-action="streich-tipp" data-art="${art}" data-id="${esc(f.id)}" data-hj="${hj}" aria-pressed="${gedrueckt}" aria-label="${label} ${aktion}${istAuto ? ' (Vorschlag der App)' : ''}" title="${titel}: tippen zum ${gestr ? 'Zurückholen' : 'Streichen'}">${inhalt}</button>`;
        }
        if (manuell) {
          if (k && k.k) titel = `${Calc.HJ_LABEL[hj]}: ohne Note (k), wird immer gestrichen`;
          else if (hatK) titel = `${Calc.HJ_LABEL[hj]}: In diesem Fach wird schon das Halbjahr ohne Note (k) gestrichen.`;
          else if (fsFachId === f.id) titel = `${Calc.HJ_LABEL[hj]}: Die 2. Fremdsprache muss bei der allgemeinen Hochschulreife mit 13/1 und 13/2 zählen. Du kannst sie hier nicht streichen.`;
        }
        return `<span class="hj-chip ${cls}" style="${style}" title="${titel}">${inhalt}</span>`;
      }).join('');
      const ge = a.gesamtergebnisse.find((g) => g.fachId === f.id);
      const pruef = abi ? f.pruefungsfachAbi : f.pruefungsfach;
      return `<div class="einbring-zeile"><span class="pruef-name">${name(f.id)}${pruef ? ` <span class="tag">P ×${a.faktor}</span>` : ''}</span><span class="hj-chips">${chips}</span>${pill(ge ? ge.punkte : null)}</div>`;
    }).join('');
    const hjText = (id, hj) => `${name(id)} ${Calc.HJ_LABEL[hj]}`;
    const tauschHtml = manuell && a.tausch && a.tausch.length ? `
        <div class="tipp">
          <b>Tipp für bessere Gesamtergebnisse:</b>
          <ul>${a.tausch.map((x) => `<li>Streiche ${hjText(x.fachId, x.hj)} statt ${hjText(x.stattFachId, x.stattHj)}: ${name(x.fachId)} steigt von ${x.gePunkteVorher} auf ${x.gePunkteNachher} Punkte (${esc(Calc.notenstufe(Calc.stufeAusPunkten(x.gePunkteNachher)))}). Das kostet ${x.punkteVerlust} ${x.punkteVerlust === 1 ? 'Punkt' : 'Punkte'}, der Schnitt bleibt gleich.</li>`).join('')}</ul>
          <small>Umsetzen: Tipp das gestrichelte Halbjahr an, um es zurückzuholen, und dann das andere, um es zu streichen.</small>
        </div>` : '';
    // Abitur mit AHR: Die FHR rechnet mit eigener Streichauswahl (gleiche eigene Wahl, andere Vorschläge möglich)
    let fhrStreichHtml = '';
    if (abi && manuell && a.abschluss === 'ahr') {
      const gestrichenIn = (r) => new Set(r.kandidaten.filter((k) => k.gestrichen).map((k) => `${k.fachId}|${k.hj}`));
      const ahrSet = gestrichenIn(a);
      const nurFhr = a.fhr.kandidaten.filter((k) => k.gestrichen && !ahrSet.has(`${k.fachId}|${k.hj}`));
      if (nurFhr.length) fhrStreichHtml = `<p class="hinweis klein-abstand">Für die fachgebundene Hochschulreife streicht die App andere Halbjahre: ${nurFhr.map((k) => hjText(k.fachId, k.hj)).join(', ')}.</p>`;
    }
    let streichHinweis = '';
    if (manuell && !a.komplett && a.gestrichenAnzahl < N) {
      streichHinweis = `<p class="streich-hinweis">Vorschläge gibt es, sobald alle Halbjahre eingetragen sind. Du kannst aber schon selbst Halbjahre antippen.</p>`;
    } else if (manuell && a.streichZaehler.vorschlag > 0) {
      streichHinweis = '<p class="streich-hinweis">Die gestrichelten schlägt die App vor. Tipp sie an, um sie zurückzuholen, oder tipp andere Halbjahre an.</p>';
    }
    if (ohne && a.kAnzahl > 0) {
      streichHinweis = '<p class="streich-hinweis">Halbjahre ohne Note (k) zählen nicht mit. Sie werden am Ende immer gestrichen.</p>';
    }
    const legende = manuell ? `
        <div class="streich-legende" aria-hidden="true">
          <span><span class="hj-chip gestrichen mini">8</span> von dir</span>
          <span><span class="hj-chip gestrichen auto mini">8</span> Vorschlag der App</span>
        </div>` : '';
    const klasseEnde = abi ? '13.' : '12.';
    const streichText = manuell
      ? `Sind alle Halbjahre eingetragen, schlägt die App vor, welche wegfallen (gestrichelt). Tipp ein Halbjahr an, um es selbst zu streichen oder zurückzuholen. Pro Fach höchstens eins, insgesamt ${N}.`
      : `Gestrichen wird erst am Ende der ${klasseEnde} Klasse. Bis dahin zählen alle Halbjahre mit. Schalte „Streichen“ ein, um zu sehen, welche Halbjahre wegfallen würden.`;
    const streichKopf = `
        <label class="toggle-zeile">
          <span class="toggle-text"><b>Streichen</b><small>${streichText}</small></span>
          <input type="checkbox" class="switch" role="switch" data-bind="streich-modus" data-art="${art}" ${manuell ? 'checked' : ''}>
        </label>
        ${manuell ? `<p class="streich-status">Gestrichen: <b>${a.gestrichenAnzahl} von ${N}</b>${a.streichZaehler.gesamt ? ` ${esc(Calc.streichAufschluesselung(a))}` : ''}</p>` : ''}
        ${streichHinweis}${legende}`;
    const zielOptionen = [1.0, 1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 2.8, 3.0, 3.3, 3.5, 4.0];

    return `
      ${umschalter}
      <section class="card hero${a.S === null ? '' : ' flaeche'}" style="${hStyle(punkteAusSchnitt(a.S))}">
        <div class="kachel-label">${a.vollstaendig ? `${a.vorlaeufig ? 'Vorläufiger' : 'Dein'} ${abschlussName(art)}-Schnitt` : `Hochrechnung ${abschlussName(art)}-Schnitt`}${abi ? ` (${a.abschluss === 'ahr' ? 'allgemeine' : 'fachgebundene'} Hochschulreife)` : ''}</div>
        <div class="hero-wert">${fmtS(a.S)}</div>
        <div class="hero-sub">${a.S !== null ? esc(Calc.notenstufe(a.S)) + ' · ' : ''}${fmt(a.E, 1)} von ${fmt(a.M, 1)} erfassten Punkten${a.vorlaeufig ? ' · noch ohne Streichen' : ''}</div>
        <div class="balken" title="Datenstand"><div style="width:${anteil}%"></div></div>
        <div class="hinweis">${a.vollstaendig ? 'Alle Leistungen sind erfasst.' : `Datenstand: ${fmt(a.M, 1)} von ${a.Mgesamt} möglichen Punkten erfasst (${anteil} %). Die Hochrechnung nimmt an, dass du so weitermachst wie bisher.`}${a.vorlaeufig ? ` Gestrichen ist noch nichts: Alle Halbjahre zählen mit, umgerechnet auf ${a.anzahlHj}.` : ''}</div>
      </section>${abi ? hochschulreifeKarte(a, fsModus) : ''}

      ${a.warnungen.length ? `<section class="card warn-card"><ul>${a.warnungen.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>` : ''}

      <section class="card">
        <h3>Ziel</h3>
        <label class="feld inline">Wunschschnitt
          <select data-bind="${abi ? 'zielAbi' : 'ziel'}">${zielOptionen.map((z) => `<option value="${z}" ${Math.abs(z - ziel) < 1e-9 ? 'selected' : ''}>${fmtS(z)}</option>`).join('')}</select>
        </label>
        <p class="ziel-text">${zielText}</p>
      </section>

      <section class="card">
        <h3>Abschlussprüfungen <span class="zahl">×${a.faktor}</span></h3>
        <p class="hinweis">Mit mündlicher Prüfung: (2 × schriftlich + mündlich) / 3, gerundet (§ 35 Abs. 2).${abi ? ' In Englisch ist die mündliche Prüfung Pflicht.' : ''}</p>
        ${pruefRows || `<p class="leer klein">Keine Prüfungsfächer markiert. Markiere sie unter Fach → Bearbeiten.</p>`}
      </section>

      ${extraKarten}

      <section class="card">
        <h3>Einbringung <span class="zahl">${ohne ? `alle ${a.eingebrachtAnzahl}` : `${a.eingebrachtAnzahl}/${a.anzahlHj}`}</span></h3>
        <p class="hinweis">${abi ? 'Es zählen 16 Halbjahre aus 13/1 und 13/2.' : 'Es zählen 25 Halbjahre aus 11/2, 12/1 und 12/2 (bei Fächern, die in der 11. enden, auch 11/1).'}${ohne ? ` Solange nichts gestrichen ist, rechnet die App alle Halbjahre auf ${a.anzahlHj} um.` : a.umgerechnet ? ` Bis ${N} Halbjahre gestrichen sind, rechnet die App die übrigen auf ${a.anzahlHj} um.` : ''} Rechts steht das Gesamtergebnis des Fachs.</p>
        ${streichKopf}
        ${einbringRows}
        ${abi ? '' : `<div class="einbring-zeile"><span class="pruef-name">Fachpraktische Ausbildung</span><span class="hj-chips"></span>${pill(a.fpaGesamt)}</div>`}
        ${tauschHtml}${fhrStreichHtml}
      </section>

      <section class="card">
        <h3>Bestehen ${a.vollstaendig && !a.vorlaeufig ? '' : '<span class="zahl">vorläufig</span>'}</h3>${abi ? `
        <div class="kachel-label">${a.abschluss === 'ahr' ? 'Allgemeine' : 'Fachgebundene'} Hochschulreife</div>` : ''}
        ${statusZeile(a.ergebnis)}
        ${a.vorlaeufig && a.ergebnis !== 'unvollständig' ? '<p class="hinweis">Noch ohne Streichen gerechnet. Mit „Streichen“ siehst du das Ergebnis mit den Streichungen.</p>' : ''}
        ${a.hinweise.length && a.ergebnis === 'unvollständig' ? `<ul class="hinweis-liste">${a.hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        ${checkListe(a.bestehen)}${abi && a.abschluss === 'ahr' && fsModus !== 'b1' ? `
        <details class="hsr-mehr">
          <summary>Bedingungen der fachgebundenen Hochschulreife</summary>
          ${statusZeile(a.fhr.ergebnis)}
          ${checkListe(a.fhr.bestehen)}
        </details>` : ''}
        <p class="hinweis">${abi ? 'Unter 4 Punkten zählt als Unterpunktung, 0 Punkte zählen doppelt; das Seminar zählt mit. Bei einer Unterpunktung sind mindestens 130 Punkte nötig (bei 420 Punkten: 140), bei zwei mindestens 156 (168).' : 'Unter 4 Punkten zählt als Unterpunktung, 0 Punkte zählen doppelt (§ 35 Abs. 9).'}</p>
      </section>`;
  }

  // ---------- Notenmodus: Zeugnis (RS Klasse 5–9, andere Schule) und Abschluss (RS Klasse 10) ----------
  const listeText = (namen) => namen.map(esc).join(', ');
  const OHNE_GEWAEHR = 'Vorläufig, ohne Gewähr. Verbindlich sind die Entscheidungen deiner Schule.';

  function infoSchnittKarte(werte, text) {
    const sc = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
    return `
      <section class="card">
        <h3>Ø aller Fächer <span class="zahl">Info</span></h3>
        <p class="ziel-text"><b>${sc === null ? '–' : fmtSchnitt(sc)}</b> aus ${werte.length} ${werte.length === 1 ? 'Fach' : 'Fächern'}. ${text}</p>
      </section>`;
  }

  function viewZeugnis() {
    const s = system();
    const k = state.klasse;
    const faecher = state.faecher.filter(inKlasse);
    const zeilen = faecher.map((f) => {
      const zw = Realschule.jahresnote(f, `${k}_1`, s);
      const j = Realschule.jahresnote(f, `${k}_J`, s);
      const chip = `<span class="hj-chip ${zw.wert === null ? 'offen' : 'farbig'}" style="${zw.wert === null ? '' : farbStil(zw.wert)}" title="Zwischenzeugnis"><small>Zwischenz.</small>${zw.wert ?? '–'}</span>`;
      return { j, html: `<div class="einbring-zeile"><span class="pruef-name">${esc(f.name)}${fachTagsNoten(f)}</span><span class="hj-chips">${chip}</span>${wertPill(j.wert, j.quelle === 'noten' ? j.roh : null)}</div>` };
    });
    const jahresnoten = zeilen.map((x) => x.j.wert).filter((x) => x !== null);

    let vorrHtml = '';
    if (istRS()) {
      const v = Realschule.vorruecken(state.faecher, k, s, state.gruppe);
      const leer = v.status === 'leer';
      const kn = klasseNr();
      const hinweise = [];
      if (v.fehlend.length && !leer) hinweise.push(`Noch ohne Jahresnote: ${listeText(v.fehlend)}.`);
      if (v.gefaehrdet && v.probe) hinweise.push('Vorrücken auf Probe ist in Klasse 5–9 möglich (§ 26 RSO). Darüber entscheidet die Klassenkonferenz.');
      if (v.gefaehrdet && v.nachpruefung) hinweise.push('Eine Nachprüfung ist in Klasse 7–9 möglich (§ 27 RSO).');
      if (v.gefaehrdet && v.deutsch6 && kn >= 7) hinweise.push('Bei einer 6 in Deutsch gibt es keine Nachprüfung.');
      vorrHtml = `
        <section class="card hero${leer ? '' : ' flaeche'}" style="${hStyle(leer ? null : v.gefaehrdet ? 0 : 13)}">
          <div class="kachel-label">Vorrücken in die ${kn + 1}. Klasse</div>
          <div class="hero-wert text">${leer ? '–' : v.gefaehrdet ? 'Gefährdet' : 'Sieht gut aus'}</div>
          <div class="hero-sub">vorläufig, ohne Gewähr</div>
        </section>
        <section class="card">
          <h3>Vorrücken <span class="zahl">vorläufig</span></h3>
          ${leer ? '<p class="leer klein">Noch keine Jahresnoten in Vorrückungsfächern.</p>' : `
          <ul class="check-liste">
            <li class="${v.sechser.length ? 'nein' : 'ok'}">${v.sechser.length ? `✗ Note 6: ${listeText(v.sechser)}` : '✓ Keine 6 in einem Vorrückungsfach'}</li>
            <li class="${v.fuenfer.length >= 2 ? 'nein' : 'ok'}">${v.fuenfer.length >= 2 ? `✗ Zwei oder mehr 5: ${listeText(v.fuenfer)}` : v.fuenfer.length ? `✓ Nur eine 5 (${listeText(v.fuenfer)})` : '✓ Keine 5 in einem Vorrückungsfach'}</li>
          </ul>`}
          ${hinweise.length ? `<ul class="hinweis-liste">${hinweise.map((h) => `<li>${h}</li>`).join('')}</ul>` : ''}
          <p class="hinweis">Gefährdet heißt: eine 6 oder zwei 5 in Vorrückungsfächern (§ 24–27 RSO). Es zählen die Jahresnoten, so gerundet wie eingestellt. Kunst, Musik, Sport, Werken und Textiles Gestalten zählen nicht, außer als Wahlpflichtfach der Gruppe III. Ändern unter Fach → Bearbeiten. ${OHNE_GEWAEHR}</p>
        </section>`;
    }

    return `
      ${vorrHtml}
      <section class="card">
        <h3>Jahreszeugnis <span class="zahl">voraussichtlich</span></h3>
        <p class="hinweis">Links das Zwischenzeugnis (1. Halbjahr), rechts die Jahresnote aus allen Noten des Jahres. Die Zeugnisnote legt die Lehrkraft fest.</p>
        ${zeilen.length ? zeilen.map((x) => x.html).join('') : `<p class="leer klein">Für die ${esc(k)}. Klasse sind keine Fächer eingerichtet.</p>`}
      </section>
      ${infoSchnittKarte(jahresnoten, 'Steht nicht im Zeugnis.')}`;
  }

  function eingabeNote(bind, attrs, wert, label, placeholder = '') {
    return `<label class="mini">${label}<input type="number" min="1" max="6" inputmode="numeric" placeholder="${placeholder}" data-bind="${bind}" ${attrs} value="${esc(wert ?? '')}"></label>`;
  }

  function viewAbschlussRS() {
    const s = system();
    const a = Realschule.abschluss(state.faecher, s, state.gruppe, 10);
    const b = a.bestehen;
    const leer = !b.anzahl;
    const status = leer ? '–' : { bestanden: 'Bestanden', ausgleich: 'Bestanden', nicht: 'Nicht bestanden' }[b.ergebnis];
    const offen = [];
    if (a.pruefungFehlt.length) offen.push(`Prüfung fehlt noch: ${listeText(a.pruefungFehlt)} (bis dahin zählt die Jahresnote)`);
    if (b.fehlend.length) offen.push(`Noch ohne Note: ${listeText(b.fehlend)}`);
    const byId = (id) => fachById(id) || {};

    const pruefRows = a.liste.filter((x) => x.pruefungsfach).map((x) => {
      const f = byId(x.fachId);
      const pr = f.pruefung || {};
      const attrs = `data-id="${esc(x.fachId)}"`;
      return `
        <div class="pruef-zeile">
          <span class="pruef-name">${esc(x.name)}<small>Jahresfortgangsnote J: ${x.J ?? '–'}</small></span>
          ${eingabeNote('pruef-noten', `${attrs} data-teil="schriftlich"`, pr.schriftlich, 'schriftl.')}
          ${eingabeNote('pruef-noten', `${attrs} data-teil="muendlich"`, pr.muendlich, 'mündl.', '–')}
          ${x.praktisch ? eingabeNote('pruef-noten', `${attrs} data-teil="praktisch"`, pr.praktisch, 'prakt.') : ''}
          <span class="p-wert" title="Prüfungsnote, ungerundet">P ${x.P === null ? '–' : fmt2(x.P)}</span>
          ${wertPill(x.quelle === 'pruefung' ? x.note : null)}
          ${x.muendlichMoeglich ? '<p class="pruef-hinweis">J und P liegen 0,5 oder mehr auseinander. Du kannst dich freiwillig mündlich prüfen lassen (§ 36 Abs. 2 RSO).</p>' : ''}
        </div>`;
    }).join('');

    const gesamtRows = a.liste.map((x) => {
      const jChip = `<span class="hj-chip ${x.J === null ? 'offen' : 'farbig'}" style="${x.J === null ? '' : farbStil(x.J)}" title="Jahresfortgangsnote"><small>J</small>${x.J ?? '–'}</span>`;
      const pChip = x.pruefungsfach ? `<span class="hj-chip ${x.Pnote === null ? 'offen' : 'farbig'}" style="${x.Pnote === null ? '' : farbStil(x.Pnote)}" title="Prüfungsnote"><small>P</small>${x.Pnote ?? '–'}</span>` : '';
      const tags = (x.pruefungsfach ? '<span class="tag">Prüfung</span>' : '') + (!x.vorrueckungsfach ? '<span class="tag grau">kein Vorrückungsfach</span>' : '');
      return `<div class="einbring-zeile"><span class="pruef-name">${esc(x.name)}${tags}</span><span class="hj-chips">${jChip}${pChip}</span>${wertPill(x.note)}</div>`;
    }).join('');

    const d = a.dem;
    const demText = d.schnitt === null ? 'Noch keine Noten in Deutsch, Englisch und Mathematik.'
      : `Schnitt D/E/M: <b>${fmt2(d.schnitt)}</b> – für die FOS reicht 3,5 oder besser.${d.vollstaendig ? '' : ' (Es fehlen noch Fächer.)'}`;

    const checks = leer ? '' : `
      <ul class="check-liste">
        <li class="${b.deutsch6 ? 'nein' : 'ok'}">${b.deutsch6 ? '✗ Note 6 in Deutsch' : '✓ Keine 6 in Deutsch'}</li>
        <li class="${b.sechser.length ? 'nein' : 'ok'}">${b.sechser.length ? `✗ Note 6: ${listeText(b.sechser)}` : '✓ Keine 6 in einem Vorrückungsfach'}</li>
        <li class="${b.fuenfer.length >= 2 ? 'nein' : 'ok'}">${b.fuenfer.length >= 2 ? `✗ Zwei oder mehr 5: ${listeText(b.fuenfer)}` : b.fuenfer.length ? `✓ Nur eine 5 (${listeText(b.fuenfer)})` : '✓ Keine 5 in einem Vorrückungsfach'}</li>
        ${b.ausgleichNoetig && !b.deutsch6 ? `<li class="${b.ausgleich ? 'ok' : 'nein'}">${b.ausgleich ? `✓ Notenausgleich durch ${esc(b.ausgleich)} in anderen Vorrückungsfächern` : `✗ ${esc(b.grund)}`}</li>` : ''}
      </ul>`;

    return `
      <section class="card hero${leer ? '' : ' flaeche'}" style="${hStyle(leer ? null : { bestanden: 13, ausgleich: 8, nicht: 0 }[b.ergebnis])}">
        <div class="kachel-label">Realschulabschluss</div>
        <div class="hero-wert text">${status}</div>
        <div class="hero-sub">${leer ? 'Noch keine Noten' : b.ergebnis === 'ausgleich' ? 'durch Notenausgleich · vorläufig, ohne Gewähr' : 'vorläufig, ohne Gewähr'}</div>
        ${offen.length ? `<div class="hinweis">${offen.join('. ')}.</div>` : ''}
      </section>

      <section class="card">
        <h3>FOS-Info <span class="zahl">Deutsch, Englisch, Mathe</span></h3>
        <p class="status ${d.schnitt === null ? '' : d.ok ? 'ok' : 'nein'}">${demText}</p>
        <p class="hinweis">Für die FOS brauchst du laut Kultusministerium mindestens 3,5 im Schnitt dieser drei Fächer. Ohne Gewähr.</p>
      </section>

      <section class="card">
        <h3>Abschlussprüfungen</h3>
        <p class="hinweis">Prüfungsnote P: nur schriftlich P = W; mit mündlicher (2 × W + mündl.) / 3; praktisches Fach (W + prakt.) / 2; mit mündlicher (2 × (W + prakt.) / 2 + mündl.) / 3. Die Gesamtnote ist meist die Prüfungsnote, gerundet wie eingestellt (§ 39 Abs. 2 RSO). Liegt J näher an deiner Gesamtleistung, kann der Prüfungsausschuss J nehmen.</p>
        ${pruefRows || '<p class="leer klein">Keine Prüfungsfächer markiert. Markiere sie unter Fach → Bearbeiten.</p>'}
      </section>

      <section class="card">
        <h3>Bestehen <span class="zahl">vorläufig</span></h3>
        <p class="status ${leer ? '' : b.ergebnis === 'nicht' ? 'nein' : 'ok'}">${leer ? 'Noch keine Noten' : { bestanden: 'Bestanden', ausgleich: 'Bestanden durch Notenausgleich', nicht: 'Nicht bestanden' }[b.ergebnis]}</p>
        ${checks}
        <p class="hinweis">Nicht bestanden bei einer 6 in Deutsch, sonst bei einer 6 in einem oder einer 5 in zwei Vorrückungsfächern. Notenausgleich (§ 40 RSO): eine 1, zwei 2 oder vier 3 in anderen Vorrückungsfächern (bessere Noten zählen mit). Kein Ausgleich bei einer 6 in Deutsch oder einer weiteren 5 oder 6. ${OHNE_GEWAEHR}</p>
      </section>

      <section class="card">
        <h3>Gesamtnoten <span class="zahl">J · P · Gesamt</span></h3>
        <p class="hinweis">Ohne Prüfung ist die Gesamtnote die Jahresfortgangsnote.</p>
        ${gesamtRows || '<p class="leer klein">Für die 10. Klasse sind keine Fächer eingerichtet.</p>'}
      </section>

      ${infoSchnittKarte(a.liste.map((x) => x.note).filter((x) => x !== null), 'Steht nicht im Zeugnis: Das Abschlusszeugnis hat keinen Durchschnitt.')}`;
  }

  // ---------- Notenmodus: Statistik ----------
  function viewStatistikNoten() {
    const s = system();
    const punkte = s.skala === 'punkte';
    const k = state.klasse;
    const filterListe = ['alle', `${k}_1`, `${k}_2`];
    const filter = filterListe.includes(ui.statHJ) ? ui.statHJ : 'alle';
    const alle = [];
    for (const f of state.faecher) {
      for (const n of f.noten || []) {
        const wert = Realschule.notenWert(n, s);
        if (wert !== null && (filter === 'alle' || n.hj === filter)) alle.push({ n, f, wert, stufe: Realschule.stufeDerNote(n, s) });
      }
    }
    const filterChips = `<div class="chips scroll" role="tablist" aria-label="Zeitraum">${filterListe.map((h) => `<button class="chip${h === filter ? ' aktiv' : ''}" data-action="stat-hj" data-hj="${h}">${h === 'alle' ? 'Alle' : `${esc(k)}. Kl. ${Realschule.zeitraumLabel(h)}`}</button>`).join('')}</div>`;
    if (!alle.length) return `${filterChips}<p class="leer">Noch keine Noten${filter === 'alle' ? '' : ' in diesem Halbjahr'}. Trag unter „Fächer“ deine ersten Noten ein.</p>`;

    const besser = (a, b) => (punkte ? a.wert > b.wert : a.wert < b.wert);
    const schnitt = alle.reduce((a, x) => a + x.wert, 0) / alle.length;
    const anzahlSa = alle.filter((x) => Realschule.istGross(x.n.art)).length;
    const beste = alle.reduce((a, x) => (besser(x, a) ? x : a));
    const schlechteste = alle.reduce((a, x) => (besser(a, x) ? x : a));
    const text = (x) => (punkte ? String(x.n.punkte) : esc(Realschule.anzeige(Realschule.noteLabel(x.n.note))));

    const stufen = [1, 2, 3, 4, 5, 6].map((st) => ({ st, n: alle.filter((x) => x.stufe === st).length }));
    const maxStufe = Math.max(...stufen.map((x) => x.n), 1);
    const stufeBereich = { 1: '13–15', 2: '10–12', 3: '7–9', 4: '4–6', 5: '1–3', 6: '0' };
    const stufenHtml = stufen.map(({ st, n }) => `
      <div class="stat-zeile" title="Note ${st}: ${n} ${n === 1 ? 'Note' : 'Noten'}">
        <span class="stat-label">${st}er <small>${punkte ? `${stufeBereich[st]} P.` : STUFE_NAME[st]}</small></span>
        <span class="stat-balken"><span class="stat-fill" style="width:${(n / maxStufe) * 100}%;${hStyle(Realschule.farbPunkte(st))}"></span></span>
        <span class="stat-wert">${n}</span>
      </div>`).join('');

    let saeulenHtml = '';
    if (punkte) {
      const proPunkt = Array.from({ length: 16 }, (_, p) => alle.filter((x) => x.wert === p).length);
      const maxPunkt = Math.max(...proPunkt, 1);
      saeulenHtml = `
        <section class="card">
          <h3>Verteilung nach Punkten</h3>
          <div class="saeulen" role="img" aria-label="Anzahl der Noten je Punktzahl von 0 bis 15">${proPunkt.map((n, p) => `
            <div class="saeule" title="${p} Punkte: ${n} ${n === 1 ? 'Note' : 'Noten'}">
              <span class="saeule-wert">${n || ''}</span>
              <span class="saeule-fill" style="height:${(n / maxPunkt) * 100}%;${hStyle(p)}"></span>
              <small>${p}</small>
            </div>`).join('')}</div>
        </section>`;
    }

    const proFach = state.faecher.map((f) => {
      const ns = alle.filter((x) => x.f.id === f.id);
      return { f, n: ns.length, sc: ns.length ? ns.reduce((a, x) => a + x.wert, 0) / ns.length : null };
    }).filter((x) => x.n).sort((a, b) => (punkte ? b.sc - a.sc : a.sc - b.sc));
    const breite = (sc) => (punkte ? (sc / 15) * 100 : ((6 - sc) / 5) * 100);
    const fachHtml = proFach.map(({ f, n, sc }) => `
      <div class="stat-zeile" title="${esc(f.name)}: ${n} Noten, Ø ${fmtSchnitt(sc)}">
        <span class="stat-label"><span class="punkt-farbe" style="background:${esc(f.farbe)}"></span>${esc(f.name)}</span>
        <span class="stat-balken"><span class="stat-fill" style="width:${Math.max(2, breite(sc))}%;${farbStil(sc)}"></span></span>
        <span class="stat-wert">${fmtSchnitt(sc)}<small> · ${n}</small></span>
      </div>`).join('');

    const artHtml = Realschule.NOTENARTEN.map((a) => ({ a, n: alle.filter((x) => x.n.art === a.id).length })).filter((x) => x.n).map(({ a, n }) => `<li><span>${esc(a.name)}</span><b>${n}</b></li>`).join('');

    return `
      ${filterChips}
      <section class="kacheln vier">
        <div class="kachel"><div class="kachel-label">Noten</div><div class="kachel-wert">${alle.length}</div><div class="kachel-sub">davon ${anzahlSa} Schulaufg.</div></div>
        <div class="kachel flaeche" style="${farbStil(schnitt)}"><div class="kachel-label">Ø Einzelnoten</div><div class="kachel-wert">${fmtSchnitt(schnitt)}</div><div class="kachel-sub">${punkte ? 'Punkte, ' : ''}ungewichtet</div></div>
        <div class="kachel flaeche" style="${farbStil(beste.wert)}"><div class="kachel-label">Beste</div><div class="kachel-wert">${text(beste)}</div><div class="kachel-sub">${punkte ? 'Punkte' : 'Note'}</div></div>
        <div class="kachel flaeche" style="${farbStil(schlechteste.wert)}"><div class="kachel-label">Schlechteste</div><div class="kachel-wert">${text(schlechteste)}</div><div class="kachel-sub">${punkte ? 'Punkte' : 'Note'}</div></div>
      </section>
      <section class="card">
        <h3>Wie viele Einser, Zweier …?</h3>
        ${punkte ? '' : '<p class="hinweis">Tendenzen zusammengefasst: 2+, 2 und 2− zählen als Zweier.</p>'}
        ${stufenHtml}
      </section>
      ${saeulenHtml}
      <section class="card">
        <h3>Fächer nach Schnitt <span class="zahl">Ø ${punkte ? 'Punkte' : 'Note'} · Anzahl</span></h3>
        ${fachHtml}
      </section>
      <section class="card">
        <h3>Nach Notenart</h3>
        <ul class="art-liste">${artHtml}</ul>
      </section>`;
  }

  // ---------- Ansicht: Statistik ----------
  function viewStatistik() {
    if (!eingerichtet()) return viewWillkommen();
    if (notenModus()) return viewStatistikNoten();
    const filter = ui.statHJ;
    const alle = [];
    for (const f of state.faecher) for (const n of f.noten || []) if (filter === 'alle' || n.hj === filter) alle.push({ ...n, fach: f });

    const filterChips = `<div class="chips scroll" role="tablist" aria-label="Zeitraum">${['alle', ...sichtbareHJ()].map((h) => `<button class="chip${h === filter ? ' aktiv' : ''}" data-action="stat-hj" data-hj="${h}">${h === 'alle' ? 'Alle' : Calc.HJ_LABEL[h]}</button>`).join('')}</div>`;
    if (!alle.length) return `${filterChips}<p class="leer">Noch keine Noten${filter === 'alle' ? '' : ` in ${Calc.HJ_LABEL[filter]}`}. Trag unter „Fächer“ deine ersten Noten ein.</p>`;

    const schnitt = alle.reduce((s, n) => s + n.punkte, 0) / alle.length;
    const anzahlSa = alle.filter((n) => n.art === 'sa').length;
    const beste = Math.max(...alle.map((n) => n.punkte));
    const schlechteste = Math.min(...alle.map((n) => n.punkte));

    const stufen = [1, 2, 3, 4, 5, 6].map((s) => ({ s, n: alle.filter((x) => Calc.stufeAusPunkten(x.punkte) === s).length }));
    const maxStufe = Math.max(...stufen.map((x) => x.n), 1);
    const stufeBereich = { 1: '13–15', 2: '10–12', 3: '7–9', 4: '4–6', 5: '1–3', 6: '0' };
    const stufeMitte = { 1: 14, 2: 11, 3: 8, 4: 5, 5: 2, 6: 0 };
    const stufenHtml = stufen.map(({ s, n }) => `
      <div class="stat-zeile" title="Note ${s} (${stufeBereich[s]} Punkte): ${n} ${n === 1 ? 'Note' : 'Noten'}">
        <span class="stat-label">${s}er <small>${stufeBereich[s]} P.</small></span>
        <span class="stat-balken"><span class="stat-fill" style="width:${(n / maxStufe) * 100}%;${hStyle(stufeMitte[s])}"></span></span>
        <span class="stat-wert">${n}</span>
      </div>`).join('');

    const proPunkt = Array.from({ length: 16 }, (_, p) => alle.filter((x) => x.punkte === p).length);
    const maxPunkt = Math.max(...proPunkt, 1);
    const saeulen = proPunkt.map((n, p) => `
      <div class="saeule" title="${p} Punkte: ${n} ${n === 1 ? 'Note' : 'Noten'}">
        <span class="saeule-wert">${n || ''}</span>
        <span class="saeule-fill" style="height:${(n / maxPunkt) * 100}%;${hStyle(p)}"></span>
        <small>${p}</small>
      </div>`).join('');

    const proFach = state.faecher.map((f) => {
      const ns = alle.filter((x) => x.fach.id === f.id);
      return { f, n: ns.length, schnitt: ns.length ? ns.reduce((s, x) => s + x.punkte, 0) / ns.length : null };
    }).filter((x) => x.n).sort((a, b) => b.schnitt - a.schnitt);
    const fachHtml = proFach.map(({ f, n, schnitt: sc }) => `
      <div class="stat-zeile" title="${esc(f.name)}: ${n} Noten, Ø ${fmt(sc, 1)} Punkte">
        <span class="stat-label"><span class="punkt-farbe" style="background:${esc(f.farbe)}"></span>${esc(f.name)}</span>
        <span class="stat-balken"><span class="stat-fill" style="width:${(sc / 15) * 100}%;${hStyle(sc)}"></span></span>
        <span class="stat-wert">${fmt(sc, 1)}<small> · ${n}</small></span>
      </div>`).join('');

    const proArt = NOTENARTEN.map((a) => ({ a, n: alle.filter((x) => x.art === a.id).length })).filter((x) => x.n);
    const artHtml = proArt.map(({ a, n }) => `<li><span>${esc(a.name)}</span><b>${n}</b></li>`).join('');

    return `
      ${filterChips}
      <section class="kacheln vier">
        <div class="kachel"><div class="kachel-label">Noten</div><div class="kachel-wert">${alle.length}</div><div class="kachel-sub">davon ${anzahlSa} Schulaufg.</div></div>
        <div class="kachel flaeche" style="${hStyle(schnitt)}"><div class="kachel-label">Ø Einzelnoten</div><div class="kachel-wert">${fmt(schnitt, 1)}</div><div class="kachel-sub">Punkte, ungewichtet</div></div>
        <div class="kachel flaeche" style="${hStyle(beste)}"><div class="kachel-label">Beste</div><div class="kachel-wert">${beste}</div><div class="kachel-sub">Punkte</div></div>
        <div class="kachel flaeche" style="${hStyle(schlechteste)}"><div class="kachel-label">Schlechteste</div><div class="kachel-wert">${schlechteste}</div><div class="kachel-sub">Punkte</div></div>
      </section>
      <section class="card">
        <h3>Wie viele Einser, Zweier …?</h3>
        ${stufenHtml}
      </section>
      <section class="card">
        <h3>Verteilung nach Punkten</h3>
        <div class="saeulen" role="img" aria-label="Anzahl der Noten je Punktzahl von 0 bis 15">${saeulen}</div>
      </section>
      <section class="card">
        <h3>Fächer nach Schnitt <span class="zahl">Ø Punkte · Anzahl</span></h3>
        ${fachHtml}
      </section>
      <section class="card">
        <h3>Nach Notenart</h3>
        <ul class="art-liste">${artHtml}</ul>
      </section>`;
  }

  // ---------- Ansicht: Einstellungen ----------
  const abschlussOptionen = (aktiv) => optionen(WAHL.map(([k, t]) => [k, t]), aktiv);

  /** Notenmodus: Karte „Abschluss und Klasse“ (Realschule bzw. andere Schule). */
  function karteAbschlussNoten() {
    const rs = istRS();
    const fehltKlasse = state.faecher.length > 0 && !state.faecher.some(inKlasse);
    const klassen = rs ? klassenBereich(5, 10) : klassenBereich(1, 13);
    const zeigeGruppe = rs && (klasseNr() >= 7 || (state.gruppe && state.gruppe !== 'keine'));
    return `
      <section class="card">
        <h3>Abschluss und Klasse</h3>
        <label class="feld inline">Abschluss
          <select data-bind="abschluss-wahl">${abschlussOptionen(state.abschluss)}</select>
        </label>
        <label class="feld inline">Klasse
          <select data-bind="klasse">${optionen(klassen.map((k) => [k, `${k}. Klasse`]), state.klasse)}</select>
        </label>
        ${zeigeGruppe ? `<label class="feld">Wahlpflichtfächergruppe
          <select data-bind="gruppe">${gruppenOptionen(state.gruppe || '', !state.gruppe)}</select>
        </label>` : ''}
        ${fehltKlasse ? `<button class="btn primaer breit" data-action="klasse-ergaenzen">${rs ? `Fächer der ${esc(state.klasse)}. Klasse ergänzen` : `Fächer in die ${esc(state.klasse)}. Klasse übernehmen`}</button>` : ''}
        <button class="btn sekundaer breit" data-action="faecher-neu-anlegen" data-confirm="Wirklich? Alle Fächer und Noten werden ersetzt.">${rs ? 'Fächer nach Vorlage neu anlegen' : 'Standardfächer neu anlegen'}</button>
        <p class="hinweis">${rs ? 'Die Fächerlisten sind ein Startpunkt und nicht geprüft. Passe die Fächer an deine Schule an.' : 'Neu anlegen ergibt Deutsch, Englisch und Mathematik.'} Wechselst du den Abschluss, lege danach die Fächer neu an.</p>
      </section>`;
  }

  /** Notenmodus: Karte „Notensystem der Schule“. */
  function karteNotensystem() {
    const ns = Realschule.systemNormalisieren(state.einstellungen.notensystem);
    const s = system();
    const punkte = s.skala === 'punkte';
    const gewichtFelder = ns.gewichtung === 'eigen' ? Realschule.NOTENARTEN.map((a) => `
      <label class="feld inline">${esc(a.name)}
        <input type="number" min="0.25" max="10" step="0.25" inputmode="decimal" data-bind="ns-gewicht" data-art="${a.id}" value="${esc(ns.gewichte[a.id] ?? 1)}">
      </label>`).join('') : '';
    const rundungen = punkte
      ? [['besser', 'ab ,50 aufrunden (bessere Punktzahl)'], ['schlechter', 'bei ,50 abrunden']]
      : [['schlechter', 'bis ,49 die bessere, ab ,50 die schlechtere Note (üblich)'], ['besser', 'ab ,50 die bessere Note']];
    return `
      <section class="card">
        <h3>Notensystem der Schule</h3>
        <p class="hinweis">Gilt als Standard für alle Fächer. Einzelne Fächer (Fach → Bearbeiten) und Noten können abweichen.</p>
        <label class="feld inline">Notenskala
          ${istRS() ? '<span class="feld-wert">Noten 1–6</span>' : `<select data-bind="ns-skala">${optionen([['noten', 'Noten 1–6'], ['punkte', 'Punkte 15–0']], ns.skala)}</select>`}
        </label>
        <label class="feld">Gewichtung
          <select data-bind="ns-gewichtung">${optionen(Realschule.GEWICHTUNGEN.map((g) => [g.id, g.name]), ns.gewichtung)}</select>
        </label>
        ${ns.gewichtung === 'prozent' ? `<label class="feld inline">Anteil Schulaufgaben in %
          <input type="number" min="0" max="100" step="1" inputmode="numeric" data-bind="ns-anteil" value="${esc(ns.saAnteil)}">
        </label><p class="hinweis">Kleine Noten zählen dann ${fmt(100 - ns.saAnteil, 1)} %.</p>` : ''}
        ${gewichtFelder}
        ${punkte ? '' : `<label class="feld inline">Tendenzen (2+, 2−)
          <select data-bind="ns-tendenz">${optionen([['0', 'aus'], ['0.25', '±0,25 (2− = 2,25)'], ['0.33', '±0,33 (2− = 2,33)']], String(ns.tendenz))}</select>
        </label>`}
        <label class="feld">Rundung der Zeugnisnote
          <select data-bind="ns-rundung">${optionen(rundungen, s.rundung)}</select>
        </label>
        <p class="hinweis">${istRS() ? 'Standard an der Realschule: Schulaufgaben zählen doppelt (§ 23 Abs. 2 RSO). ' : ''}Tendenzen und Rundung sind übliche Praxis, nicht gesetzlich geregelt. Die Zeugnisnote legt die Lehrkraft fest.</p>
      </section>`;
  }

  function infoKarteNoten() {
    if (!istRS()) {
      return `
      <section class="card info">
        <h3>So rechnet die App</h3>
        <ul>
          <li><b>Zeugnisnote</b>: Σ(Gewicht × Note) / Σ Gewicht. Die Gewichte stellst du unter „Notensystem der Schule“ ein, jede Note kann ein eigenes Gewicht haben. Bei „Prozent“ zählen Schulaufgaben und kleine Noten mit festen Anteilen.</li>
          <li><b>Tendenzen</b>: 2− = 2,25 (oder 2,33), 2+ = 1,75 (oder 1,67).</li>
          <li><b>Rundung</b>: erst auf zwei Nachkommastellen, dann nach deiner Einstellung auf eine ganze Note.</li>
          <li><b>Zwischenzeugnis</b>: Noten des 1. Halbjahrs. <b>Jahreszeugnis</b>: alle Noten des Jahres.</li>
          <li>Keine Abschluss- oder Vorrückungsrechnung.</li>
        </ul>
        <p class="hinweis">Ohne Gewähr. Verbindlich sind die Festsetzungen deiner Schule.</p>
      </section>`;
    }
    return `
      <section class="card info">
        <h3>So rechnet die App</h3>
        <ul>
          <li><b>Jahresfortgangsnote</b> (§ 23 Abs. 2 RSO): Schulaufgaben (auch Kurzarbeit oder Test statt Schulaufgabe) zählen doppelt, kleine Leistungsnachweise einfach: Σ(Gewicht × Note) / Σ Gewicht. Jede Note kann ein eigenes Gewicht haben.</li>
          <li><b>Tendenzen</b>: 2− = 2,25 (oder 2,33), 2+ = 1,75 (oder 1,67). Übliche Praxis, nicht gesetzlich geregelt.</li>
          <li><b>Rundung</b>: erst auf zwei Nachkommastellen, dann nach deiner Einstellung (Standard: bis ,49 die bessere, ab ,50 die schlechtere Note). Die Zeugnisnote legt die Lehrkraft fest (§ 23 RSO).</li>
          <li><b>Zwischenzeugnis</b>: Noten des 1. Halbjahrs. <b>Jahreszeugnis</b>: alle Noten des Jahres.</li>
          <li><b>Vorrücken</b> (§ 24–27 RSO, Klasse 5–9): gefährdet bei einer 6 oder zwei 5 in Vorrückungsfächern. Kunst, Musik, Sport, Werken und Textiles Gestalten zählen nicht, außer als Wahlpflichtfach der Gruppe III.</li>
          <li><b>Prüfungsnote</b> (Klasse 10): nur schriftlich P = W; mit mündlicher (2W + O) / 3; praktisches Fach (W + Pr) / 2, mit mündlicher (2 × (W + Pr) / 2 + O) / 3. <b>Gesamtnote</b>: die Prüfungsnote, gerundet; ohne Prüfung die Jahresfortgangsnote.</li>
          <li><b>Bestehen</b> (§ 39, § 40 RSO): nicht bei einer 6 in Deutsch, sonst nicht bei einer 6 oder zwei 5 in Vorrückungsfächern, außer mit Notenausgleich (eine 1, zwei 2 oder vier 3 in anderen Vorrückungsfächern; die App zählt bessere Noten mit). Kein Ausgleich bei einer weiteren 5 oder 6.</li>
          <li><b>FOS</b>: Schnitt aus Deutsch, Englisch und Mathematik, 3,5 oder besser.</li>
        </ul>
        <p class="hinweis">Rechtsgrundlage: RSO, Fassung ab 01.08.2026, nur aus Zusammenfassungen. Vorläufig, ohne Gewähr. Verbindlich sind die Festsetzungen deiner Schule.</p>
      </section>`;
  }

  /** Karte „Schuljahre“: neues Schuljahr beginnen, Archiv ansehen, wiederherstellen, löschen. */
  function karteSchuljahre() {
    const liste = archivSortiert();
    const abschlussText = (st) => (WAHL.find(([k]) => k === st.abschluss) || [null, ''])[1];
    const zeilen = liste.map((a) => `
      <div class="archiv-zeile">
        <span class="verwalt-text"><span class="fach-name">${esc(a.name)}</span><span class="fach-sub">${[abschlussText(a.stand), archivDatum(a.datum) ? `gesichert am ${archivDatum(a.datum)}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
        <div class="archiv-knoepfe">
          <button class="mini-btn text" data-action="archiv-ansehen" data-id="${esc(a.id)}">Ansehen</button>
          <button class="mini-btn text" data-action="archiv-wiederherstellen" data-id="${esc(a.id)}">Wiederherstellen</button>
          <button class="mini-btn text gefahr" data-action="archiv-loeschen" data-id="${esc(a.id)}" data-confirm="Archiv wirklich löschen? Das kann man nicht rückgängig machen.">Löschen</button>
        </div>
      </div>`).join('');
    const bereit = eingerichtet() && !!state.abschluss;
    return `
      <section class="card">
        <h3>Schuljahre <span class="zahl">${liste.length} im Archiv</span></h3>
        <p class="hinweis">Neues Schuljahr? Deine Noten kommen ins Archiv. Dort kannst du sie jederzeit ansehen.</p>
        ${bereit ? `<div class="btn-reihe">
          <button class="btn primaer breit" data-action="schuljahr-neu">Neues Schuljahr beginnen</button>
          <button class="btn sekundaer breit" data-action="archivieren">Aktuelles Schuljahr archivieren</button>
        </div>` : ''}
        ${zeilen || '<p class="leer klein">Noch nichts im Archiv.</p>'}
      </section>`;
  }

  /** Einstellungen, während ein Archiv angezeigt wird. */
  function viewEinstellungenArchiv() {
    return `
      <section class="card">
        <h3>Einstellungen</h3>
        <p class="hinweis">Du siehst gerade ein Archiv. Im Archiv kann man nichts ändern. Geh zurück zum aktuellen Schuljahr, um etwas einzustellen.</p>
        <button class="btn primaer breit" data-action="archiv-zurueck">Zurück zum aktuellen Schuljahr</button>
      </section>`;
  }

  function viewEinstellungen() {
    if (archivAnsicht()) return viewEinstellungenArchiv();
    const e = state.einstellungen;
    const nm = notenModus();
    const gewichtFelder = NOTENARTEN.map((n) => `
      <label class="feld inline">${esc(n.name)}
        <input type="number" min="0.25" max="10" step="0.25" inputmode="decimal" data-bind="std-gewicht" data-art="${n.id}" value="${esc(e.gewichte[n.id] ?? 1)}">
      </label>`).join('');
    const jgText = (f) => (nm ? Realschule.jahrgaengeDesFachs(f) : [11, 12, 13].filter((j) => f.jahrgaenge && f.jahrgaenge[j])).join(' · ') || '–';
    const tagsVon = (f) => (nm ? fachTagsNoten(f) : `${f.wpf ? '<span class="tag">WPF</span>' : ''}${f.einbringbar === false ? '<span class="tag grau">zählt nicht</span>' : ''}`);
    const faecherListe = state.faecher.map((f, i) => `
      <div class="verwalt-zeile">
        <span class="punkt-farbe" style="background:${esc(f.farbe)}"></span>
        <span class="verwalt-text"><span class="fach-name">${esc(f.name)}</span><span class="fach-sub">Klasse ${jgText(f)}${tagsVon(f)}</span></span>
        <button class="mini-btn" data-action="fach-hoch" data-id="${esc(f.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button class="mini-btn" data-action="fach-runter" data-id="${esc(f.id)}" ${i === state.faecher.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button class="mini-btn text" data-action="fach-einstellungen" data-id="${esc(f.id)}">Bearbeiten</button>
      </div>`).join('');
    const fehlt13 = (state.klasse === '13' || state.abschluss === 'abitur') && !state.faecher.some((f) => f.jahrgaenge && f.jahrgaenge[13]);
    // Info-Karte: ausführliche Abitur-Zeile (FHR/AHR) nur bei Abitur-Ständen, Fachabi-Stände wie bisher
    const abiStand = state.abschluss === 'abitur' || hat13();

    const karteFOS = `
      <section class="card">
        <h3>Abschluss, Klasse und Richtung</h3>
        <label class="feld inline">Abschluss
          <select data-bind="abschluss-wahl">${abschlussOptionen(state.abschluss)}</select>
        </label>
        <label class="feld inline">Klasse
          <select data-bind="klasse">${klassenOptionen(state.klasse)}</select>
        </label>
        ${fehlt13 ? '<button class="btn primaer breit" data-action="dreizehn-ergaenzen">Fächer der 13. Klasse ergänzen</button>' : ''}
        <label class="feld">Richtung
          <select data-bind="richtung">${state.richtung ? '' : '<option value="" selected>bitte wählen</option>'}${Object.entries(Presets.RICHTUNGEN).map(([k, v]) => `<option value="${k}" ${k === state.richtung ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
        </label>
        <button class="btn sekundaer breit" data-action="faecher-neu-anlegen" data-confirm="Wirklich? Alle Fächer und Noten werden ersetzt.">Fächer nach Stundentafel neu anlegen</button>
      </section>`;

    return `
      ${nm ? karteAbschlussNoten() : karteFOS}
      ${nm ? karteNotensystem() : ''}

      <section class="card">
        <h3>Meine Fächer <span class="zahl">${state.faecher.length}</span></h3>
        <p class="hinweis">${nm ? `Umbenennen, Farbe ändern, ${istRS() ? 'als Profil-, Vorrückungs- oder Prüfungsfach markieren, ' : ''}Reihenfolge ändern oder löschen.` : 'Umbenennen, Farbe ändern, als Wahlpflichtfach oder Prüfungsfach markieren, Reihenfolge ändern oder löschen.'}</p>
        ${faecherListe || '<p class="leer klein">Noch keine Fächer.</p>'}
        <button class="btn sekundaer breit" data-action="fach-neu">+ Fach hinzufügen</button>
      </section>

      <section class="card">
        <h3>Anzeige</h3>
        ${nm && !punkteSkala() ? '' : `<label class="schalter"><input type="checkbox" data-bind="zeigeNote" ${e.zeigeNote ? 'checked' : ''}> Note (1+ bis 6) klein neben den Punkten zeigen</label>`}
        <label class="feld inline">Design
          <select data-bind="theme">${[['auto', 'Wie System'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(([k, l]) => `<option value="${k}" ${k === e.theme ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </section>

      ${nm ? '' : `<section class="card">
        <h3>Standard-Gewichtung</h3>
        <p class="hinweis">Mit diesem Gewicht startet jede neue Note. Bei jeder Note kannst du es einzeln ändern, z. B. ×2 oder ×1,5. Gesetzlich (§ 21 FOBOSO) zählt jede Schulaufgabe so viel wie der Schnitt aller kleinen Noten zusammen (Gewicht 1).</p>
        ${gewichtFelder}
      </section>`}

      ${karteSchuljahre()}

      <section class="card">
        <h3>Daten</h3>
        <p class="hinweis">Deine Noten bleiben nur auf diesem Gerät, im Browser. Mach ab und zu eine Sicherung.</p>
        <div class="btn-reihe">
          <button class="btn sekundaer" data-action="export">Sicherung herunterladen</button>
          <label class="btn sekundaer">Sicherung laden<input type="file" accept="application/json,.json" id="import-datei" hidden></label>
        </div>
        <button class="btn gefahr breit" data-action="alles-loeschen" data-confirm="Wirklich alles löschen? Nochmal tippen.">Alle Daten löschen</button>
      </section>

      ${nm ? infoKarteNoten() : `<section class="card info">
        <h3>So rechnet die App</h3>
        <ul>
          <li><b>Halbjahresergebnis</b> (§ 21): Jede Schulaufgabe zählt so viel wie der gewichtete Schnitt aller kleinen Noten zusammen. Gerundet wird erst am Ende auf ganze Punkte, ab ,5 auf. Werte unter 1 ergeben 0 Punkte (§ 19 Abs. 6).</li>
          <li><b>Prüfung</b> (§ 35 Abs. 2): (2 × schriftlich + mündlich) / 3, gerundet; unter 1 ergibt 0. Ohne mündliche zählt die schriftliche. Fachabi: zählt dreifach, mündlich Englisch ist Pflicht. Abitur: zählt doppelt.</li>
          <li><b>Fachabitur</b> (§ 35 Abs. 5): 4 Prüfungen × 3, fachpraktische Ausbildung (2 Halbjahre) und 25 Halbjahre = 585 Punkte.</li>
          <li><b>Streichen</b>: Gestrichen wird erst am Ende der 12. (Abitur: 13.) Klasse. Deshalb ist „Streichen“ am Anfang aus. Dann zählen alle Halbjahre mit, auch 11/1 bei Fächern, die in der 11. enden. Damit der Schnitt vergleichbar bleibt, rechnet die App den Halbjahresteil auf 25 Halbjahre um (Abitur: 16): Summe der Halbjahrespunkte × 25 / Anzahl der Halbjahre. Halbjahre ohne Note (k) zählen dabei nicht mit. Das Ergebnis ist vorläufig.</li>
          <li><b>„Streichen“ an</b>: höchstens ein Halbjahr je Fach. Sind alle Halbjahre eingetragen, schlägt die App vor, welche Halbjahre wegfallen (gestrichelt), wie das Streichvorschlag-Tool der FOS: im Fach das schwächste Halbjahr. Zuerst Halbjahre ohne Note (k), dann Rettung eines Gesamtergebnisses unter 4 Punkten (wenn fürs Bestehen nötig), sonst die niedrigsten Punkte. Du kannst Halbjahre selbst antippen, um sie zu streichen oder zurückzuholen, auch schon vorher. Bis dahin streicht die App nur k-Halbjahre und deine Wahl und rechnet die übrigen Halbjahre wie oben um.</li>
          <li><b>Gesamtergebnis</b> je Fach (für die Unterpunktungen): eingebrachte Halbjahre und Prüfung × 3, erst auf zwei Nachkommastellen, dann auf ganze Punkte gerundet. Die fpA-Gesamtnote zählt mit.</li>
          <li>${abiStand ? '<b>Abitur</b> (§ 35 Abs. 7): 4 Prüfungen × 2, Seminar × 2, 16 Halbjahre aus 13/1 und 13/2 = 390 Punkte. Fachgebundene Hochschulreife immer 390, allgemeine Hochschulreife mit 2. Fremdsprache aus der 12. oder Ergänzungsprüfung 420.' : '<b>Abitur</b> (§ 35 Abs. 7): 4 Prüfungen × 2, Seminar × 2 und 16 Halbjahre aus der 13. = 390 Punkte (mit 2. Fremdsprache 420).'}</li>
          <li>Höchstens ein Halbjahr pro Fach darf wegfallen. Sport zählt nicht.</li>
          <li><b>Schnitt</b> (§ 27 Abs. 3): 17/3 − 5 × Punkte / Höchstpunktzahl. Die erste Nachkommastelle wird abgeschnitten, nicht gerundet.</li>
          <li><b>Bestehen</b> (§ 35 Abs. 9): höchstens 2 Prüfungs- und 2 Gesamtergebnisse unter 4 Punkten, 0 Punkte zählen doppelt. Bei einer Unterpunktung im Gesamtergebnis mindestens 195 Punkte, bei zweien mindestens 234. Ein Halbjahr ohne Note (k), das nicht gestrichen werden kann, bedeutet nicht bestanden.</li>${abiStand ? `
          <li><b>Bestehen Abitur</b>: keine Prüfung mit 0 Punkten, höchstens 2 Prüfungen unter 4 Punkten, höchstens 2 Gesamtergebnisse unter 4 Punkten (das Seminar zählt mit, 0 Punkte doppelt). Bei einer Unterpunktung mindestens 130 Punkte, bei zweien mindestens 156 (bei 420 Punkten: 140 und 168). Mündlich Englisch ist Pflicht. Seminar mit 0 Punkten bedeutet nicht bestanden.</li>` : ''}
          <li>Ein Fachreferat gibt es ab 01.08.2026 nicht mehr (Verordnung vom 19.06.2026).</li>
        </ul>
        <p class="hinweis">Rechtsgrundlage: FOBOSO, Fassung ab 01.08.2026. Ohne Gewähr. Verbindlich sind die Festsetzungen deiner Schule.</p>
      </section>`}`;
  }

  // ---------- Dialoge ----------
  function gewichtAuswahl(wert) {
    return `
      <div class="feld">Gewichtung
        <div class="gewicht-chips">
          ${GEWICHT_CHIPS.map((g) => `<button type="button" class="chip-klein${Math.abs(g - wert) < 1e-9 ? ' aktiv' : ''}" data-action="gewicht" data-g="${g}">×${fmt(g)}</button>`).join('')}
          <input type="number" id="n-gewicht" min="0.25" max="10" step="0.25" inputmode="decimal" value="${esc(wert)}" aria-label="Eigene Gewichtung">
        </div>
      </div>`;
  }

  // Notenmodus: Note 1–6 mit Tendenz (+, glatt, −) bzw. Punkte 15–0
  function notenVorschau(basis, tendenz) {
    if (!basis) return 'Tipp eine Note an.';
    const s = system();
    const label = Realschule.noteLabel(`${basis}${tendenz}`);
    const w = Realschule.noteWert(label, s.tendenz);
    return `${Realschule.anzeige(label)} zählt als ${fmt(w)}${tendenz && !s.tendenz ? ' (Tendenzen sind aus)' : ''}`;
  }

  function dialogNoteNoten(fach, note) {
    const neu = !note;
    const s = system();
    const punkte = s.skala === 'punkte';
    const hjs = Realschule.halbjahreDesFachs(fach);
    const ansicht = ui.hjAnsicht || aktiverZeitraum();
    const { klasse, teil } = Realschule.zeitraumTeile(ansicht);
    const standardHj = teil === 'J' ? aktuellesHJ(klasse) : `${klasse}_${teil}`;
    const hj = note ? note.hj : hjs.includes(standardHj) ? standardHj : hjs[0] || standardHj;
    if (!hjs.includes(hj)) hjs.push(hj);
    const mehrereKlassen = new Set(hjs.map((h) => h.split('_')[0])).size > 1;
    const art = note ? note.art : fach.schulaufgaben && !(fach.noten || []).some((n) => n.hj === hj && Realschule.istGross(n.art)) ? 'sa' : 'stegreif';
    const gewicht = note ? Realschule.eigenesGewicht(note) ?? Realschule.standardGewicht(note.art, s) : Realschule.standardGewicht(art, s);
    const prozent = (fach.gewichtung && fach.gewichtung.modus === 'anteil') || s.gewichtung === 'prozent';

    let auswahl;
    if (punkte) {
      const p = note && Number.isFinite(note.punkte) ? note.punkte : null;
      auswahl = `
        <div class="feld">Punkte
          <div class="punkte-raster" role="radiogroup">
            ${Array.from({ length: 16 }, (_, i) => 15 - i).map((x) => `<button type="button" class="punkt farbig${x === p ? ' gewaehlt' : ''}" style="${hStyle(x)}" data-action="punkt" data-p="${x}" role="radio" aria-checked="${x === p}">${x}<small>${Calc.noteAusPunkten(x)}</small></button>`).join('')}
          </div>
          <input type="hidden" id="n-punkte" value="${p ?? ''}">
        </div>`;
    } else {
      const label = note ? Realschule.noteLabel(note.note) : null;
      const basis = label ? Realschule.notenStufe(label) : null;
      const tendenz = label && /[+-]$/.test(label) ? label.slice(-1) : '';
      const tBtn = (t, text) => `<button type="button" class="chip-klein${t === tendenz ? ' aktiv' : ''}" data-action="note-tendenz" data-t="${t}" ${(t === '+' && basis === 1) || (t === '-' && basis === 6) ? 'disabled' : ''}>${text}</button>`;
      auswahl = `
        <div class="feld">Note
          <div class="noten-raster" role="radiogroup" aria-label="Note">
            ${[1, 2, 3, 4, 5, 6].map((g) => `<button type="button" class="note-btn farbig${g === basis ? ' gewaehlt' : ''}" style="${hStyle(Realschule.farbPunkte(g))}" data-action="note-basis" data-n="${g}" role="radio" aria-checked="${g === basis}" title="${STUFE_NAME[g]}">${g}</button>`).join('')}
          </div>
          <div class="tendenz-reihe" role="radiogroup" aria-label="Tendenz">${tBtn('+', 'plus (+)')}${tBtn('', 'glatt')}${tBtn('-', 'minus (−)')}</div>
          <p class="noten-vorschau" id="n-vorschau">${esc(notenVorschau(basis, tendenz))}</p>
          <input type="hidden" id="n-basis" value="${basis ?? ''}">
          <input type="hidden" id="n-tendenz" value="${tendenz}">
        </div>`;
    }

    return `
      <form method="dialog" class="dialog-inhalt" data-form="note" data-fach="${esc(fach.id)}" data-note="${note ? esc(note.id) : ''}">
        <h2>${neu ? 'Note hinzufügen' : 'Note bearbeiten'}</h2>
        <p class="hinweis">${esc(fach.name)}</p>
        <label class="feld">Art
          <select id="n-art">${Realschule.NOTENARTEN.map((n) => `<option value="${n.id}" ${n.id === art ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select>
        </label>
        ${auswahl}
        ${gewichtAuswahl(gewicht)}
        ${prozent ? '<p class="hinweis">Prozent-Aufteilung: Das Gewicht gilt innerhalb der Schulaufgaben bzw. der kleinen Noten.</p>' : ''}
        <div class="feld-reihe">
          <label class="feld">Halbjahr
            <select id="n-hj">${hjs.map((h) => `<option value="${h}" ${h === hj ? 'selected' : ''}>${Realschule.zeitraumLabel(h, true, mehrereKlassen)}</option>`).join('')}</select>
          </label>
          <label class="feld">Datum<input type="date" id="n-datum" value="${esc(note ? note.datum || '' : heute())}"></label>
        </div>
        <label class="feld">Notiz<input type="text" id="n-notiz" maxlength="80" placeholder="z. B. Thema" value="${esc(note ? note.notiz || '' : '')}"></label>
        <p class="fehler" id="n-fehler" hidden>${punkte ? 'Bitte Punkte auswählen.' : 'Bitte eine Note auswählen.'}</p>
        <div class="btn-reihe ende">
          ${neu ? '' : '<button type="button" class="btn gefahr" data-action="note-loeschen" data-confirm="Wirklich löschen?">Löschen</button>'}
          <button type="button" class="btn sekundaer" data-action="dialog-zu">Abbrechen</button>
          <button type="button" class="btn primaer" data-action="note-speichern">Speichern</button>
        </div>
      </form>`;
  }

  function dialogNote(fach, note) {
    if (notenModus()) return dialogNoteNoten(fach, note);
    const neu = !note;
    const hjs = Calc.halbjahreDesFachs(fach);
    const hj = note ? note.hj : ui.hjAnsicht || hjs[0];
    const art = note ? note.art : fach.schulaufgaben && !(fach.noten || []).some((n) => n.hj === hj && n.art === 'sa') ? 'sa' : 'stegreif';
    const gewicht = note ? note.gewicht ?? 1 : state.einstellungen.gewichte[art] ?? 1;
    const punkte = note ? note.punkte : null;
    return `
      <form method="dialog" class="dialog-inhalt" data-form="note" data-fach="${esc(fach.id)}" data-note="${note ? esc(note.id) : ''}">
        <h2>${neu ? 'Note hinzufügen' : 'Note bearbeiten'}</h2>
        <p class="hinweis">${esc(fach.name)}</p>
        <label class="feld">Art
          <select id="n-art">${NOTENARTEN.map((n) => `<option value="${n.id}" ${n.id === art ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select>
        </label>
        <div class="feld">Punkte
          <div class="punkte-raster" role="radiogroup">
            ${Array.from({ length: 16 }, (_, i) => 15 - i).map((p) => `<button type="button" class="punkt farbig${p === punkte ? ' gewaehlt' : ''}" style="${hStyle(p)}" data-action="punkt" data-p="${p}" role="radio" aria-checked="${p === punkte}">${p}<small>${Calc.noteAusPunkten(p)}</small></button>`).join('')}
          </div>
          <input type="hidden" id="n-punkte" value="${punkte ?? ''}">
        </div>
        ${gewichtAuswahl(gewicht)}
        <div class="feld-reihe">
          <label class="feld">Halbjahr
            <select id="n-hj">${hjs.map((h) => `<option value="${h}" ${h === hj ? 'selected' : ''}>${Calc.HJ_LABEL[h]}</option>`).join('')}</select>
          </label>
          <label class="feld">Datum<input type="date" id="n-datum" value="${esc(note ? note.datum || '' : heute())}"></label>
        </div>
        <label class="feld">Notiz<input type="text" id="n-notiz" maxlength="80" placeholder="z. B. Thema" value="${esc(note ? note.notiz || '' : '')}"></label>
        <p class="fehler" id="n-fehler" hidden>Bitte Punkte auswählen.</p>
        <div class="btn-reihe ende">
          ${neu ? '' : '<button type="button" class="btn gefahr" data-action="note-loeschen" data-confirm="Wirklich löschen?">Löschen</button>'}
          <button type="button" class="btn sekundaer" data-action="dialog-zu">Abbrechen</button>
          <button type="button" class="btn primaer" data-action="note-speichern">Speichern</button>
        </div>
      </form>`;
  }

  function dialogFachNoten(fach) {
    const rs = istRS();
    const g = fach.gewichtung || { modus: 'standard', saAnteil: 50 };
    const jgs = Realschule.jahrgaengeDesFachs(fach).map(String);
    const klassen = rs ? klassenBereich(5, 10) : [...new Set(jgs.concat([String(state.klasse)]))].sort((a, b) => a - b);
    const iiib = rs && state.gruppe === 'IIIb';
    const vorr = Realschule.istVorrueckungsfach(fach, state.gruppe);
    return `
      <form method="dialog" class="dialog-inhalt" data-form="fach" data-fach="${esc(fach.id)}">
        <h2>Fach bearbeiten</h2>
        <label class="feld">Name<input type="text" id="f-name" maxlength="60" value="${esc(fach.name)}"></label>
        ${rs ? `<label class="schalter"><input type="checkbox" id="f-wpf" ${fach.wpf ? 'checked' : ''}> Wahlpflichtfach (Profilfach deiner Gruppe)</label>` : ''}
        ${iiib ? `<label class="feld" id="f-vorlage-feld" ${fach.wpf ? '' : 'hidden'}>Profilfach aus Liste wählen
          <select id="f-profil">
            <option value="">– eigener Name –</option>
            ${Realschule.PROFIL_IIIB.map((n) => `<option value="${esc(n)}" ${n === fach.name ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </label>` : ''}
        <div class="feld">Farbe
          <div class="farben">
            ${Presets.FARBEN.map((c) => `<button type="button" class="farbe${c === fach.farbe ? ' gewaehlt' : ''}" style="background:${c}" data-action="farbe" data-farbe="${c}" aria-label="Farbe ${c}"></button>`).join('')}
            <label class="farbe frei" title="Eigene Farbe"><input type="color" id="f-farbe-frei" value="${esc(fach.farbe)}" aria-label="Eigene Farbe wählen"></label>
          </div>
          <input type="hidden" id="f-farbe" value="${esc(fach.farbe)}">
        </div>
        <div class="feld">Unterrichtet in Klasse
          <div class="schalter-reihe">
            ${klassen.map((k) => `<label class="schalter"><input type="checkbox" class="f-jg" data-k="${k}" ${jgs.includes(k) ? 'checked' : ''}> ${k}.</label>`).join('')}
          </div>
        </div>
        ${rs ? `<label class="schalter"><input type="checkbox" id="f-vorr" ${vorr ? 'checked' : ''}> Vorrückungsfach (zählt fürs Vorrücken und Bestehen)</label>
        <label class="schalter"><input type="checkbox" id="f-pruef" ${fach.pruefungsfach ? 'checked' : ''}> Prüfungsfach Realschulabschluss (10. Klasse)</label>
        <label class="schalter" id="f-prakt-feld" ${fach.pruefungsfach ? '' : 'hidden'}><input type="checkbox" id="f-prakt" ${fach.praktischePruefung ? 'checked' : ''}> Mit praktischer Prüfung (Kunst, Werken, Ernährung und Gesundheit)</label>` : ''}
        <label class="schalter"><input type="checkbox" id="f-sa" ${fach.schulaufgaben ? 'checked' : ''}> Fach hat Schulaufgaben</label>
        <div class="feld">Berechnung der Zeugnisnote
          <select id="f-modus">
            <option value="standard" ${g.modus !== 'anteil' ? 'selected' : ''}>Wie im Notensystem (Einstellungen)</option>
            <option value="anteil" ${g.modus === 'anteil' ? 'selected' : ''}>Eigene Aufteilung in Prozent</option>
          </select>
          <small class="hinweis">Eigene Aufteilung: Du legst fest, wie viel Prozent die Schulaufgaben insgesamt ausmachen. Der Rest sind die kleinen Noten.</small>
        </div>
        <label class="feld" id="f-anteil-feld" ${g.modus === 'anteil' ? '' : 'hidden'}>Anteil Schulaufgaben in %
          <input type="number" id="f-anteil" min="0" max="100" step="1" inputmode="numeric" value="${esc(g.saAnteil ?? 50)}">
        </label>
        <div class="btn-reihe ende">
          <button type="button" class="btn gefahr" data-action="fach-loeschen" data-confirm="Fach mit allen Noten löschen?">Löschen</button>
          <button type="button" class="btn sekundaer" data-action="dialog-zu">Abbrechen</button>
          <button type="button" class="btn primaer" data-action="fach-speichern">Speichern</button>
        </div>
      </form>`;
  }

  function dialogFach(fach) {
    if (notenModus()) return dialogFachNoten(fach);
    const g = fach.gewichtung || { modus: 'fobos', saAnteil: 50 };
    const jg = fach.jahrgaenge || {};
    const zeigeAbi = hat13() || jg[13];
    return `
      <form method="dialog" class="dialog-inhalt" data-form="fach" data-fach="${esc(fach.id)}">
        <h2>Fach bearbeiten</h2>
        <label class="feld">Name<input type="text" id="f-name" maxlength="60" value="${esc(fach.name)}"></label>
        <label class="schalter"><input type="checkbox" id="f-wpf" ${fach.wpf ? 'checked' : ''}> Wahlpflichtfach</label>
        <label class="feld" id="f-vorlage-feld" ${fach.wpf ? '' : 'hidden'}>Wahlpflichtfach aus Liste wählen
          <select id="f-vorlage">
            <option value="">– eigener Name –</option>
            ${Presets.WAHLPFLICHTFAECHER.map((w, i) => `<option value="${i}" ${w.name === fach.name ? 'selected' : ''}>${esc(w.name)}${w.e ? '' : ' (zählt nicht)'}</option>`).join('')}
          </select>
        </label>
        <div class="feld">Farbe
          <div class="farben">
            ${Presets.FARBEN.map((c) => `<button type="button" class="farbe${c === fach.farbe ? ' gewaehlt' : ''}" style="background:${c}" data-action="farbe" data-farbe="${c}" aria-label="Farbe ${c}"></button>`).join('')}
            <label class="farbe frei" title="Eigene Farbe"><input type="color" id="f-farbe-frei" value="${esc(fach.farbe)}" aria-label="Eigene Farbe wählen"></label>
          </div>
          <input type="hidden" id="f-farbe" value="${esc(fach.farbe)}">
        </div>
        <div class="feld">Unterrichtet in
          <div class="schalter-reihe">
            <label class="schalter"><input type="checkbox" id="f-jg11" ${jg[11] ? 'checked' : ''}> 11.</label>
            <label class="schalter"><input type="checkbox" id="f-jg12" ${jg[12] ? 'checked' : ''}> 12.</label>
            <label class="schalter"><input type="checkbox" id="f-jg13" ${jg[13] ? 'checked' : ''}> 13.</label>
          </div>
        </div>
        <label class="schalter"><input type="checkbox" id="f-pruef" ${fach.pruefungsfach ? 'checked' : ''}> Prüfungsfach Fachabitur (zählt dreifach)</label>
        <label class="schalter" ${zeigeAbi ? '' : 'hidden'}><input type="checkbox" id="f-pruef-abi" ${fach.pruefungsfachAbi ? 'checked' : ''}> Prüfungsfach Abitur (zählt doppelt)</label>
        <label class="schalter"><input type="checkbox" id="f-einbr" ${fach.einbringbar !== false ? 'checked' : ''}> Zählt fürs Fachabi/Abitur (Sport, Kunst, Musik, Studier- und Arbeitstechniken, Szenisches Gestalten nicht)</label>
        <label class="schalter"><input type="checkbox" id="f-sa" ${fach.schulaufgaben ? 'checked' : ''}> Fach hat Schulaufgaben</label>
        <div class="feld">Berechnung Halbjahresergebnis
          <select id="f-modus">
            <option value="fobos" ${g.modus !== 'anteil' ? 'selected' : ''}>Gesetzlich (§ 21 FOBOSO)</option>
            <option value="anteil" ${g.modus === 'anteil' ? 'selected' : ''}>Eigene Aufteilung in Prozent</option>
          </select>
          <small class="hinweis">Gesetzlich: Jede Schulaufgabe zählt so viel wie der Schnitt der kleinen Noten. Eigene Aufteilung: Du legst fest, wie viel Prozent die Schulaufgaben insgesamt ausmachen.</small>
        </div>
        <label class="feld" id="f-anteil-feld" ${g.modus === 'anteil' ? '' : 'hidden'}>Anteil Schulaufgaben in %
          <input type="number" id="f-anteil" min="0" max="100" step="1" inputmode="numeric" value="${esc(g.saAnteil ?? 50)}">
        </label>
        <div class="btn-reihe ende">
          <button type="button" class="btn gefahr" data-action="fach-loeschen" data-confirm="Fach mit allen Noten löschen?">Löschen</button>
          <button type="button" class="btn sekundaer" data-action="dialog-zu">Abbrechen</button>
          <button type="button" class="btn primaer" data-action="fach-speichern">Speichern</button>
        </div>
      </form>`;
  }

  // Neues Schuljahr: wählbare Klassen wie in „Abschluss und Klasse“
  const schuljahrKlassen = () => (istRS() ? klassenBereich(5, 10) : notenModus() ? klassenBereich(1, 13) : ['11', '12', '13']);
  // Realschule ab Klasse 7: Wahlpflichtfächergruppe nötig, falls noch keine gewählt ist
  const brauchtGruppe = () => istRS() && (!state.gruppe || state.gruppe === 'keine');

  function dialogSchuljahr() {
    const klassen = schuljahrKlassen();
    const vorschlag = String(Math.min(klasseNr() + 1, Number(klassen[klassen.length - 1])));
    let hinweis = 'Im neuen Schuljahr startest du ohne Noten. Deine Fächer bleiben.';
    if (!notenModus()) hinweis = 'Deine Noten aus der 11. und 12. bleiben erhalten, weil sie für das Fachabi bzw. Abitur zählen.';
    else if (istRS() && klasseNr() === 10) hinweis += ' Nach der 10. Klasse auf die FOS? Dann tipp auf „Aktuelles Schuljahr archivieren“ und wechsle danach den Abschluss.';
    return `
      <form method="dialog" class="dialog-inhalt" data-form="schuljahr">
        <h2>Neues Schuljahr beginnen</h2>
        <p class="hinweis">Zuerst kommt eine Kopie deiner Noten ins Archiv. Dort kannst du sie weiter ansehen.</p>
        <label class="feld">Name im Archiv<input type="text" id="sj-name" maxlength="60" value="${esc(`Klasse ${state.klasse} · ${altesSchuljahr()}`)}"></label>
        <label class="feld">Neue Klasse
          <select id="sj-klasse">${optionen(klassen.map((k) => [k, `${k}. Klasse`]), vorschlag)}</select>
        </label>
        ${brauchtGruppe() ? `<label class="feld" id="sj-gruppe-feld" ${Number(vorschlag) >= 7 ? '' : 'hidden'}>Wahlpflichtfächergruppe
          <select id="sj-gruppe">${gruppenOptionen('', true)}</select>
        </label>` : ''}
        <p class="hinweis">${hinweis}</p>
        <p class="fehler" id="sj-fehler" hidden></p>
        <div class="btn-reihe ende">
          <button type="button" class="btn sekundaer" data-action="dialog-zu">Abbrechen</button>
          <button type="button" class="btn primaer" data-action="schuljahr-starten">Neues Schuljahr beginnen</button>
        </div>
      </form>`;
  }

  /** Aktiven Stand auf die neue Klasse umstellen (die Kopie liegt schon im Archiv). */
  function neuesSchuljahrSetzen(klasse, gruppe) {
    const k = String(klasse);
    if (notenModus()) {
      // Realschule, andere Schule: Fächer übernehmen, Noten, Zeugniswerte und Prüfungen leeren
      if (istRS()) state.gruppe = gruppe;
      const faecher = istRS() ? Realschule.klasseErgaenzen(state.faecher, state.gruppe, k) : Realschule.klasseUebernehmen(state.faecher, k);
      const abKlasse = (jg) => Object.fromEntries(Object.entries(jg || {}).filter(([j, an]) => an && Number(j) >= Number(k)));
      state.faecher = faecher.filter((f) => Realschule.unterrichtetIn(f, k)).map((f) => {
        const neu = { ...f, jahrgaenge: abKlasse(f.jahrgaenge), noten: [], zeugnis: {} };
        if (f.pruefung) neu.pruefung = { schriftlich: null, muendlich: null, praktisch: null };
        return neu;
      });
    } else {
      // FOS: Noten bleiben (Fachabi/Abitur zählen mehrere Jahrgänge), nur Klasse und Halbjahr umstellen
      if (k === '13' && state.abschluss === 'fachabi') state.abschluss = 'abitur';
      if (k === '13' && !state.faecher.some((f) => f.jahrgaenge && f.jahrgaenge[13])) state.faecher = Presets.dreizehnErgaenzen(state.faecher, state.richtung);
    }
    state.klasse = k;
    state.aktivesHJ = `${k}_1`;
  }

  function uiZuruecksetzen(tab) {
    ui.tab = tab;
    ui.fachId = null;
    ui.zielHJ = {};
    ui.statHJ = 'alle';
    ui.abschluss = null;
    ui.hjAnsicht = null;
  }

  // Archiv ansehen: Bearbeiten-Knöpfe weglassen, Notenzeilen nicht antippbar, Eingabefelder deaktiviert
  function nurLesen(html) {
    return html
      .replace(/<button[^>]*data-action="(?:fach-neu|note-neu|fach-einstellungen)"[^>]*>[^<]*<\/button>/g, '')
      .replace(/<button class="noten-zeile" data-action="note-bearbeiten"[^>]*>([\s\S]*?)<\/button>/g, '<div class="noten-zeile">$1</div>')
      .replace(/<(input|select)(?![^>]*data-bind="zielhj")([^>]*data-bind=[^>]*)>/g, '<$1$2 disabled>');
  }

  const archivBalken = () => `
      <section class="archiv-balken" role="status">
        <span>Archiv: <b>${esc(ui.archiv.name)}</b> – nur ansehen</span>
        <button class="btn primaer" data-action="archiv-zurueck">Zurück zum aktuellen Schuljahr</button>
      </section>`;

  function dialogOeffnen(html) {
    const d = $('#dialog');
    d.innerHTML = html;
    if (!d.open) d.showModal();
  }
  function dialogSchliessen() {
    const d = $('#dialog');
    if (d.open) d.close();
  }

  // ---------- Render ----------
  function render() {
    themeAnwenden();
    let html;
    const nm = notenModus();
    let titel = nm || (!state.abschluss && !state.richtung) ? 'Notenrechner' : 'Fachabi-Rechner';
    let fachFarbe = null;
    if (ui.tab === 'faecher' && ui.fachId) {
      const f = fachById(ui.fachId);
      if (f) { html = viewFach(f); titel = f.name; fachFarbe = f.farbe; } else { ui.fachId = null; html = viewFaecher(); }
    } else if (ui.tab === 'abschluss') { html = viewAbschluss(); titel = nm ? zeugnisTab() : abschlussName(abschlussArt()); }
    else if (ui.tab === 'statistik') { html = viewStatistik(); titel = 'Statistik'; }
    else if (ui.tab === 'einstellungen') { html = viewEinstellungen(); titel = 'Einstellungen'; }
    else html = viewFaecher();
    if (archivAnsicht()) html = archivBalken() + nurLesen(html);
    $('#main').innerHTML = html;
    $('#titel').textContent = titel;
    $('#titel').style.borderLeftColor = fachFarbe || 'transparent';
    $('#titel').classList.toggle('mit-farbe', !!fachFarbe);
    $('#nav-abschluss-text').textContent = nm ? zeugnisTab() : state.klasse === '13' ? 'Abitur' : 'Fachabi';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('aktiv', b.dataset.tab === ui.tab));
  }

  // ---------- Aktionen ----------
  function bestaetigt(btn) {
    if (!btn.dataset.confirm || btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.dataset.text = btn.textContent;
    btn.textContent = btn.dataset.confirm;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.text; } }, 4000);
    return false;
  }

  function fachVerschieben(id, richtung) {
    const i = state.faecher.findIndex((f) => f.id === id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= state.faecher.length) return;
    aendern(() => { [state.faecher[i], state.faecher[j]] = [state.faecher[j], state.faecher[i]]; });
  }

  // Notenmodus: Note speichern. Gewicht nur speichern, wenn es vom Standard der Notenart abweicht.
  function noteSpeichernNoten(form, f) {
    const s = system();
    let wert;
    if (s.skala === 'punkte') {
      const p = zahlAus($('#n-punkte').value, 0, 15);
      if (p === null) { $('#n-fehler').hidden = false; return; }
      wert = { punkte: p };
    } else {
      const b = zahlAus($('#n-basis').value, 1, 6);
      if (b === null) { $('#n-fehler').hidden = false; return; }
      wert = { note: Realschule.noteLabel(`${b}${$('#n-tendenz').value}`) };
    }
    const art = $('#n-art').value;
    const g = zahlAus($('#n-gewicht').value, 0.25, 10, false);
    const prozent = (f.gewichtung && f.gewichtung.modus === 'anteil') || s.gewichtung === 'prozent';
    const std = prozent ? 1 : Realschule.standardGewicht(art, s);
    const daten = {
      art,
      ...wert,
      gewicht: g === null || Math.abs(g - std) < 1e-9 ? null : g,
      hj: $('#n-hj').value,
      datum: $('#n-datum').value,
      notiz: $('#n-notiz').value.trim(),
    };
    aendern(() => {
      f.noten = f.noten || [];
      const id = form.dataset.note;
      const vorhanden = id && f.noten.find((n) => n.id === id);
      if (vorhanden) {
        Object.assign(vorhanden, daten);
        if (s.skala === 'punkte') delete vorhanden.note; else delete vorhanden.punkte;
      } else f.noten.push({ id: Presets.neueId(), ...daten });
      // Ansicht „Jahr“ bleibt, sonst zum Halbjahr der Note wechseln
      if (!aktiverZeitraum().endsWith('_J') && zeitraeume().includes(daten.hj)) state.aktivesHJ = daten.hj;
    });
    dialogSchliessen();
  }

  const aktionen = {
    tab(btn) {
      ui.tab = btn.dataset.tab;
      ui.fachId = null;
      if (btn.dataset.art) ui.abschluss = btn.dataset.art;
      render();
      window.scrollTo(0, 0);
    },
    hj(btn) {
      // Im Archiv nur die Anzeige umschalten (die Kopie wird nicht gespeichert)
      if (archivAnsicht()) { state.aktivesHJ = btn.dataset.hj; render(); return; }
      aendern(() => { state.aktivesHJ = btn.dataset.hj; });
    },
    abschluss(btn) { ui.abschluss = btn.dataset.art; render(); },
    'stat-hj'(btn) { ui.statHJ = btn.dataset.hj; render(); },
    'fach-oeffnen'(btn) { ui.fachId = btn.dataset.id; render(); window.scrollTo(0, 0); },
    zurueck() { ui.fachId = null; render(); },
    onboarding() {
      const wahl = document.querySelector('input[name="ob-abschluss"]:checked');
      const fehler = (text) => { const p = $('#ob-fehler'); p.textContent = text; p.hidden = false; };
      if (!wahl) { fehler('Bitte wähle deinen Abschluss.'); return; }
      const abschluss = wahl.value;
      const ns = state.einstellungen.notensystem;
      if (abschluss === 'realschule') {
        const klasse = $('#ob-rs-klasse').value;
        const gruppe = Number(klasse) <= 6 ? 'keine' : $('#ob-gruppe').value;
        if (!gruppe) { fehler('Bitte wähle deine Wahlpflichtfächergruppe.'); return; }
        aendern(() => {
          state.abschluss = 'realschule';
          state.klasse = klasse;
          state.gruppe = gruppe;
          state.faecher = Realschule.faecherFuer(gruppe, klasse);
          state.aktivesHJ = aktuellesHJ(klasse);
          state.einstellungen.notensystem = Realschule.systemNormalisieren({ ...ns, skala: 'noten' });
        });
      } else if (abschluss === 'andere') {
        const klasse = $('#ob-andere-klasse').value;
        const skala = $('#ob-skala').value;
        aendern(() => {
          state.abschluss = 'andere';
          state.klasse = klasse;
          state.faecher = $('#ob-faecher').value === 'leer' ? [] : Realschule.standardFaecher(klasse);
          state.aktivesHJ = aktuellesHJ(klasse);
          state.einstellungen.notensystem = Realschule.systemNormalisieren({ ...ns, skala, rundung: undefined });
        });
      } else {
        // FOS: Fächer wie bisher nach Stundentafel, Abitur mit der 13. Klasse
        const r = $('#ob-richtung').value;
        const klasse = $('#ob-klasse').value;
        aendern(() => {
          state.abschluss = abschluss;
          state.richtung = r;
          state.klasse = klasse;
          state.faecher = Presets.faecherFuer(r, abschluss === 'abitur' ? 13 : Number(klasse));
          state.aktivesHJ = aktuellesHJ(klasse);
        });
      }
      toast(state.faecher.length ? 'Fächer angelegt' : 'Leg jetzt deine Fächer an');
    },
    'note-basis'(btn) {
      const b = Number(btn.dataset.n);
      $('#n-basis').value = b;
      let t = $('#n-tendenz').value;
      if ((t === '+' && b === 1) || (t === '-' && b === 6)) { t = ''; $('#n-tendenz').value = ''; }
      document.querySelectorAll('.note-btn').forEach((x) => {
        const an = x === btn;
        x.classList.toggle('gewaehlt', an);
        x.setAttribute('aria-checked', String(an));
      });
      document.querySelectorAll('[data-action="note-tendenz"]').forEach((x) => {
        x.disabled = (x.dataset.t === '+' && b === 1) || (x.dataset.t === '-' && b === 6);
        x.classList.toggle('aktiv', x.dataset.t === t);
      });
      $('#n-vorschau').textContent = notenVorschau(b, t);
      $('#n-fehler').hidden = true;
    },
    'note-tendenz'(btn) {
      const t = btn.dataset.t || '';
      $('#n-tendenz').value = t;
      document.querySelectorAll('[data-action="note-tendenz"]').forEach((x) => x.classList.toggle('aktiv', x === btn));
      $('#n-vorschau').textContent = notenVorschau(Number($('#n-basis').value) || null, t);
    },
    'klasse-ergaenzen'() {
      aendern(() => {
        state.faecher = istRS() ? Realschule.klasseErgaenzen(state.faecher, state.gruppe, state.klasse) : Realschule.klasseUebernehmen(state.faecher, state.klasse);
      });
      toast(istRS() ? `Fächer der ${state.klasse}. Klasse ergänzt` : 'Fächer übernommen');
    },
    'fach-neu'() {
      if (notenModus()) {
        const fn = Realschule.leeresFach('Neues Fach', state.faecher.length, state.klasse);
        aendern(() => { state.faecher.push(fn); });
        if (ui.tab === 'faecher') { ui.fachId = fn.id; render(); }
        dialogOeffnen(dialogFach(fn));
        return;
      }
      const f = Presets.leeresFach('Neues Fach', state.faecher.length);
      const k = state.aktivesHJ.slice(0, 2);
      f.jahrgaenge = { 11: k === '11', 12: k === '12', 13: k === '13' };
      aendern(() => { state.faecher.push(f); });
      if (ui.tab === 'faecher') { ui.fachId = f.id; render(); }
      dialogOeffnen(dialogFach(f));
    },
    'fach-einstellungen'(btn) { const f = fachById(btn.dataset.id); if (f) dialogOeffnen(dialogFach(f)); },
    'fach-hoch'(btn) { fachVerschieben(btn.dataset.id, -1); },
    'fach-runter'(btn) { fachVerschieben(btn.dataset.id, 1); },
    farbe(btn) {
      $('#f-farbe').value = btn.dataset.farbe;
      $('#f-farbe-frei').value = btn.dataset.farbe;
      document.querySelectorAll('.farbe').forEach((b) => b.classList.toggle('gewaehlt', b === btn));
    },
    'fach-speichern'(btn) {
      const f = fachById(btn.closest('form').dataset.fach);
      if (!f) return;
      if (notenModus()) {
        aendern(() => {
          f.name = $('#f-name').value.trim() || 'Fach';
          f.farbe = $('#f-farbe').value;
          const jg = { ...(f.jahrgaenge || {}) };
          document.querySelectorAll('.f-jg').forEach((el) => { jg[el.dataset.k] = el.checked; });
          f.jahrgaenge = jg;
          if (istRS()) {
            f.wpf = $('#f-wpf').checked;
            f.vorrueckungsfach = $('#f-vorr').checked;
            f.pruefungsfach = $('#f-pruef').checked;
            f.praktischePruefung = f.pruefungsfach && $('#f-prakt').checked;
            f.pruefung = f.pruefung || { schriftlich: null, muendlich: null, praktisch: null };
          }
          f.schulaufgaben = $('#f-sa').checked;
          f.gewichtung = { modus: $('#f-modus').value === 'anteil' ? 'anteil' : 'standard', saAnteil: zahlAus($('#f-anteil').value, 0, 100, false) ?? 50 };
        });
        dialogSchliessen();
        toast('Gespeichert');
        return;
      }
      aendern(() => {
        f.name = $('#f-name').value.trim() || 'Fach';
        f.farbe = $('#f-farbe').value;
        f.wpf = $('#f-wpf').checked;
        f.jahrgaenge = { 11: $('#f-jg11').checked, 12: $('#f-jg12').checked, 13: $('#f-jg13').checked };
        f.pruefungsfach = $('#f-pruef').checked;
        f.pruefungsfachAbi = $('#f-pruef-abi').checked;
        f.einbringbar = $('#f-einbr').checked;
        f.schulaufgaben = $('#f-sa').checked;
        f.gewichtung = { modus: $('#f-modus').value, saAnteil: zahlAus($('#f-anteil').value, 0, 100, false) ?? 50 };
        if (!f.pruefungAbi) f.pruefungAbi = { schriftlich: null, muendlich: null };
      });
      dialogSchliessen();
      toast('Gespeichert');
    },
    'fach-loeschen'(btn) {
      if (!bestaetigt(btn)) return;
      const id = btn.closest('form').dataset.fach;
      dialogSchliessen();
      if (ui.fachId === id) ui.fachId = null;
      aendern(() => {
        state.faecher = state.faecher.filter((f) => f.id !== id);
        for (const art of ARTEN) { delete state.gestrichen[art][id]; delete state.behalten[art][id]; }
      });
      toast('Fach gelöscht');
    },
    'note-neu'() { const f = fachById(ui.fachId); if (f) dialogOeffnen(dialogNote(f, null)); },
    'note-bearbeiten'(btn) {
      const f = fachById(ui.fachId);
      const n = f && (f.noten || []).find((x) => x.id === btn.dataset.id);
      if (n) dialogOeffnen(dialogNote(f, n));
    },
    punkt(btn) {
      $('#n-punkte').value = btn.dataset.p;
      document.querySelectorAll('.punkt').forEach((b) => {
        const an = b === btn;
        b.classList.toggle('gewaehlt', an);
        b.setAttribute('aria-checked', String(an));
      });
      $('#n-fehler').hidden = true;
    },
    gewicht(btn) {
      $('#n-gewicht').value = btn.dataset.g;
      document.querySelectorAll('.chip-klein').forEach((b) => b.classList.toggle('aktiv', b === btn));
    },
    'note-speichern'(btn) {
      const form = btn.closest('form');
      const f = fachById(form.dataset.fach);
      if (!f) return;
      if (notenModus()) { noteSpeichernNoten(form, f); return; }
      const punkte = zahlAus($('#n-punkte').value, 0, 15);
      if (punkte === null) { $('#n-fehler').hidden = false; return; }
      const daten = {
        art: $('#n-art').value,
        punkte,
        gewicht: zahlAus($('#n-gewicht').value, 0.25, 10, false) ?? 1,
        hj: $('#n-hj').value,
        datum: $('#n-datum').value,
        notiz: $('#n-notiz').value.trim(),
      };
      aendern(() => {
        f.noten = f.noten || [];
        const id = form.dataset.note;
        const vorhanden = id && f.noten.find((n) => n.id === id);
        if (vorhanden) Object.assign(vorhanden, daten);
        else f.noten.push({ id: Presets.neueId(), ...daten });
        state.aktivesHJ = daten.hj;
      });
      dialogSchliessen();
    },
    'note-loeschen'(btn) {
      if (!bestaetigt(btn)) return;
      const form = btn.closest('form');
      const f = fachById(form.dataset.fach);
      dialogSchliessen();
      aendern(() => { f.noten = (f.noten || []).filter((n) => n.id !== form.dataset.note); });
      toast('Note gelöscht');
    },
    'dialog-zu'() { dialogSchliessen(); },
    // „Streichen“ an: Gestrichenes antippen = „soll zählen“, Ungestrichenes = streichen (Regeln in calc.js)
    'streich-tipp'(btn) {
      const { art, id, hj } = btn.dataset;
      let r = null;
      aendern(() => { r = Calc.streichTippen(state, art, id, hj); });
      if (r && r.meldung) toast(r.meldung);
    },
    'faecher-neu-anlegen'(btn) {
      if (!bestaetigt(btn)) return;
      if (!notenModus() && !state.richtung) { toast('Wähle zuerst die Ausbildungsrichtung.'); return; }
      aendern(() => {
        if (istRS()) state.faecher = Realschule.faecherFuer(state.gruppe, state.klasse);
        else if (notenModus()) state.faecher = Realschule.standardFaecher(state.klasse);
        else state.faecher = Presets.faecherFuer(state.richtung, state.abschluss === 'abitur' ? 13 : Number(state.klasse));
        state.gestrichen = { fachabi: {}, abitur: {} };
        state.behalten = { fachabi: {}, abitur: {} };
      });
      toast('Fächer neu angelegt');
    },
    'dreizehn-ergaenzen'() {
      aendern(() => {
        state.faecher = Presets.dreizehnErgaenzen(state.faecher, state.richtung);
        state.aktivesHJ = aktuellesHJ(state.klasse); // bisher nur in Klasse 13 sichtbar; Abitur in 11/12 bleibt in der Klasse
      });
      toast('Fächer der 13. Klasse ergänzt');
    },
    'schuljahr-neu'() { dialogOeffnen(dialogSchuljahr()); },
    'schuljahr-starten'() {
      const fehler = (text) => { const p = $('#sj-fehler'); p.textContent = text; p.hidden = false; };
      const name = $('#sj-name').value.trim();
      const klasse = $('#sj-klasse').value;
      if (!name) { fehler('Bitte gib dem Archiv einen Namen.'); return; }
      let gruppe = state.gruppe;
      if (brauchtGruppe() && Number(klasse) >= 7) {
        gruppe = $('#sj-gruppe').value;
        if (!gruppe) { fehler('Bitte wähle deine Wahlpflichtfächergruppe.'); return; }
      }
      // Erst archivieren; klappt das nicht (Speicher voll), bleibt alles, wie es ist
      if (!archivAnlegen(name, state)) { fehler('Das Archiv konnte nicht gespeichert werden. Ist der Speicher voll?'); return; }
      const fos = !notenModus();
      ui.abschluss = null;
      ui.zielHJ = {};
      ui.statHJ = 'alle';
      dialogSchliessen();
      aendern(() => { neuesSchuljahrSetzen(klasse, gruppe); });
      toast(fos ? `Neues Schuljahr: ${klasse}. Klasse. Deine Noten bleiben, eine Kopie ist im Archiv.` : `Neues Schuljahr: ${klasse}. Klasse. Die alten Noten sind im Archiv.`);
    },
    archivieren() {
      const eintrag = archivAnlegen(`Klasse ${state.klasse} · ${laufendesSchuljahr()}`, state);
      render();
      toast(eintrag ? 'Kopie im Archiv gespeichert' : 'Das Archiv konnte nicht gespeichert werden. Ist der Speicher voll?');
    },
    'archiv-ansehen'(btn) {
      const a = archivLaden().find((x) => x.id === btn.dataset.id);
      if (!a) return;
      dialogSchliessen();
      archivVorher = state;
      state = standAus(kopie(a.stand));
      ui.archiv = { id: a.id, name: a.name };
      uiZuruecksetzen('faecher');
      render();
      window.scrollTo(0, 0);
    },
    'archiv-zurueck'() {
      if (!archivAnsicht()) return;
      state = archivVorher;
      archivVorher = null;
      ui.archiv = null;
      dialogSchliessen();
      uiZuruecksetzen('einstellungen');
      render();
      window.scrollTo(0, 0);
    },
    'archiv-wiederherstellen'(btn) {
      const a = archivLaden().find((x) => x.id === btn.dataset.id);
      if (!a) return;
      // Aktuellen Stand vorher sichern (nur, wenn schon etwas eingerichtet ist)
      if ((state.abschluss || state.richtung) && !archivAnlegen(`Klasse ${state.klasse} · vor dem Wiederherstellen`, state)) {
        toast('Das Archiv konnte nicht gespeichert werden. Ist der Speicher voll?');
        return;
      }
      state = standAus(kopie(a.stand));
      speichern();
      uiZuruecksetzen('faecher');
      render();
      window.scrollTo(0, 0);
      toast(`„${a.name}“ wiederhergestellt. Der vorige Stand ist im Archiv.`);
    },
    'archiv-loeschen'(btn) {
      if (!bestaetigt(btn)) return;
      archivSpeichern(archivLaden().filter((x) => x.id !== btn.dataset.id));
      render();
      toast('Archiv gelöscht');
    },
    export() {
      const daten = { ...state, archiv: archivLaden() };
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${notenModus() ? 'noten' : 'fachabi-noten'}-${heute()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    'alles-loeschen'(btn) {
      if (!bestaetigt(btn)) return;
      state = neuerState();
      speichern();
      ui.tab = 'faecher';
      ui.fachId = null;
      render();
      toast('Alle Daten gelöscht');
    },
  };

  const ARCHIV_ERLAUBT = new Set(['tab', 'hj', 'abschluss', 'stat-hj', 'fach-oeffnen', 'zurueck', 'dialog-zu', 'archiv-zurueck']);

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const fn = aktionen[btn.dataset.action];
    if (!fn) return;
    ev.preventDefault();
    // Archiv ansehen: nur Aktionen, die nichts ändern
    if (archivAnsicht() && !ARCHIV_ERLAUBT.has(btn.dataset.action)) { toast(NUR_LESEN); return; }
    fn(btn);
  });

  // Klick auf den Hintergrund schließt den Dialog
  $('#dialog').addEventListener('click', (ev) => { if (ev.target.id === 'dialog') dialogSchliessen(); });

  // Live-Eingaben im Dialog (ohne neu zu zeichnen)
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'f-farbe-frei') {
      $('#f-farbe').value = el.value;
      document.querySelectorAll('.farbe').forEach((b) => b.classList.remove('gewaehlt'));
      el.closest('.farbe').classList.add('gewaehlt');
    }
    if (el.id === 'n-gewicht') {
      document.querySelectorAll('.chip-klein').forEach((b) => b.classList.toggle('aktiv', Math.abs(Number(b.dataset.g) - Number(el.value)) < 1e-9));
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;

    if (el.name === 'ob-abschluss' || el.id === 'ob-rs-klasse') { onboardingAnpassen(); return; }
    if (el.id === 'n-art') {
      if (!$('#dialog form').dataset.note) {
        let g = state.einstellungen.gewichte[el.value] ?? 1;
        if (notenModus()) {
          const f = fachById($('#dialog form').dataset.fach) || {};
          const prozent = (f.gewichtung && f.gewichtung.modus === 'anteil') || system().gewichtung === 'prozent';
          g = prozent ? 1 : Realschule.standardGewicht(el.value, system());
        }
        $('#n-gewicht').value = g;
        document.querySelectorAll('.chip-klein').forEach((b) => b.classList.toggle('aktiv', Math.abs(Number(b.dataset.g) - g) < 1e-9));
      }
      return;
    }
    if (el.id === 'f-modus') { $('#f-anteil-feld').hidden = el.value !== 'anteil'; return; }
    if (el.id === 'f-wpf') {
      const feld = $('#f-vorlage-feld');
      if (feld) feld.hidden = !el.checked;
      // Realschule: Wahlpflichtfach der Gruppe III ist immer Vorrückungsfach
      if (notenModus() && $('#f-vorr')) $('#f-vorr').checked = Realschule.vorrueckungsfachNachName($('#f-name').value, state.gruppe, el.checked);
      return;
    }
    if (el.id === 'f-profil') {
      if (el.value) {
        $('#f-name').value = el.value;
        $('#f-vorr').checked = true;
        $('#f-prakt').checked = Realschule.mitPraktischerPruefung(el.value);
      }
      return;
    }
    if (el.id === 'f-pruef' && notenModus()) { const l = $('#f-prakt-feld'); if (l) l.hidden = !el.checked; return; }
    if (el.id === 'f-vorlage') {
      const w = Presets.WAHLPFLICHTFAECHER[Number(el.value)];
      if (w) { $('#f-name').value = w.name; $('#f-einbr').checked = w.e; }
      return;
    }
    if (el.id === 'f-name' && notenModus()) {
      // Realschule: Kunst, Musik, Sport, Werken, Textiles Gestalten sind keine Vorrückungsfächer (außer Profilfach Gruppe III)
      if ($('#f-vorr')) $('#f-vorr').checked = Realschule.vorrueckungsfachNachName(el.value, state.gruppe, $('#f-wpf').checked);
      if ($('#f-prakt') && $('#f-wpf').checked) $('#f-prakt').checked = Realschule.mitPraktischerPruefung(el.value);
      return;
    }
    if (el.id === 'f-name') {
      // Bekannte Wahlpflichtfächer nach Namen einordnen (Kunst, Musik usw. sind nicht einbringungsfähig)
      const e = Presets.wpfEinbringbar(el.value);
      if (e !== null && ($('#f-wpf').checked || e === false)) $('#f-einbr').checked = e;
      return;
    }
    if (el.id === 'f-jg13') { const l = $('#f-pruef-abi').closest('label'); if (el.checked) l.hidden = false; return; }
    if (el.id === 'sj-klasse') { const g = $('#sj-gruppe-feld'); if (g) g.hidden = Number(el.value) < 7; return; }
    if (el.id === 'import-datei') { importieren(el.files && el.files[0]); el.value = ''; return; }

    const bind = el.dataset.bind;
    if (!bind) return;
    // Archiv ansehen: nur das Ziel („Was brauche ich?“) darf sich ändern, es wird nicht gespeichert
    if (archivAnsicht() && bind !== 'zielhj') { toast(NUR_LESEN); render(); return; }
    const f = el.dataset.id ? fachById(el.dataset.id) : null;
    switch (bind) {
      case 'zielhj':
        ui.zielHJ[el.dataset.id] = Number(el.value);
        render();
        break;
      case 'zeugnis':
        aendern(() => { f.zeugnis = f.zeugnis || {}; f.zeugnis[el.dataset.hj] = zahlAus(el.value, 0, 15); });
        break;
      case 'zeugnis-noten':
        aendern(() => { f.zeugnis = f.zeugnis || {}; f.zeugnis[el.dataset.hj] = punkteSkala() ? zahlAus(el.value, 0, 15) : zahlAus(el.value, 1, 6); });
        break;
      case 'pruef-noten':
        aendern(() => { f.pruefung = f.pruefung || {}; f.pruefung[el.dataset.teil] = zahlAus(el.value, 1, 6); });
        break;
      case 'abschluss-wahl': {
        const neu = el.value;
        const familie = (a) => (a === 'fachabi' || a === 'abitur' ? 'fos' : a);
        const wechsel = familie(neu) !== familie(state.abschluss);
        aendern(() => {
          state.abschluss = neu;
          if (wechsel) {
            const k = Number(state.klasse);
            if (neu === 'realschule' && !(k >= 5 && k <= 10)) state.klasse = '10';
            else if (neu === 'andere' && !(k >= 1 && k <= 13)) state.klasse = '10';
            else if (familie(neu) === 'fos' && !(k >= 11 && k <= 13)) state.klasse = neu === 'abitur' ? '13' : '12';
            if (neu === 'realschule' && Realschule.systemNormalisieren(state.einstellungen.notensystem).skala === 'punkte') {
              state.faecher = Realschule.skalaUmrechnen(state.faecher, 'noten');
              state.einstellungen.notensystem = Realschule.systemNormalisieren({ ...state.einstellungen.notensystem, skala: 'noten', rundung: undefined });
            }
            state.aktivesHJ = aktuellesHJ(state.klasse);
            ui.statHJ = 'alle';
          }
        });
        ui.abschluss = null;
        toast(wechsel ? 'Abschluss geändert. Lege jetzt die Fächer neu an.' : 'Gespeichert');
        break;
      }
      case 'gruppe':
        aendern(() => { state.gruppe = el.value || null; });
        toast('Tippe auf „Fächer neu anlegen“, um die Fächer zu übernehmen.');
        break;
      case 'ns-skala': {
        const nach = el.value === 'punkte' ? 'punkte' : 'noten';
        aendern(() => {
          const ns = Realschule.systemNormalisieren(state.einstellungen.notensystem);
          if (ns.skala === nach) return;
          state.faecher = Realschule.skalaUmrechnen(state.faecher, nach);
          state.einstellungen.notensystem = Realschule.systemNormalisieren({ ...ns, skala: nach, rundung: undefined });
        });
        ui.zielHJ = {};
        toast('Skala geändert. Deine Noten wurden umgerechnet.');
        break;
      }
      case 'ns-gewichtung':
      case 'ns-tendenz':
      case 'ns-rundung':
      case 'ns-anteil':
      case 'ns-gewicht':
        aendern(() => {
          const ns = Realschule.systemNormalisieren(state.einstellungen.notensystem);
          if (bind === 'ns-gewichtung') ns.gewichtung = el.value;
          if (bind === 'ns-tendenz') ns.tendenz = Number(el.value);
          if (bind === 'ns-rundung') ns.rundung = el.value;
          if (bind === 'ns-anteil') ns.saAnteil = zahlAus(el.value, 0, 100, false) ?? 50;
          if (bind === 'ns-gewicht') ns.gewichte[el.dataset.art] = zahlAus(el.value, 0.25, 10, false) ?? 1;
          state.einstellungen.notensystem = Realschule.systemNormalisieren(ns);
        });
        break;
      case 'zeugnis-k':
        aendern(() => { f.zeugnis = f.zeugnis || {}; f.zeugnis[el.dataset.hj] = el.checked ? 'k' : null; });
        break;
      case 'streich-modus': {
        const art = el.dataset.art;
        aendern(() => { Calc.streichModusSetzen(state, art, el.checked ? 'ein' : 'aus'); });
        break;
      }
      case 'pruef':
        aendern(() => { const k = el.dataset.feld; f[k] = f[k] || {}; f[k][el.dataset.teil] = zahlAus(el.value, 0, 15); });
        break;
      case 'fpa':
        aendern(() => { state.fpa[el.dataset.hj] = state.fpa[el.dataset.hj] || {}; state.fpa[el.dataset.hj][el.dataset.teil] = zahlAus(el.value, 0, 15); });
        break;
      case 'seminar':
        aendern(() => { state.seminar = state.seminar || {}; state.seminar[el.dataset.teil] = zahlAus(el.value, 0, 15); });
        break;
      case 'fs-modus':
        aendern(() => { state.zweiteFS = { ...(state.zweiteFS || {}), modus: el.value }; });
        break;
      case 'fs-fach':
        aendern(() => { state.zweiteFS.fachId = el.value || null; });
        break;
      case 'fs':
        aendern(() => { state.zweiteFS[el.dataset.teil] = zahlAus(el.value, 0, 15); });
        break;
      case 'ziel':
        aendern(() => { state.ziel = Number(el.value); });
        break;
      case 'zielAbi':
        aendern(() => { state.zielAbi = Number(el.value); });
        break;
      case 'klasse':
        aendern(() => { state.klasse = el.value; state.aktivesHJ = aktuellesHJ(el.value); });
        ui.abschluss = null;
        break;
      case 'richtung':
        aendern(() => { state.richtung = el.value; });
        toast('Tippe auf „Fächer neu anlegen“, um die Fächer zu übernehmen.');
        break;
      case 'zeigeNote':
        aendern(() => { state.einstellungen.zeigeNote = el.checked; });
        break;
      case 'theme':
        aendern(() => { state.einstellungen.theme = el.value; });
        break;
      case 'std-gewicht':
        aendern(() => { state.einstellungen.gewichte[el.dataset.art] = zahlAus(el.value, 0.25, 10, false) ?? 1; });
        break;
      default:
        break;
    }
  });

  function importieren(datei) {
    if (!datei) return;
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const d = JSON.parse(leser.result);
        if (!d || d.version !== 2 || !Array.isArray(d.faecher)) throw new Error('Format');
        state = standAus(d);
        speichern();
        // Archive aus der Sicherung übernehmen (alte Dateien haben keine), gleiche id nicht doppelt
        let neu = 0;
        let voll = false;
        if (Array.isArray(d.archiv)) {
          const liste = archivLaden();
          const ids = new Set(liste.map((a) => a.id));
          for (const a of d.archiv) {
            if (!archivGueltig(a) || ids.has(String(a.id))) continue;
            liste.push({ id: String(a.id), name: String(a.name || '').trim() || 'Schuljahr', datum: a.datum || new Date().toISOString(), stand: standAus(a.stand) });
            ids.add(String(a.id));
            neu++;
          }
          if (neu && !archivSpeichern(liste)) voll = true;
        }
        ui.fachId = null;
        render();
        if (voll) toast('Sicherung geladen. Das Archiv passt nicht mehr in den Speicher.');
        else toast(neu ? `Sicherung geladen, ${neu} ${neu === 1 ? 'Archiv' : 'Archive'} übernommen` : 'Sicherung geladen');
      } catch (e) {
        toast('Die Datei ist keine gültige Sicherung.');
      }
    };
    leser.readAsText(datei);
  }

  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline ist optional */ });
  }
})();
