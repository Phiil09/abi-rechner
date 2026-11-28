/*
 * Fächer je Ausbildungsrichtung nach FOBOSO Anlage 1 (Stundentafel, Text gilt ab 01.08.2026)
 * und Anlage 4 (Geschichte in Jgst. 11 und Politik und Gesellschaft in Jgst. 12 sind getrennte Fächer).
 *
 * Mit der Verordnung vom 19.06.2026 wurden nur Profilfächer umbenannt:
 *   Technik: Technologie -> KIT; Wirtschaft: BwR -> BWL; PF4 in 12: Informatik bzw.
 *   International Business Studies -> KIWI. Wer vor dem Schuljahr 2026/27 in die 11. Klasse
 *   eingetreten ist, behält die alten Bezeichnungen.
 *
 * jg: Jahrgangsstufen, in denen das Fach unterrichtet wird.
 * p: Prüfungsfach Fachabitur; pa: Prüfungsfach Abitur (D, E, M, Profilfach 1).
 * sa: Fach mit Schulaufgaben (Anlage 3). e: einbringungsfähig (Sport nicht).
 *
 * Einbringbare Halbjahre (Calc.einbringbareHalbjahre) folgen aus jg und stimmen mit den
 * Eingabezellen des Streichvorschlag-Tools der FOS überein: Fach in 11 und 12 => 11/2, 12/1, 12/2;
 * nur 11 => 11/1, 11/2; nur 12 => 12/1, 12/2. Profilfach 3: SWW endet in der 11, GTAG nur in der 12.
 */
const Presets = (function () {
  const F = (name, jg, opt = {}) => ({
    name,
    jg,
    p: !!opt.p,
    pa: !!opt.pa,
    sa: !!opt.sa || !!opt.p,
    e: opt.e !== false,
    wpf: !!opt.wpf,
  });

  // Wahlpflichtfächer nach Anlage 1 Nr. 2 und 3 (e: einbringungsfähig)
  const WAHLPFLICHTFAECHER = [
    { name: 'Informatik', e: true },
    { name: 'Internationale Politik', e: true },
    { name: 'Mathematik Additum', e: true },
    { name: 'Physik Additum', e: true },
    { name: 'Aspekte der Physik', e: true },
    { name: 'Aspekte der Chemie', e: true },
    { name: 'Aspekte der Biologie', e: true },
    { name: 'Aspekte der Psychologie', e: true },
    { name: 'Biotechnologie', e: true },
    { name: 'Wirtschaft Aktuell', e: true },
    { name: 'Wirtschaft und Recht', e: true },
    { name: 'Sozialpsychologie', e: true },
    { name: 'Soziologie', e: true },
    { name: 'Spektrum der Gesundheit', e: true },
    { name: 'Gesundheitswirtschaft und Recht', e: true },
    { name: 'Experimentelles Gestalten', e: true },
    { name: 'English Book Club', e: true },
    { name: 'International Business Studies', e: true },
    { name: 'Französisch (fortgeführt)', e: true },
    { name: 'Spanisch (fortgeführt)', e: true },
    { name: 'Französisch (2. Fremdsprache)', e: true },
    { name: 'Spanisch (2. Fremdsprache)', e: true },
    { name: 'Italienisch (2. Fremdsprache)', e: true },
    { name: 'Latein (2. Fremdsprache)', e: true },
    { name: 'Russisch (2. Fremdsprache)', e: true },
    { name: 'Sport', e: false },
    { name: 'Kunst', e: false },
    { name: 'Musik', e: false },
    { name: 'Szenisches Gestalten', e: false },
    { name: 'Studier- und Arbeitstechniken', e: false },
  ];

  const namensSchluessel = (n) => String(n || '').toLowerCase().replace(/[^a-zäöüß]/g, '');
  // Auch die Schreibweise "Studier- uns Arbeitstechniken" (Tippfehler in manchen Listen) erkennen.
  const NICHT_EINBRINGBAR = new Set(WAHLPFLICHTFAECHER.filter((w) => !w.e).map((w) => namensSchluessel(w.name)).concat([namensSchluessel('Studier- uns Arbeitstechniken')]));

  /**
   * Einbringungsfähigkeit eines Wahlpflichtfachs nach Namen: false für Kunst, Musik,
   * Studier- und Arbeitstechniken, Szenisches Gestalten (und Sport), true für bekannte andere
   * Wahlpflichtfächer, null für unbekannte Namen.
   */
  function wpfEinbringbar(name) {
    const s = namensSchluessel(name);
    if (!s) return null;
    if (NICHT_EINBRINGBAR.has(s)) return false;
    return WAHLPFLICHTFAECHER.some((w) => namensSchluessel(w.name) === s) ? true : null;
  }

  /**
   * Profilfächer je Richtung. jg = Jahrgangsstufen 11–13.
   * Namen: [neu, alt] falls umbenannt.
   * pf13: Profilfach 1–3 der 13. Klasse wie im Streichvorschlag-Tool der FOS (Jgst. 13). Gilt nur
   * für die Reihenfolge der Fächerliste der 13. Klasse; die Listen der 11. und 12. bleiben unverändert.
   */
  const RICHTUNGEN = {
    technik: {
      name: 'Technik',
      profil: [
        { n: 'Physik', jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: ['KIT (KI, Informatik und Technologie)', 'Technologie'], jg: [11, 12, 13], pf13: 2 },
        { n: 'Chemie', jg: [11, 12, 13], pf13: 3 },
        { n: 'Mathematik Additum', jg: [12] },
      ],
    },
    abu: {
      name: 'Agrarwirtschaft, Bio- und Umwelttechnologie',
      profil: [
        { n: 'Biologie', jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: 'Chemie', jg: [11, 12, 13], pf13: 2 },
        { n: 'Physik', jg: [11, 12] },
        { n: 'Technologie', jg: [12, 13], pf13: 3 },
      ],
    },
    wirtschaft: {
      name: 'Wirtschaft und Verwaltung',
      profil: [
        { n: ['BWL', 'BwR (Betriebswirtschaftslehre mit Rechnungswesen)'], jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: 'Volkswirtschaftslehre', jg: [11, 12, 13], pf13: 2 },
        { n: 'Rechtslehre', jg: [11] },
        { n: 'Naturwissenschaften', jg: [12, 13], pf13: 3 },
        { n: ['KIWI (KI und Wirtschaftsinformatik)', 'Informatik'], jg: [12] },
      ],
    },
    intwirtschaft: {
      name: 'Internationale Wirtschaft',
      profil: [
        { n: 'IBV (Internationale BWL und VWL)', jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: 'Französisch/Spanisch', jg: [11, 12, 13], sa: true, pf13: 2 },
        { n: 'Rechtslehre', jg: [11] },
        { n: 'Naturwissenschaften', jg: [12, 13], pf13: 3 },
        { n: ['KIWI (KI und Wirtschaftsinformatik)', 'International Business Studies'], jg: [12] },
      ],
    },
    sozial: {
      name: 'Sozialwesen',
      profil: [
        { n: 'Pädagogik/Psychologie', jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: 'Sozialwirtschaft und Recht', jg: [11, 12, 13], pf13: 2 },
        { n: 'Chemie', jg: [11] },
        { n: 'Biologie', jg: [12, 13], pf13: 3 },
        { n: 'Soziologie', jg: [12] },
      ],
    },
    gesundheit: {
      name: 'Gesundheit',
      profil: [
        { n: 'Gesundheitswissenschaften', jg: [11, 12, 13], p1: true, pf13: 1 },
        { n: 'Chemie', jg: [11, 12] },
        { n: 'Kommunikation und Interaktion', jg: [11, 12, 13], pf13: 3 },
        { n: 'Biologie', jg: [12, 13], pf13: 2 },
      ],
    },
    gestaltung: {
      name: 'Gestaltung',
      profil: [
        { n: 'Gestaltung Praxis', jg: [11, 12], p1: true },
        { n: 'Gestaltung Theorie', jg: [11, 12] },
        { n: 'Gestaltung', jg: [13], p1abi: true, pf13: 1 },
        { n: 'Medien', jg: [11, 12, 13], pf13: 2 },
        { n: 'Naturwissenschaften', jg: [12, 13], pf13: 3 },
      ],
    },
  };

  const FARBEN = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7', '#e11d48', '#0ea5e9', '#65a30d', '#78716c'];

  let zaehler = 0;
  function neueId() {
    zaehler++;
    return Date.now().toString(36) + '-' + zaehler.toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  function fachAusVorlage(v, i) {
    return {
      id: neueId(),
      name: v.name,
      farbe: FARBEN[i % FARBEN.length],
      jahrgaenge: { 11: v.jg.includes(11), 12: v.jg.includes(12), 13: v.jg.includes(13) },
      pruefungsfach: v.p,
      pruefungsfachAbi: v.pa,
      einbringbar: v.e,
      schulaufgaben: v.sa,
      wpf: v.wpf,
      gewichtung: { modus: 'fobos', saAnteil: 50 },
      noten: [],
      zeugnis: {},
      pruefung: { schriftlich: null, muendlich: null },
      pruefungAbi: { schriftlich: null, muendlich: null },
    };
  }

  /** Schuljahr-Beginn (z. B. 2026 für 2026/27). */
  function schuljahr(datum = new Date()) {
    return datum.getMonth() + 1 >= 8 ? datum.getFullYear() : datum.getFullYear() - 1;
  }

  /** Alte Fächernamen, wenn die 11. Klasse vor 2026/27 begonnen wurde. */
  function alteNamen(klasse, datum = new Date()) {
    return schuljahr(datum) - (Number(klasse) - 11) < 2026;
  }

  /**
   * Fächerliste für eine Richtung.
   * klasse: 11, 12 oder 13. Bei 13 kommen die Fächer der 13. Klasse dazu.
   */
  function faecherFuer(richtung, klasse = 12, datum = new Date()) {
    const r = RICHTUNGEN[richtung];
    if (!r) return [];
    const alt = alteNamen(klasse, datum);
    const mit13 = Number(klasse) === 13;
    const jgFilter = (jg) => (mit13 ? jg : jg.filter((j) => j !== 13));
    const name = (n) => (Array.isArray(n) ? (alt ? n[1] : n[0]) : n);

    const liste = [
      F('Deutsch', jgFilter([11, 12, 13]), { p: true, pa: true }),
      F('Englisch', jgFilter([11, 12, 13]), { p: true, pa: true }),
      F('Mathematik', jgFilter([11, 12, 13]), { p: true, pa: true }),
    ];
    // 13. Klasse: Profilfächer der 13. in der Reihenfolge Profilfach 1–3 des Tools (pf13).
    // Sie tauschen nur untereinander die Plätze; Fächer ohne 13 bleiben, wo sie sind.
    let profil = r.profil;
    if (mit13) {
      const plaetze = [];
      profil.forEach((pf, i) => { if (pf.pf13) plaetze.push(i); });
      const sortiert = profil.filter((pf) => pf.pf13).sort((a, b) => a.pf13 - b.pf13);
      profil = profil.slice();
      plaetze.forEach((pos, j) => { profil[pos] = sortiert[j]; });
    }
    for (const pf of profil) {
      const jg = jgFilter(pf.jg);
      if (!jg.length) continue;
      liste.push(F(name(pf.n), jg, { p: !!pf.p1 && jg.some((j) => j <= 12), pa: (!!pf.p1 || !!pf.p1abi) && jg.includes(13), sa: pf.sa || pf.p1 || pf.p1abi }));
    }
    liste.push(F('Geschichte', [11]));
    liste.push(F('Politik und Gesellschaft', [12]));
    if (mit13) liste.push(F('Geschichte/Politik und Gesellschaft', [13]));
    liste.push(F('Religionslehre/Ethik', jgFilter([12, 13])));
    liste.push(F('Sport', [12], { e: false }));
    liste.push(F('Wahlpflichtfach 1', [12], { wpf: true }));
    liste.push(F('Wahlpflichtfach 2', [12], { wpf: true }));
    if (mit13) liste.push(F('Wahlpflichtfach (13. Klasse)', [13], { wpf: true }));
    return liste.map(fachAusVorlage);
  }

  /** Ergänzt eine bestehende Fächerliste um die 13. Klasse, ohne Noten zu verlieren. */
  function dreizehnErgaenzen(faecher, richtung, datum = new Date()) {
    const vorlage = faecherFuer(richtung, 13, datum);
    const res = faecher.map((f) => ({ ...f, jahrgaenge: { ...f.jahrgaenge } }));
    let neu = 0;
    for (const v of vorlage) {
      if (!v.jahrgaenge[13]) continue;
      const vorhanden = res.find((f) => f.name === v.name && !f.jahrgaenge[13] && (f.jahrgaenge[12] || f.jahrgaenge[11]) && !v.wpf);
      if (vorhanden) {
        vorhanden.jahrgaenge[13] = true;
        vorhanden.pruefungsfachAbi = v.pruefungsfachAbi;
        if (!vorhanden.pruefungAbi) vorhanden.pruefungAbi = { schriftlich: null, muendlich: null };
      } else if (!res.some((f) => f.name === v.name && f.jahrgaenge[13])) {
        res.push({ ...v, farbe: FARBEN[(res.length + neu) % FARBEN.length] });
        neu++;
      }
    }
    return res;
  }

  function leeresFach(name, index) {
    return fachAusVorlage(F(name, [12]), index);
  }

  // Gruppen des Streichvorschlag-Tools: SWW streicht 2 + 2 x WPF, GTAG 1 + 2 x WPF Halbjahre.
  const GRUPPE = { sozial: 'SWW', wirtschaft: 'SWW', intwirtschaft: 'SWW', gesundheit: 'GTAG', technik: 'GTAG', abu: 'GTAG', gestaltung: 'GTAG' };

  return { RICHTUNGEN, GRUPPE, FARBEN, WAHLPFLICHTFAECHER, wpfEinbringbar, faecherFuer, dreizehnErgaenzen, alteNamen, schuljahr, leeresFach, neueId };
})();

if (typeof module !== 'undefined') module.exports = Presets;
