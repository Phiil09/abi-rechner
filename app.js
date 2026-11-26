/* Oberfläche des Fachabi-Rechners. Rechenlogik: calc.js, Stundentafeln: presets.js */
/* global Calc, Presets */
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

  function pill(p, gross = false) {
    const leer = p === null || p === undefined;
    const note = state.einstellungen.zeigeNote && !leer ? `<small>${Calc.noteAusPunkten(p)}</small>` : '';
    return `<span class="pill ${leer ? 'p-leer' : 'farbig'}${gross ? ' gross' : ''}" style="${hStyle(p)}">${leer ? '–' : p}${note}</span>`;
  }

  const kPill = (gross = false) => `<span class="pill p-leer${gross ? ' gross' : ''}" title="keine Note möglich">k</span>`;

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
      einstellungen: { zeigeNote: true, theme: 'auto', gewichte: { ...STANDARD_GEWICHTE } },
      ziel: 2.0,
      zielAbi: 2.0,
    };
  }

  // Alte Felder fach.streichen/streichenAbi ('auto'/'ja'/'nein') bleiben liegen, werden aber nicht mehr benutzt.
  const ARTEN = ['fachabi', 'abitur'];

  // Alte Stände und Sicherungen: 'auto' => 'aus', 'manuell' => 'ein' (Auswahl bleibt), fehlt => 'aus'.
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
      einstellungen: { ...n.einstellungen, ...e, gewichte: { ...STANDARD_GEWICHTE, ...(e.gewichte || {}) } },
    };
    if (!d.klasse && d.aktivesHJ) res.klasse = d.aktivesHJ.slice(0, 2);
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
  const ui = { tab: 'faecher', fachId: null, zielHJ: {}, statHJ: 'alle', abschluss: null, hjAnsicht: null };

  function speichern() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  }

  function aendern(fn) {
    fn();
    speichern();
    render();
  }

  const fachById = (id) => state.faecher.find((f) => f.id === id);
  const hat13 = () => state.klasse === '13' || state.faecher.some((f) => f.jahrgaenge && f.jahrgaenge[13]);
  const sichtbareHJ = () => (hat13() ? Calc.HJ : Calc.HJ.slice(0, 4));
  const abschlussArt = () => ui.abschluss || (state.klasse === '13' ? 'abitur' : 'fachabi');
  const abschlussName = (art) => (art === 'abitur' ? 'Abitur' : 'Fachabitur');

  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('sichtbar');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('sichtbar'), Math.max(2600, text.length * 55));
  }

  function themeAnwenden() {
    const t = state.einstellungen.theme;
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
  function viewWillkommen() {
    return `
      <section class="card willkommen">
        <img class="logo-gross" src="icon.svg" alt="" width="88" height="88">
        <h2>Willkommen beim Fachabi-Rechner</h2>
        <p>Wähle deine Ausbildungsrichtung und Klasse. Die App legt deine Fächer nach der amtlichen Stundentafel (FOBOSO) an. Danach kannst du alles anpassen: Fächer umbenennen, hinzufügen, löschen, Farben ändern.</p>
        <label class="feld">Ausbildungsrichtung
          <select id="ob-richtung">${Object.entries(Presets.RICHTUNGEN).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select>
        </label>
        <label class="feld">Aktuelle Klasse
          <select id="ob-klasse">${klassenOptionen('12')}</select>
        </label>
        <button class="btn primaer breit" data-action="onboarding">Los geht's</button>
      </section>`;
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
    if (!state.richtung) return viewWillkommen();
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

  function viewAbschluss() {
    if (!state.richtung) return viewWillkommen();
    const art = abschlussArt();
    const abi = art === 'abitur';
    const a = Calc.auswertung(state, art);
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
          ${eingabe('pruef', `${attrs} data-teil="muendlich"`, pr.muendlich, 'mündl.', '–')}
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
      const fs = state.zweiteFS || { modus: 'keine' };
      const fsFaecher = state.faecher.filter((f) => f.jahrgaenge && f.jahrgaenge[13]);
      let fsFelder = '';
      if (fs.modus === 'wpf12') fsFelder = `<div class="pruef-zeile">${eingabe('fs', 'data-teil="hj1"', fs.hj1, '12/1')}${eingabe('fs', 'data-teil="hj2"', fs.hj2, '12/2')}</div>`;
      if (fs.modus === 'ergaenzung') fsFelder = `<div class="pruef-zeile">${eingabe('fs', 'data-teil="pruefung"', fs.pruefung, 'Ergänzungsprüfung')}</div>`;
      if (fs.modus === 'jgst13') fsFelder = `<label class="feld">Fach der 2. Fremdsprache<select data-bind="fs-fach"><option value="">bitte wählen</option>${fsFaecher.map((f) => `<option value="${esc(f.id)}" ${f.id === fs.fachId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>`;
      extraKarten = `
        <section class="card">
          <h3>Seminar <span class="zahl">×2</span></h3>
          <p class="hinweis">(2 × Seminarphase + 2 × Seminararbeit + Prüfungsgespräch) / 5, gerundet (§ 17 Abs. 2). Eine Leistung mit 0 Punkten bedeutet: Seminar nicht bestanden.</p>
          <div class="pruef-zeile">
            ${eingabe('seminar', 'data-teil="phase"', s.phase, 'Phase')}
            ${eingabe('seminar', 'data-teil="arbeit"', s.arbeit, 'Arbeit')}
            ${eingabe('seminar', 'data-teil="gespraech"', s.gespraech, 'Gespräch')}
            ${eingabe('seminar', 'data-teil="ergebnis"', s.ergebnis, 'oder Zeugnis')}
            ${pill(a.seminar.punkte)}
          </div>
        </section>
        <section class="card">
          <h3>Zweite Fremdsprache (allgemeine Hochschulreife)</h3>
          <p class="hinweis">Nur nötig, wenn du die allgemeine Hochschulreife willst (§ 38). Mit Wahlpflicht aus der 12. oder Ergänzungsprüfung steigt die Höchstpunktzahl auf 420.</p>
          <label class="feld">Nachweis
            <select data-bind="fs-modus">
              ${[['keine', 'Kein Nachweis (fachgebundene Hochschulreife)'], ['jgst13', 'Fremdsprache in der 13. Klasse'], ['wpf12', 'Wahlpflicht 2. Fremdsprache in der 12. (+2 Halbjahre)'], ['ergaenzung', 'Ergänzungsprüfung (zählt doppelt)']].map(([k, l]) => `<option value="${k}" ${k === fs.modus ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          ${fsFelder}
        </section>`;
    }

    const slotsVon = abi ? Calc.einbringbareHalbjahreAbitur : Calc.einbringbareHalbjahre;
    const manuell = a.streichModus === 'ein';
    const ohne = a.streichModus === 'aus';
    const N = a.zuStreichen;
    const fsFachId = abi && state.zweiteFS && state.zweiteFS.modus === 'jgst13' ? state.zweiteFS.fachId : null;
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
          else if (fsFachId === f.id) titel = `${Calc.HJ_LABEL[hj]}: Die 2. Fremdsprache muss mit 13/1 und 13/2 zählen. Du kannst sie nicht streichen.`;
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
        <div class="kachel-label">${a.vollstaendig ? `${a.vorlaeufig ? 'Vorläufiger' : 'Dein'} ${abschlussName(art)}-Schnitt` : `Hochrechnung ${abschlussName(art)}-Schnitt`}</div>
        <div class="hero-wert">${fmtS(a.S)}</div>
        <div class="hero-sub">${a.S !== null ? esc(Calc.notenstufe(a.S)) + ' · ' : ''}${fmt(a.E, 1)} von ${fmt(a.M, 1)} erfassten Punkten${a.vorlaeufig ? ' · noch ohne Streichen' : ''}</div>
        <div class="balken" title="Datenstand"><div style="width:${anteil}%"></div></div>
        <div class="hinweis">${a.vollstaendig ? 'Alle Leistungen sind erfasst.' : `Datenstand: ${fmt(a.M, 1)} von ${a.Mgesamt} möglichen Punkten erfasst (${anteil} %). Die Hochrechnung nimmt an, dass du so weitermachst wie bisher.`}${a.vorlaeufig ? ` Gestrichen ist noch nichts: Alle Halbjahre zählen mit, umgerechnet auf ${a.anzahlHj}.` : ''}</div>
      </section>

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
        ${tauschHtml}
      </section>

      <section class="card">
        <h3>Bestehen ${a.vollstaendig && !a.vorlaeufig ? '' : '<span class="zahl">vorläufig</span>'}</h3>
        <p class="status ${{ bestanden: 'ok', 'vorläufig bestanden': 'ok', 'nicht bestanden': 'nein', 'vorläufig nicht bestanden': 'nein' }[a.ergebnis] || ''}">${{ bestanden: 'BESTANDEN', 'nicht bestanden': 'NICHT BESTANDEN', 'vorläufig bestanden': 'Vorläufig: bestanden', 'vorläufig nicht bestanden': 'Vorläufig: nicht bestanden' }[a.ergebnis] || 'Eingaben unvollständig'}</p>
        ${a.vorlaeufig && a.ergebnis !== 'unvollständig' ? '<p class="hinweis">Noch ohne Streichen gerechnet. Mit „Streichen“ siehst du das Ergebnis mit den Streichungen.</p>' : ''}
        ${a.hinweise.length && a.ergebnis === 'unvollständig' ? `<ul class="hinweis-liste">${a.hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <ul class="check-liste">${a.bestehen.map((b) => `<li class="${b.ok ? 'ok' : 'nein'}">${b.ok ? '✓' : '✗'} ${esc(b.text)}</li>`).join('')}</ul>
        <p class="hinweis">Unter 4 Punkten zählt als Unterpunktung, 0 Punkte zählen doppelt (§ 35 Abs. 9).</p>
      </section>`;
  }

  // ---------- Ansicht: Statistik ----------
  function viewStatistik() {
    if (!state.richtung) return viewWillkommen();
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
  function viewEinstellungen() {
    const e = state.einstellungen;
    const gewichtFelder = NOTENARTEN.map((n) => `
      <label class="feld inline">${esc(n.name)}
        <input type="number" min="0.25" max="10" step="0.25" inputmode="decimal" data-bind="std-gewicht" data-art="${n.id}" value="${esc(e.gewichte[n.id] ?? 1)}">
      </label>`).join('');
    const jgText = (f) => [11, 12, 13].filter((j) => f.jahrgaenge && f.jahrgaenge[j]).join(' · ') || '–';
    const faecherListe = state.faecher.map((f, i) => `
      <div class="verwalt-zeile">
        <span class="punkt-farbe" style="background:${esc(f.farbe)}"></span>
        <span class="verwalt-text"><span class="fach-name">${esc(f.name)}</span><span class="fach-sub">Klasse ${jgText(f)}${f.wpf ? '<span class="tag">WPF</span>' : ''}${f.einbringbar === false ? '<span class="tag grau">zählt nicht</span>' : ''}</span></span>
        <button class="mini-btn" data-action="fach-hoch" data-id="${esc(f.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button class="mini-btn" data-action="fach-runter" data-id="${esc(f.id)}" ${i === state.faecher.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button class="mini-btn text" data-action="fach-einstellungen" data-id="${esc(f.id)}">Bearbeiten</button>
      </div>`).join('');
    const fehlt13 = state.klasse === '13' && !state.faecher.some((f) => f.jahrgaenge && f.jahrgaenge[13]);

    return `
      <section class="card">
        <h3>Klasse und Ausbildungsrichtung</h3>
        <label class="feld inline">Klasse
          <select data-bind="klasse">${klassenOptionen(state.klasse)}</select>
        </label>
        ${fehlt13 ? '<button class="btn primaer breit" data-action="dreizehn-ergaenzen">Fächer der 13. Klasse ergänzen</button>' : ''}
        <label class="feld">Richtung
          <select data-bind="richtung">${Object.entries(Presets.RICHTUNGEN).map(([k, v]) => `<option value="${k}" ${k === state.richtung ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
        </label>
        <button class="btn sekundaer breit" data-action="faecher-neu-anlegen" data-confirm="Wirklich? Alle Fächer und Noten werden ersetzt.">Fächer nach Stundentafel neu anlegen</button>
      </section>

      <section class="card">
        <h3>Meine Fächer <span class="zahl">${state.faecher.length}</span></h3>
        <p class="hinweis">Umbenennen, Farbe ändern, als Wahlpflichtfach oder Prüfungsfach markieren, Reihenfolge ändern oder löschen.</p>
        ${faecherListe || '<p class="leer klein">Noch keine Fächer.</p>'}
        <button class="btn sekundaer breit" data-action="fach-neu">+ Fach hinzufügen</button>
      </section>

      <section class="card">
        <h3>Anzeige</h3>
        <label class="schalter"><input type="checkbox" data-bind="zeigeNote" ${e.zeigeNote ? 'checked' : ''}> Note (1+ bis 6) klein neben den Punkten zeigen</label>
        <label class="feld inline">Design
          <select data-bind="theme">${[['auto', 'Wie System'], ['hell', 'Hell'], ['dunkel', 'Dunkel']].map(([k, l]) => `<option value="${k}" ${k === e.theme ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
      </section>

      <section class="card">
        <h3>Standard-Gewichtung</h3>
        <p class="hinweis">Mit diesem Gewicht startet jede neue Note. Bei jeder Note kannst du es einzeln ändern, z. B. ×2 oder ×1,5. Gesetzlich (§ 21 FOBOSO) zählt jede Schulaufgabe so viel wie der Schnitt aller kleinen Noten zusammen (Gewicht 1).</p>
        ${gewichtFelder}
      </section>

      <section class="card">
        <h3>Daten</h3>
        <p class="hinweis">Deine Noten bleiben nur auf diesem Gerät, im Browser. Mach ab und zu eine Sicherung.</p>
        <div class="btn-reihe">
          <button class="btn sekundaer" data-action="export">Sicherung herunterladen</button>
          <label class="btn sekundaer">Sicherung laden<input type="file" accept="application/json,.json" id="import-datei" hidden></label>
        </div>
        <button class="btn gefahr breit" data-action="alles-loeschen" data-confirm="Wirklich alles löschen? Nochmal tippen.">Alle Daten löschen</button>
      </section>

      <section class="card info">
        <h3>So rechnet die App</h3>
        <ul>
          <li><b>Halbjahresergebnis</b> (§ 21): Jede Schulaufgabe zählt so viel wie der gewichtete Schnitt aller kleinen Noten zusammen. Gerundet wird erst am Ende auf ganze Punkte, ab ,5 auf. Werte unter 1 ergeben 0 Punkte (§ 19 Abs. 6).</li>
          <li><b>Prüfung</b> (§ 35 Abs. 2): (2 × schriftlich + mündlich) / 3, gerundet; unter 1 ergibt 0. Ohne mündliche zählt die schriftliche. Fachabi: zählt dreifach, mündlich Englisch ist Pflicht. Abitur: zählt doppelt.</li>
          <li><b>Fachabitur</b> (§ 35 Abs. 5): 4 Prüfungen × 3, fachpraktische Ausbildung (2 Halbjahre) und 25 Halbjahre = 585 Punkte.</li>
          <li><b>Streichen</b>: Gestrichen wird erst am Ende der 12. (Abitur: 13.) Klasse. Deshalb ist „Streichen“ am Anfang aus. Dann zählen alle Halbjahre mit, auch 11/1 bei Fächern, die in der 11. enden. Damit der Schnitt vergleichbar bleibt, rechnet die App den Halbjahresteil auf 25 Halbjahre um (Abitur: 16): Summe der Halbjahrespunkte × 25 / Anzahl der Halbjahre. Halbjahre ohne Note (k) zählen dabei nicht mit. Das Ergebnis ist vorläufig.</li>
          <li><b>„Streichen“ an</b>: höchstens ein Halbjahr je Fach. Sind alle Halbjahre eingetragen, schlägt die App vor, welche Halbjahre wegfallen (gestrichelt), wie das Streichvorschlag-Tool der FOS: im Fach das schwächste Halbjahr. Zuerst Halbjahre ohne Note (k), dann Rettung eines Gesamtergebnisses unter 4 Punkten (wenn fürs Bestehen nötig), sonst die niedrigsten Punkte. Du kannst Halbjahre selbst antippen, um sie zu streichen oder zurückzuholen, auch schon vorher. Bis dahin streicht die App nur k-Halbjahre und deine Wahl und rechnet die übrigen Halbjahre wie oben um.</li>
          <li><b>Gesamtergebnis</b> je Fach (für die Unterpunktungen): eingebrachte Halbjahre und Prüfung × 3, erst auf zwei Nachkommastellen, dann auf ganze Punkte gerundet. Die fpA-Gesamtnote zählt mit.</li>
          <li><b>Abitur</b> (§ 35 Abs. 7): 4 Prüfungen × 2, Seminar × 2 und 16 Halbjahre aus der 13. = 390 Punkte (mit 2. Fremdsprache 420).</li>
          <li>Höchstens ein Halbjahr pro Fach darf wegfallen. Sport zählt nicht.</li>
          <li><b>Schnitt</b> (§ 27 Abs. 3): 17/3 − 5 × Punkte / Höchstpunktzahl. Die erste Nachkommastelle wird abgeschnitten, nicht gerundet.</li>
          <li><b>Bestehen</b> (§ 35 Abs. 9): höchstens 2 Prüfungs- und 2 Gesamtergebnisse unter 4 Punkten, 0 Punkte zählen doppelt. Bei einer Unterpunktung im Gesamtergebnis mindestens 195 Punkte, bei zweien mindestens 234. Ein Halbjahr ohne Note (k), das nicht gestrichen werden kann, bedeutet nicht bestanden.</li>
          <li>Ein Fachreferat gibt es ab 01.08.2026 nicht mehr (Verordnung vom 19.06.2026).</li>
        </ul>
        <p class="hinweis">Rechtsgrundlage: FOBOSO, Fassung ab 01.08.2026. Ohne Gewähr. Verbindlich sind die Festsetzungen deiner Schule.</p>
      </section>`;
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

  function dialogNote(fach, note) {
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

  function dialogFach(fach) {
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
    let titel = 'Fachabi-Rechner';
    let fachFarbe = null;
    if (ui.tab === 'faecher' && ui.fachId) {
      const f = fachById(ui.fachId);
      if (f) { html = viewFach(f); titel = f.name; fachFarbe = f.farbe; } else { ui.fachId = null; html = viewFaecher(); }
    } else if (ui.tab === 'abschluss') { html = viewAbschluss(); titel = abschlussName(abschlussArt()); }
    else if (ui.tab === 'statistik') { html = viewStatistik(); titel = 'Statistik'; }
    else if (ui.tab === 'einstellungen') { html = viewEinstellungen(); titel = 'Einstellungen'; }
    else html = viewFaecher();
    $('#main').innerHTML = html;
    $('#titel').textContent = titel;
    $('#titel').style.borderLeftColor = fachFarbe || 'transparent';
    $('#titel').classList.toggle('mit-farbe', !!fachFarbe);
    $('#nav-abschluss-text').textContent = state.klasse === '13' ? 'Abitur' : 'Fachabi';
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

  const aktionen = {
    tab(btn) {
      ui.tab = btn.dataset.tab;
      ui.fachId = null;
      if (btn.dataset.art) ui.abschluss = btn.dataset.art;
      render();
      window.scrollTo(0, 0);
    },
    hj(btn) { aendern(() => { state.aktivesHJ = btn.dataset.hj; }); },
    abschluss(btn) { ui.abschluss = btn.dataset.art; render(); },
    'stat-hj'(btn) { ui.statHJ = btn.dataset.hj; render(); },
    'fach-oeffnen'(btn) { ui.fachId = btn.dataset.id; render(); window.scrollTo(0, 0); },
    zurueck() { ui.fachId = null; render(); },
    onboarding() {
      const r = $('#ob-richtung').value;
      const klasse = $('#ob-klasse').value;
      aendern(() => {
        state.richtung = r;
        state.klasse = klasse;
        state.faecher = Presets.faecherFuer(r, Number(klasse));
        state.aktivesHJ = aktuellesHJ(klasse);
      });
      toast('Fächer angelegt');
    },
    'fach-neu'() {
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
      aendern(() => {
        state.faecher = Presets.faecherFuer(state.richtung, Number(state.klasse));
        state.gestrichen = { fachabi: {}, abitur: {} };
        state.behalten = { fachabi: {}, abitur: {} };
      });
      toast('Fächer neu angelegt');
    },
    'dreizehn-ergaenzen'() {
      aendern(() => {
        state.faecher = Presets.dreizehnErgaenzen(state.faecher, state.richtung);
        state.aktivesHJ = aktuellesHJ('13');
      });
      toast('Fächer der 13. Klasse ergänzt');
    },
    export() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fachabi-noten-${heute()}.json`;
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

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const fn = aktionen[btn.dataset.action];
    if (fn) { ev.preventDefault(); fn(btn); }
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

    if (el.id === 'n-art') {
      if (!$('#dialog form').dataset.note) {
        const g = state.einstellungen.gewichte[el.value] ?? 1;
        $('#n-gewicht').value = g;
        document.querySelectorAll('.chip-klein').forEach((b) => b.classList.toggle('aktiv', Math.abs(Number(b.dataset.g) - g) < 1e-9));
      }
      return;
    }
    if (el.id === 'f-modus') { $('#f-anteil-feld').hidden = el.value !== 'anteil'; return; }
    if (el.id === 'f-wpf') { $('#f-vorlage-feld').hidden = !el.checked; return; }
    if (el.id === 'f-vorlage') {
      const w = Presets.WAHLPFLICHTFAECHER[Number(el.value)];
      if (w) { $('#f-name').value = w.name; $('#f-einbr').checked = w.e; }
      return;
    }
    if (el.id === 'f-name') {
      // Bekannte Wahlpflichtfächer nach Namen einordnen (Kunst, Musik usw. sind nicht einbringungsfähig)
      const e = Presets.wpfEinbringbar(el.value);
      if (e !== null && ($('#f-wpf').checked || e === false)) $('#f-einbr').checked = e;
      return;
    }
    if (el.id === 'f-jg13') { const l = $('#f-pruef-abi').closest('label'); if (el.checked) l.hidden = false; return; }
    if (el.id === 'import-datei') { importieren(el.files && el.files[0]); el.value = ''; return; }

    const bind = el.dataset.bind;
    if (!bind) return;
    const f = el.dataset.id ? fachById(el.dataset.id) : null;
    switch (bind) {
      case 'zielhj':
        ui.zielHJ[el.dataset.id] = Number(el.value);
        render();
        break;
      case 'zeugnis':
        aendern(() => { f.zeugnis = f.zeugnis || {}; f.zeugnis[el.dataset.hj] = zahlAus(el.value, 0, 15); });
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
        state = normalisieren(d);
        speichern();
        ui.fachId = null;
        render();
        toast('Sicherung geladen');
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
