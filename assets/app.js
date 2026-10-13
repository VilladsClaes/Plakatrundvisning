/* ============================================================
   Skarresø — interaktivt kort
   Klik på et sted i menuen, og kameraet glider derhen.

   Stederne kommer fra places.json — én fælles fil, som alle
   besøgende læser. Siden følger filen og tegner om, når den
   ændrer sig, uden at nogen skal genindlæse.

   Redigering ligger bag en nøgle, og ændringer samles i en
   kladde, som hentes ud som en zip og lægges op i projektet.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- den fælles kilde ---------- */
  const SHARED_FILE = 'places.json';         // alle besøgende læser denne
  const DEFAULT_IMAGE = 'plakat-web.webp';   // fuld opløsning
  const LOW_IMAGE = 'plakat-low.webp';       // let forhåndsbillede, vises straks
  const FULL_SIDE = 4600;                    // bredde på det udgivne billede
  const LOW_SIDE = 1500;                     // bredde på forhåndsbilledet

  /* Nøglen låser redigeringstilstanden op. Den ligger i filen og er
     altså ikke hemmelig — det egentlige værn er, at ændringer først
     slår igennem, når du lægger de hentede filer op. */
  const EDIT_KEY = 'drivhuset';
  const UNLOCK_LS = 'skarreso.noegle.v1';
  const RUTE_LS = 'skarreso.rute.v1';        // den besøgendes egen rundtur
  const DRAFT_LS = 'skarreso.kladde.v1';
  const POLL_MS = 15000;                     // hvor tit der lyttes efter ændringer

  const IDB_NAME = 'skarreso';
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 7;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const DEFAULT_TITLE = 'Skarresø';

  const DEFAULT_PLACES = [
    { navn: 'Bussen',              x: .594, y: .082, zoom: 3.4, tekst: 'Bussen standser lige uden for porten — den nemmeste vej hertil.' },
    { navn: 'Den store bue',       x: .626, y: .190, zoom: 3.2, tekst: 'Buen med lyskæder byder velkommen ind til pladsen.' },
    { navn: 'Det lange fællesbord',x: .400, y: .290, zoom: 2.9, tekst: '70 meter bord. Maden stilles på midten, og alle kan være med.' },
    { navn: 'Hønsegården',         x: .640, y: .282, zoom: 3.6, tekst: 'Hønsene går frit mellem bordene og finder selv deres frokost.' },
    { navn: 'Drivhusene',          x: .235, y: .222, zoom: 3.2, tekst: 'Glasshusene, hvor der dyrkes tomater og krydderurter hele året.' },
    { navn: 'Vinbaren',            x: .210, y: .310, zoom: 3.4, tekst: 'Skiltet siger vinbar. Her hældes der op til de lange samtaler.' },
    { navn: 'Det store hus',       x: .362, y: .545, zoom: 3.0, tekst: 'Huset med det skællede tegltag — samlingsstedet midt i landsbyen.' },
    { navn: 'Klatretårnet',        x: .560, y: .620, zoom: 3.2, tekst: 'Trætårn i flere etager. Der er unger i alle retninger.' },
    { navn: 'Træplatformen',       x: .630, y: .735, zoom: 3.0, tekst: 'Oppe i det store træ: en platform, et lille bord og flagguirlander.' },
    { navn: 'Telthængekøjerne',    x: .752, y: .684, zoom: 3.2, tekst: 'Læn dig tilbage under teltene og lad dagen gå.' },
    { navn: 'Det store æg',        x: .852, y: .240, zoom: 3.6, tekst: 'Det mærkelige, store æg midt i haven. Kig forbi og se selv.' },
    { navn: 'Markedsboderne',      x: .410, y: .800, zoom: 3.4, tekst: 'Boder med stribede markiser — planter, kager og ting man ikke vidste man manglede.' },
    { navn: 'Vaskeriet',           x: .190, y: .690, zoom: 3.4, tekst: 'Vask, opvask og tørring. Cyklen kører vasketøjet frem og tilbage.' },
    { navn: 'Sneglebingo',         x: .120, y: .870, zoom: 3.6, tekst: 'Find vinbjergsneglen med nummer på ryggen — så har du vundet.' },
    { navn: 'Skarresø',            x: .770, y: .855, zoom: 3.4, tekst: 'Søen med åkander og en robåd, der altid er lige ved at lette.' }
  ];

  /* ---------- dom ---------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const scene = $('scene');
  const world = $('world');
  const poster = $('poster');
  const markersEl = $('markers');
  const threads = $('threads');
  const thread = $('thread');
  const menuEl = $('menu');
  const panel = $('panel');
  const detailEmpty = $('detailEmpty');
  const detailBody = $('detailBody');
  const detailCount = $('detailCount');
  const detailName = $('detailName');
  const detailText = $('detailText');
  const toastEl = $('toast');
  const hintEl = $('hint');
  const editbar = $('editbar');
  const editToggle = $('editToggle');
  const editToggleText = $('editToggleText');
  const addPlaceBtn = $('addPlace');
  const imageInput = $('imageInput');
  const jsonInput = $('jsonInput');
  const mini = $('mini');
  const miniBox = $('miniBox');
  const miniCtx = mini.getContext('2d');
  const gate = $('gate');
  const gateInput = $('gateInput');
  const gateMsg = $('gateMsg');
  const badge = $('badge');
  const caption = $('caption');
  const captionCount = $('captionCount');
  const captionName = $('captionName');
  const captionText = $('captionText');
  const tourBar = $('tourBar');
  const tourCount = $('tourCount');
  const tourFill = $('tourFill');
  const tourPauseBtn = $('tourPause');
  const tourMeta = $('tourMeta');
  const tourLabel = document.querySelector('.tour-start__label');
  const ruteBar = $('ruteBar');
  const ruteTekst = $('ruteTekst');

  /* ---------- tilstand ---------- */
  const meta = { navn: DEFAULT_TITLE };
  const state = {
    places: [],        // det der vises (udgivet fil, eller kladden hvis den er aktiv)
    active: -1,
    editing: false,
    armed: false,
    rows: [],
    dots: [],
    objectUrl: null,
    unlocked: false,
    touring: false,    // kører den guidede rundtur?
    rute: [],          // egen rundtur: stednavne i den rækkefølge de blev hakket af
    draft: false,      // er der en ikke-udgivet kladde i gang?
    draftText: '',
    imageDirty: false, // er der et nyt billede, der ikke er hentet ud?
    shared: null,      // senest hentede udgave af den fælles fil
    sharedText: '',
    pendingText: '',   // det vi sidst hentede ud, men endnu ikke har lagt op
  };
  const tour = { on: false, paused: false, i: 0, timer: 0, rute: [] };   // rute: navnene turen følger
  const img = { w: 1, h: 1, fit: 1 };
  const view = { tx: 0, ty: 0, zoom: 1 };
  const focus = { x: 0, y: 0 };       // hvor et sted skal lande på skærmen
  let vw = 0, vh = 0, visL = 0, visR = 0, visT = 0, visB = 0;
  let stopTween = null;
  let miniReady = false;
  let fraLink = null;       // en delt rute fra adressen (#rute=…), som skal åbne sig selv

  /* ---------- småting ---------- */
  /** Filnavn uden danske tegn og dobbelte bindestreger. */
  const slug = (s) => String(s || 'kort').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kort';

  const pad2 = (n) => String(n + 1).padStart(2, '0');
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  /** Kør én gang — både via requestAnimationFrame og et ur som fallback, så
      animationen også kører i en fane hvor rAF er sat på pause. */
  function frame(fn) {
    let done = false;
    const run = () => { if (done) return; done = true; fn(); };
    const id = requestAnimationFrame(run);
    const tid = setTimeout(run, 24);
    return () => { done = true; cancelAnimationFrame(id); clearTimeout(tid); };
  }

  /** Gentaget kald indtil cb returnerer false. Returnerer en stop-funktion. */
  function ticker(cb) {
    const st = { stop: false, raf: 0, tid: 0 };
    const run = () => {
      if (st.stop) return;
      if (cb() === false) return;
      st.raf = requestAnimationFrame(run);
      st.tid = setTimeout(run, 20);
    };
    st.raf = requestAnimationFrame(run);
    st.tid = setTimeout(run, 20);
    return () => { st.stop = true; cancelAnimationFrame(st.raf); clearTimeout(st.tid); };
  }

  let toastTimer = 0;
  function toast(msg, ms = 3400) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  }

  /* ---------- lager ---------- */
  const idb = {
    open() {
      return new Promise((res, rej) => {
        if (!('indexedDB' in window)) return rej(new Error('no idb'));
        const r = indexedDB.open(IDB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('blobs');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async put(key, val) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(val, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
    async get(key) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('blobs', 'readonly');
        const q = tx.objectStore('blobs').get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    },
    async del(key) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
  };

  /** Et uploadet billede gemmes som to filer: fuld opløsning og et let forhåndsbillede. */
  async function storeImage(pair) {
    try { await idb.put('image', pair); } catch { /* privat tilstand */ }
  }

  async function readImage() {
    try {
      const v = await idb.get('image');
      if (!v) return null;
      if (v instanceof Blob) return { full: v, low: null };   // ældre gemt fil
      if (v.full instanceof Blob) return { full: v.full, low: v.low instanceof Blob ? v.low : null };
      return null;
    } catch { return null; }
  }

  /** Gør et sted-objekt fra fil eller kladde sikkert at bruge. */
  function cleanPlace(p) {
    return {
      navn: String(p?.navn ?? p?.name ?? 'Sted').slice(0, 60),
      tekst: String(p?.tekst ?? p?.beskrivelse ?? '').slice(0, 400),
      x: clamp(Number(p?.x ?? .5) || 0, 0, 1),
      y: clamp(Number(p?.y ?? .5) || 0, 0, 1),
      zoom: clamp(Number(p?.zoom ?? 3) || 3, 1.2, 6)
    };
  }

  /** Tager en kopi, så kladden og den udgivne fil ikke deler det samme array. */
  const copyPlaces = (list) => list.map((p) => ({ ...p }));

  function cleanShared(data) {
    const list = Array.isArray(data) ? data : data?.places;
    if (!Array.isArray(list) || !list.length) throw new Error('ingen steder i filen');
    return {
      navn: String(data?.navn ?? DEFAULT_TITLE).slice(0, 60),
      places: list.map(cleanPlace)
    };
  }

  /** Læser den fælles fil. Returnerer både rå tekst og tolket indhold, så
      vi kan se om filen faktisk har ændret sig. */
  async function fetchShared() {
    const res = await fetch(`${SHARED_FILE}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return { text, data: cleanShared(JSON.parse(text)) };
  }

  /* ---------- kladden: ændringer der endnu ikke er lagt op ---------- */
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_LS);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.places) || !data.places.length) return null;
      return cleanShared(data);
    } catch { return null; }
  }

  let draftTimer = 0;
  function saveDraft() {
    if (!state.draft) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        const data = { navn: meta.navn, udgave: 1, kladde: true, places: state.places };
        state.draftText = JSON.stringify(data, null, 2);
        localStorage.setItem(DRAFT_LS, JSON.stringify(data));
      } catch { /* fuld eller blokeret — ikke kritisk */ }
    }, 220);
  }

  function clearDraftFlags() {
    clearTimeout(draftTimer);
    state.draft = false;
    state.draftText = '';
    try { localStorage.removeItem(DRAFT_LS); } catch { }
  }

  /* ---------- nøglen ---------- */
  function askKey() {
    gateMsg.textContent = '';
    gateInput.value = '';
    gate.hidden = false;
    void gate.offsetWidth;
    gate.classList.add('is-on');
    setTimeout(() => gateInput.focus(), 80);
  }

  function closeGate() {
    gate.classList.remove('is-on', 'is-shake');
    gate.hidden = true;
  }

  function tryUnlock() {
    if (gateInput.value.trim().toLowerCase() !== EDIT_KEY) {
      gateMsg.textContent = 'Forkert nøgle — prøv igen.';
      gate.classList.remove('is-shake');
      void gate.offsetWidth;
      gate.classList.add('is-shake');
      gateInput.select();
      return;
    }
    state.unlocked = true;
    try { localStorage.setItem(UNLOCK_LS, '1'); } catch { }
    closeGate();
    setEditing(true);
    toast('Redigering låst op. Ændringer samles i en kladde, til du henter kortet ud.', 5600);
  }

  function lockEditing() {
    state.unlocked = false;
    try { localStorage.removeItem(UNLOCK_LS); } catch { }
    setEditing(false);
    toast('Redigeringen er låst igen.');
  }

  /** Tegner menu og prikker om efter state.places — kameraet bliver hvor det er. */
  function applyPlaces() {
    const name = state.active >= 0 ? state.places[state.active]?.navn : null;
    state.active = name ? state.places.findIndex((p) => p.navn === name) : -1;
    // Ruten følger filen: steder der er forsvundet, ryger ud af den.
    const før = state.rute.length;
    state.rute = state.rute.filter((n) => state.places.some((p) => p.navn === n));
    if (state.rute.length !== før) gemRute();
    if (tour.on && tour.i >= tour.rute.length) tour.i = 0;
    renderMenu();
    buildMarkers();
    state.dots.forEach((el) => el.classList.toggle('is-editing', state.editing));
    renderDetail();
    applyView();
  }

  /** Kaldes hver gang et sted ændres. Starter en kladde, hvis nøglen er låst op. */
  function touch() {
    if (!state.unlocked) return;
    if (!state.draft) { state.draft = true; toast('Ændringen ligger i en kladde, indtil du henter kortet ud.', 4200); }
    renderBadge();
    saveDraft();
  }

  /* ---------- statuslinjen i redigeringsbjælken ---------- */
  function renderBadge() {
    if (!badge) return;
    const bits = [];
    if (state.draft) bits.push('Kladde — ikke udgivet');
    if (state.imageDirty) bits.push('Nyt billede — ikke udgivet');
    badge.textContent = bits.join(' · ');
    badge.classList.toggle('is-on', bits.length > 0);
  }

  /* ---------- den fælles fil følges live ---------- */
  let polling = false;
  async function pollShared(silent) {
    if (document.hidden || state.draft || !state.shared) return;
    if (polling) return;
    polling = true;
    try {
      const fresh = await fetchShared();
      if (fresh.text === state.sharedText) return;
      state.shared = fresh.data;
      state.sharedText = fresh.text;
      if (state.draft) return;                       // kladden bestemmer visningen
      if (state.pendingText && fresh.text !== state.pendingText) {
        // Filen er ændret til noget andet end det, vi lige hentede ud.
        toast('Den fælles fil er ændret af en anden. Hent kortet ud igen for at overskrive.', 6500);
        return;
      }
      const wasPending = !!state.pendingText && fresh.text === state.pendingText;
      state.pendingText = '';
      state.places = copyPlaces(fresh.data.places);
      meta.navn = fresh.data.navn;
      $('title').textContent = meta.navn;
      document.title = `${meta.navn} — interaktivt kort`;
      applyPlaces();
      if (silent) return;
      toast(wasPending
        ? 'Filen på serveren matcher nu det, du hentede ud.'
        : 'Kortet er opdateret med nye steder.', 4200);
    } catch { /* filen kan mangle et øjeblik — vi prøver igen */ }
    finally { polling = false; }
  }

  /* ---------- geometri ---------- */
  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    // offsetLeft/offsetWidth bruges, så målingen ikke påvirkes af indgangs-animationen
    const sheet = matchMedia('(max-width: 900px)').matches;
    if (sheet) {
      visL = 0; visR = vw; visT = 0;
      visB = Math.max(180, vh - panel.offsetHeight);
    } else {
      visL = Math.min(panel.offsetLeft + panel.offsetWidth + 6, vw - 220);
      visR = vw; visT = 0; visB = vh;
    }
    const availW = visR - visL;
    const availH = visB - visT;
    img.fit = Math.max(.0001, Math.min(availW / img.w, availH / img.h));
    focus.x = visL + availW / 2;
    focus.y = visT + availH / 2;

    // fortællingen holder sig inden for illustrationsområdet
    if (sheet) {
      caption.style.left = '';
      caption.style.bottom = Math.round(vh - visB + 14) + 'px';
    } else {
      caption.style.left = Math.round((visL + visR) / 2) + 'px';
      caption.style.bottom = '';
    }
  }

  function clampTranslate(tx, ty, k) {
    const Wk = img.w * k, Hk = img.h * k;
    const availW = visR - visL, availH = visB - visT;
    if (Wk >= availW) tx = clamp(tx, visR - Wk, visL);
    else tx = visL + (availW - Wk) / 2;
    if (Hk >= availH) ty = clamp(ty, visB - Hk, visT);
    else ty = visT + (availH - Hk) / 2;
    return { tx, ty };
  }

  const zoomOf = (k) => k / img.fit;
  const project = (u, v, k) => ({ x: view.tx + u * img.w * k, y: view.ty + v * img.h * k });
  const unproject = (sx, sy, k) => ({ u: (sx - view.tx) / (img.w * k), v: (sy - view.ty) / (img.h * k) });

  function applyView() {
    const k = view.zoom * img.fit;
    world.style.transform = `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${k})`;
    placeMarkers(k);
    drawThread(k);
    drawMini(k);
  }

  /** Flyv til et punkt (normaliserede koordinater) med et givet zoom. */
  function cancelTween() {
    if (stopTween) { stopTween(); stopTween = null; }
  }

  /** Hvor lang tid turen hen til et punkt tager — bruges også af rundturen. */
  function travelMs(u, v) {
    const k0 = view.zoom * img.fit;
    const c0 = unproject(focus.x, focus.y, k0);
    const dist = Math.hypot((u - c0.u) * img.w, (v - c0.v) * img.h) * img.fit;
    return REDUCED ? 1 : clamp(700 + dist * 1.6, 850, 1700);
  }

  function tweenTo(u, v, zoom, dur) {
    const z0 = view.zoom;
    const z1 = clamp(zoom || 2.8, MIN_ZOOM, MAX_ZOOM);
    const k0 = z0 * img.fit;
    const c0 = unproject(focus.x, focus.y, k0);   // kameraets centrum i billed-koordinater
    const c1 = { u, v };
    const time = REDUCED ? 1 : (dur || travelMs(u, v));
    const t0 = performance.now();

    cancelTween();
    stopTween = ticker(() => {
      const t = time <= 1 ? 1 : Math.min(1, (performance.now() - t0) / time);
      const e = easeOutQuart(t);
      const z = z0 * Math.pow(z1 / z0, e);
      const cu = c0.u + (c1.u - c0.u) * e;
      const cv = c0.v + (c1.v - c0.v) * e;
      const k = z * img.fit;
      const c = clampTranslate(focus.x - cu * img.w * k, focus.y - cv * img.h * k, k);
      view.tx = c.tx; view.ty = c.ty; view.zoom = z;
      applyView();
      if (t < 1) return true;
      stopTween = null;
      onArrive();
      return false;
    });
  }

  function onArrive() {
    const p = state.places[state.active];
    if (!p) return;
    const k = view.zoom * img.fit;
    const pt = project(p.x, p.y, k);
    const pulse = document.createElement('div');
    pulse.className = 'pulse';
    pulse.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0)`;
    markersEl.appendChild(pulse);
    setTimeout(() => pulse.remove(), 1600);
  }

  function zoomAt(factor, sx, sy) {
    cancelTween();
    const k0 = view.zoom * img.fit;
    const before = unproject(sx, sy, k0);
    const z = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = z * img.fit;
    const raw = { tx: sx - before.u * img.w * k, ty: sy - before.v * img.h * k };
    const c = clampTranslate(raw.tx, raw.ty, k);
    view.zoom = z; view.tx = c.tx; view.ty = c.ty;
    applyView();
  }

  /* ---------- markører ---------- */
  function buildMarkers() {
    markersEl.innerHTML = '';
    state.dots = state.places.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'marker';
      el.innerHTML =
        `<span class="marker__halo"></span>` +
        `<span class="marker__dot">${i + 1}</span>` +
        `<span class="marker__label"></span>`;
      el.querySelector('.marker__label').textContent = p.navn;
      el.addEventListener('pointerenter', () => { el.classList.add('is-hover'); });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.__dragged) { el.__dragged = false; return; }
        select(i);
        if (state.editing) toggleEditor(i, true);
      });
      el.addEventListener('pointerdown', (e) => {
        if (!state.editing) return;
        startMarkerDrag(e, i);
      });
      markersEl.appendChild(el);
      return el;
    });
    renderRute();          // prikkerne skal have ring, hvis stedet er hakket af
  }

  function refreshMarkerLabels() {
    state.dots.forEach((el, i) => {
      el.querySelector('.marker__label').textContent = state.places[i].navn;
    });
  }

  function placeMarkers(k) {
    const flipAt = visL + (visR - visL) * .62;
    state.dots.forEach((el, i) => {
      const p = state.places[i];
      const pt = project(p.x, p.y, k);
      el.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0)`;
      el.classList.toggle('is-flipped', pt.x > flipAt);
      const on = i === state.active;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-hidden', on || pt.x < -40 || pt.x > vw + 40 || pt.y < -40 || pt.y > vh + 40 ? 'true' : 'false');
    });
  }

  /* ---------- tråd ---------- */
  let stopSpark = null;
  function drawThread(k) {
    const i = state.active;
    const row = state.rows[i];
    if (i < 0 || !row) {
      thread.classList.remove('is-on');
      return;
    }
    const p = state.places[i];
    const pt = project(p.x, p.y, k);
    const r = row.getBoundingClientRect();
    const ax = r.right - 2, ay = r.top + r.height / 2;
    const dx = Math.max(50, Math.abs(pt.x - ax) * .38);
    thread.setAttribute('d',
      `M${ax.toFixed(1)} ${ay.toFixed(1)} C ${(ax + dx).toFixed(1)} ${ay.toFixed(1)}, ` +
      `${(pt.x - dx).toFixed(1)} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
    thread.classList.add('is-on');
  }

  function flyDot() {
    if (REDUCED) return;
    const path = thread;
    let len = 0;
    try { len = path.getTotalLength(); } catch { return; }
    if (!len) return;
    if (stopSpark) stopSpark();
    const t0 = performance.now();
    const dur = 780;
    stopSpark = ticker(() => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const pt = path.getPointAtLength(len * easeOutQuart(t));
      spark.setAttribute('cx', pt.x.toFixed(1));
      spark.setAttribute('cy', pt.y.toFixed(1));
      spark.setAttribute('r', (4.4 - 1.6 * t).toFixed(2));
      spark.style.opacity = (1 - Math.pow(t, 3)).toFixed(2);
      if (t < 1) return true;
      stopSpark = null;
      return false;
    });
  }
  const NS = 'http://www.w3.org/2000/svg';
  const spark = document.createElementNS(NS, 'circle');
  spark.setAttribute('r', '4');
  spark.setAttribute('fill', '#ffb703');
  spark.style.filter = 'drop-shadow(0 0 8px rgba(255,183,3,.9))';
  spark.style.opacity = '0';
  threads.appendChild(spark);

  /* ---------- menu ---------- */
  function renderMenu() {
    menuEl.innerHTML = '';
    state.rows = [];
    state.places.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.style.setProperty('--i', i);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row__btn';
      btn.innerHTML =
        `<span class="row__num">${pad2(i)}</span>` +
        `<span class="row__name"></span>` +
        `<span class="row__cue"></span>`;
      btn.querySelector('.row__name').textContent = p.navn;
      btn.addEventListener('click', () => {
        select(i);
        if (state.editing) toggleEditor(i, true);
      });
      btn.addEventListener('pointerenter', () => {
        markersEl.classList.remove('is-muted');
        state.dots[i]?.classList.add('is-hover');
      });
      btn.addEventListener('pointerleave', () => {
        state.dots[i]?.classList.remove('is-hover');
      });

      // Hakket: melder stedet med i den besøgendes egen rundtur. Det står ved
      // siden af rækkeknappen, så et klik her ikke flytter kameraet.
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'row__pick';
      pick.setAttribute('aria-pressed', 'false');
      pick.addEventListener('click', () => skiftHak(p.navn));

      const edit = document.createElement('div');
      edit.className = 'row__edit';
      edit.innerHTML =
        `<div class="field"><span class="field__label">Navn</span>` +
        `<input type="text" data-f="navn" maxlength="60"></div>` +
        `<div class="field"><span class="field__label">Fortælling</span>` +
        `<textarea rows="2" data-f="tekst" maxlength="400"></textarea></div>` +
        `<div class="field"><span class="field__label">Zoom i fokus</span>` +
        `<input type="range" data-f="zoom" min="1.2" max="6" step="0.1"></div>` +
        `<div class="row__actions">` +
        `<button class="mini-btn" data-a="center" type="button">Centrér</button>` +
        `<button class="mini-btn mini-btn--danger" data-a="del" type="button">Slet sted</button>` +
        `</div>`;

      const nameInput = edit.querySelector('[data-f="navn"]');
      const textInput = edit.querySelector('[data-f="tekst"]');
      const zoomInput = edit.querySelector('[data-f="zoom"]');

      const sync = () => {
        const før = state.places[i].navn;
        state.places[i].navn = nameInput.value.trim() || 'Uden navn';
        // Hakkene huskes på navn, så et nyt navn skal følge med ruten.
        const iRuten = state.rute.indexOf(før);
        if (iRuten >= 0 && før !== state.places[i].navn) {
          state.rute[iRuten] = state.places[i].navn;
          gemRute();
        }
        state.places[i].tekst = textInput.value;
        btn.querySelector('.row__name').textContent = state.places[i].navn;
        const dot = state.dots[i];
        if (dot) dot.querySelector('.marker__label').textContent = state.places[i].navn;
        renderRute();
        renderDetail();
        touch();
      };
      nameInput.addEventListener('input', sync);
      textInput.addEventListener('input', sync);
      zoomInput.addEventListener('input', () => {
        state.places[i].zoom = Number(zoomInput.value);
        touch();
      });

      edit.querySelector('[data-a="center"]').addEventListener('click', () => {
        select(i, true);
      });
      edit.querySelector('[data-a="del"]').addEventListener('click', () => removePlace(i));

      li.append(pick, btn, edit);
      menuEl.appendChild(li);
      state.rows.push(li);
      li.__fields = { nameInput, textInput, zoomInput };
      li.__pick = pick;
    });
    updateActiveRows();
    renderRute();
  }

  function updateActiveRows() {
    state.rows.forEach((li, i) => {
      li.classList.toggle('is-active', i === state.active);
      if (!state.editing || i !== state.active) li.classList.remove('is-open');
    });
    if (state.editing && state.active >= 0) state.rows[state.active]?.classList.add('is-open');
  }

  function toggleEditor(i, force) {
    const row = state.rows[i];
    if (!row) return;
    const open = force === undefined ? !row.classList.contains('is-open') : force;
    if (open) {
      const p = state.places[i];
      row.__fields.nameInput.value = p.navn;
      row.__fields.textInput.value = p.tekst || '';
      row.__fields.zoomInput.value = String(p.zoom || 2.8);
    }
    row.classList.toggle('is-open', open);
  }

  function renderDetail() {
    if (tour.on) {
      const n = tour.rute.length || state.places.length;
      const ord = ruteNavne().length ? 'Din rundtur' : 'Rundtur';
      tourBar.hidden = false;
      detailEmpty.hidden = true;
      detailBody.hidden = true;
      tourCount.textContent = `${ord} · ${Math.min(tour.i + 1, n)} af ${n}`;
      tourFill.style.width = (((tour.i + (tour.paused ? 0 : 1)) / n) * 100).toFixed(1) + '%';
      tourPauseBtn.textContent = tour.paused ? '▶ Fortsæt' : '⏸ Pause';
      return;
    }
    tourBar.hidden = true;
    const i = state.active;
    if (i < 0 || !state.places[i]) {
      detailEmpty.hidden = false;
      detailBody.hidden = true;
      return;
    }
    const p = state.places[i];
    detailEmpty.hidden = true;
    detailBody.hidden = false;
    detailCount.textContent = `Sted ${pad2(i)} · ${i + 1} af ${state.places.length}`;
    detailName.textContent = p.navn;
    detailText.textContent = p.tekst || '';
    detailBody.style.animation = 'none';
    void detailBody.offsetWidth;
    detailBody.style.animation = '';
  }

  /* ---------- vælg sted ---------- */
  function select(i, keepZoom) {
    if (!state.places[i]) return;
    const changed = i !== state.active;
    state.active = i;
    if (tour.on) showCaption(i);
    updateActiveRows();
    renderDetail();
    const row = state.rows[i];
    row?.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
    const p = state.places[i];
    const z = keepZoom ? Math.max(view.zoom, 2.4) : (p.zoom || 2.8);
    tweenTo(p.x, p.y, z);
    if (changed) {
      frame(() => { drawThread(view.zoom * img.fit); flyDot(); });
    }
    hideHint();
  }

  function step(delta) {
    if (!state.places.length) return;
    const n = state.places.length;
    const i = state.active < 0 ? (delta > 0 ? 0 : n - 1) : (state.active + delta + n) % n;
    select(i);
  }

  /* ---------- den personlige rute ---------- */

  /** Navnene den besøgende har hakket af — i den rækkefølge de blev valgt. */
  function ruteNavne() {
    return state.rute.filter((n) => state.places.some((p) => p.navn === n));
  }

  function navnTilIndeks(navn) {
    return state.places.findIndex((p) => p.navn === navn);
  }

  /** Rækkefølgen turen skal følge: den personlige rute, ellers alle steder. */
  function turRækkefølge() {
    const valgte = ruteNavne();
    return valgte.length ? valgte : state.places.map((p) => p.navn);
  }

  const stedTal = (n) => `${n} ${n === 1 ? 'sted' : 'steder'}`;

  function hvorLænge(sek) {
    return sek < 60
      ? `ca. ${Math.max(5, Math.round(sek / 5) * 5)} sek.`
      : `ca. ${Math.max(1, Math.round(sek / 60))} min`;
  }

  /** Hvor lang tid turen varer, i sekunder — regnet på den rækkefølge turen følger. */
  function ruteSekunder() {
    return turRækkefølge().reduce((s, n) => {
      const p = state.places[navnTilIndeks(n)];
      return s + (p ? (dwellFor(p) + 1300) / 1000 : 0);
    }, 0);
  }

  function gemRute() {
    try { localStorage.setItem(RUTE_LS, JSON.stringify(state.rute)); } catch { }
  }

  /** Sætter eller fjerner et hak. Kameraet bliver hvor det er. */
  function skiftHak(navn) {
    const plads = state.rute.indexOf(navn);
    if (plads >= 0) state.rute.splice(plads, 1);
    else state.rute.push(navn);
    gemRute();
    renderRute();
  }

  /** Sætter hele ruten på én gang — brugt af "Alle" og "Ryd". */
  function sætRute(navne) {
    state.rute = navne.slice();
    gemRute();
    renderRute();
  }

  /** Opdaterer hak, prikker, linjen og startknappen efter ruten. */
  function renderRute() {
    const navne = ruteNavne();
    state.rows.forEach((li, i) => {
      const plads = navne.indexOf(state.places[i]?.navn);
      const pick = li.__pick;
      if (pick) {
        pick.classList.toggle('is-valgt', plads >= 0);
        pick.textContent = plads >= 0 ? String(plads + 1) : '';
        pick.setAttribute('aria-pressed', plads >= 0 ? 'true' : 'false');
        pick.title = plads >= 0
          ? `Sted ${plads + 1} i din rundtur — tryk for at tage det ud`
          : 'Tag med i din egen rundtur';
      }
      state.dots[i]?.classList.toggle('is-valgt', plads >= 0);
    });

    const n = navne.length;
    ruteBar.hidden = !n;
    if (n) ruteTekst.textContent = `${stedTal(n)} valgt · ${hvorLænge(ruteSekunder())}`;
    if (tourLabel) tourLabel.textContent = n ? 'Se din rundtur' : 'Se rundturen';
    if (tourMeta) tourMeta.textContent = tourSummary();
  }

  /* ---------- del ruten med et link ---------- */

  /** Ruten som et stykke adresse: navnene procent-kodes, så kommaer i navne ikke kan forvirre. */
  function ruteHash(navne) {
    return navne.map((n) => encodeURIComponent(n)).join(',');
  }

  /** Læser en delt rute ud af adressen. Returnerer null, hvis der ikke er nogen. */
  function hashRute() {
    const h = location.hash.replace(/^#/, '');
    if (!h.startsWith('rute=')) return null;
    try {
      return h.slice(5).split(',').map((s) => decodeURIComponent(s)).filter(Boolean);
    } catch { return null; }
  }

  /** Adressen der åbner netop den rute, der er hakket af nu. */
  function ruteAdresse() {
    const base = location.origin + location.pathname + location.search;
    return `${base}#rute=${ruteHash(ruteNavne())}`;
  }

  /** Lægger teksten i udklipsholderen — med den gamle vej som bagstopper. */
  async function kopiér(tekst) {
    try {
      await navigator.clipboard.writeText(tekst);
      return true;
    } catch { /* udklipsholderen kan være spærret, fx uden https */ }
    try {
      const felt = document.createElement('textarea');
      felt.value = tekst;
      felt.setAttribute('readonly', '');
      felt.style.position = 'fixed';
      felt.style.top = '-1000px';
      document.body.appendChild(felt);
      felt.select();
      const ok = document.execCommand('copy');
      felt.remove();
      return ok;
    } catch { return false; }
  }

  async function delRute() {
    const navne = ruteNavne();
    if (!navne.length) return;
    const adresse = ruteAdresse();
    if (await kopiér(adresse)) {
      toast(`Linket er kopieret — send det til dem, du vil vise ruten til. ${stedTal(navne.length)} · ${hvorLænge(ruteSekunder())}`, 5600);
      return;
    }
    // Kunne vi ikke lægge det i udklipsholderen, får man det at se, så det kan markeres selv.
    prompt('Kopiér linket til din rundtur:', adresse);
  }

  /* ---------- guidet rundtur ---------- */
  /** Hvor længe der hviler på et sted. Længere fortællinger får mere tid. */
  function dwellFor(p) {
    const len = (p.tekst || '').length;
    return REDUCED ? clamp(6400 + len * 34, 7000, 12000) : clamp(3200 + len * 32, 5200, 10500);
  }

  function tourSummary() {
    const række = turRækkefølge();
    if (!række.length) return 'Ingen steder endnu';
    return `${stedTal(række.length)} · ${hvorLænge(ruteSekunder())}`;
  }

  function showCaption(i) {
    const p = state.places[i];
    if (!p) return;
    // Under en tur tælles der i turens rækkefølge, ellers i listens.
    const n = tour.on && tour.rute.length ? tour.rute.length : state.places.length;
    const plads = tour.on && tour.rute.length ? tour.i + 1 : i + 1;
    captionCount.textContent = `Sted ${String(plads).padStart(2, '0')} af ${String(n).padStart(2, '0')}`;
    captionName.textContent = p.navn;
    captionText.textContent = p.tekst || '';
    caption.classList.toggle('has-text', !!p.tekst);
    caption.classList.remove('is-on');
    void caption.offsetWidth;          // så animationen spiller igen for hvert sted
    caption.classList.add('is-on');
  }

  function startTour() {
    if (state.places.length < 1) { toast('Der er ingen steder at vise endnu.'); return; }
    if (state.editing) setEditing(false);
    disarm();
    hideHint();
    tour.rute = turRækkefølge();
    tour.on = true;
    tour.paused = false;
    tour.i = 0;
    state.touring = true;
    app.classList.add('is-touring');
    markersEl.classList.add('is-muted');
    stepTour();
  }

  function stepTour() {
    clearTimeout(tour.timer);
    if (!tour.on || tour.paused) return;
    if (tour.i >= tour.rute.length) return endTour();
    const i = navnTilIndeks(tour.rute[tour.i]);
    if (i < 0) { tour.i++; return stepTour(); }   // stedet er væk fra den fælles fil
    const p = state.places[i];
    const wait = travelMs(p.x, p.y) + dwellFor(p);
    select(i);
    tour.timer = setTimeout(() => {
      if (!tour.on || tour.paused) return;
      tour.i++;
      stepTour();
    }, wait);
  }

  function pauseTour(force) {
    if (!tour.on) return;
    tour.paused = force === undefined ? !tour.paused : force;
    clearTimeout(tour.timer);
    if (tour.paused) {
      renderDetail();
      toast('Rundturen holder pause. Tryk Fortsæt for at tage resten.', 3600);
      return;
    }
    renderDetail();
    const p = state.places[navnTilIndeks(tour.rute[tour.i])] || { tekst: '' };
    tour.timer = setTimeout(() => {
      if (!tour.on || tour.paused) return;
      tour.i++;
      stepTour();
    }, Math.max(1600, dwellFor(p) * .55));
  }

  function leaveTourUi() {
    tour.on = false;
    tour.paused = false;
    state.touring = false;
    clearTimeout(tour.timer);
    app.classList.remove('is-touring');
    caption.classList.remove('is-on', 'has-text');
  }

  /** Rundturen er kørt til ende — vis hele illustrationen igen. */
  function endTour() {
    const n = tour.rute.length || state.places.length;
    const egen = ruteNavne().length > 0;
    leaveTourUi();
    tour.i = 0;
    state.active = -1;
    updateActiveRows();
    fitView();
    renderDetail();
    toast(`${egen ? 'Din rundtur' : 'Rundturen'} er slut — ${stedTal(n)}. Tryk på knappen for at se den igen.`, 5200);
  }

  /**
   * Når turen stoppes midtvejs, bliver man stående ved det sted, man så på —
   * og så er startknappen skjult bag det valgte sted. Beskeden siger derfor,
   * hvordan man finder den igen.
   */
  const STOP_HINT = 'Rundturen er stoppet. Tryk t for at starte forfra, eller ⤢ for hele kortet.';
  const TAKEOVER_HINT = 'Du tog over — rundturen er stoppet. Tryk t for at starte forfra.';

  /** Nogen tog over med musen eller tastaturet. */
  function stopTour(msg) {
    if (!tour.on) return;
    leaveTourUi();
    renderDetail();
    if (msg) toast(msg, 4600);
  }

  /* ---------- panorering og zoom ---------- */
  function bindStage() {
    let dragging = false, px = 0, py = 0, moved = 0, vx = 0, vy = 0, last = 0, id = null;
    let armedAt = null;

    scene.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.marker')) return;
      if (state.armed) { armedAt = { x: e.clientX, y: e.clientY }; return; }   // klar til "nyt sted"
      dragging = true; moved = 0; id = e.pointerId;
      px = e.clientX; py = e.clientY; last = performance.now();
      vx = vy = 0;
      try { scene.setPointerCapture(id); } catch { /* uden rigtig pointer – så panorerer vi bare uden lås */ }
      scene.classList.add('is-panning');
      cancelTween();
    });

    scene.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== id) return;
      const now = performance.now();
      const dt = Math.max(1, now - last);
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY; last = now;
      moved += Math.abs(dx) + Math.abs(dy);
      view.tx += dx; view.ty += dy;
      vx = (dx / dt) * 16; vy = (dy / dt) * 16;
      const k = view.zoom * img.fit;
      const c = clampTranslate(view.tx, view.ty, k);
      view.tx = c.tx; view.ty = c.ty;
      applyView();
      hideHint();
    });

    const end = (e) => {
      if (!dragging || (e && e.pointerId !== id)) return;
      dragging = false;
      scene.classList.remove('is-panning');
      try { scene.releasePointerCapture(id); } catch { }
      // lidt inerti
      if (Math.hypot(vx, vy) > 2) {
        ticker(() => {
          vx *= .92; vy *= .92;
          view.tx += vx; view.ty += vy;
          const c = clampTranslate(view.tx, view.ty, view.zoom * img.fit);
          view.tx = c.tx; view.ty = c.ty;
          applyView();
          return Math.hypot(vx, vy) > .35;
        });
      }
    };
    scene.addEventListener('pointerup', end);
    scene.addEventListener('pointercancel', end);

    scene.addEventListener('click', (e) => {
      if (!state.armed) return;
      const far = armedAt ? Math.hypot(e.clientX - armedAt.x, e.clientY - armedAt.y) : 0;
      armedAt = null;
      if (far > 6) return;
      const k = view.zoom * img.fit;
      const u = unproject(e.clientX, e.clientY, k);
      if (u.u < 0 || u.u > 1 || u.v < 0 || u.v > 1) return;
      addPlace(u.u, u.v);
    });

    scene.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0018));
      zoomAt(factor, e.clientX, e.clientY);
      hideHint();
    }, { passive: false });

    // pinch
    const pts = new Map();
    scene.addEventListener('pointerdown', (e) => pts.set(e.pointerId, e));
    scene.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size !== 2) return;
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
      if (scene.__pinch) {
        zoomAt(d / scene.__pinch, cx, cy);
        dragging = false;
      }
      scene.__pinch = d;
    });
    const clearPt = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) scene.__pinch = 0;
    };
    scene.addEventListener('pointerup', clearPt);
    scene.addEventListener('pointercancel', clearPt);

    // minikort
    mini.parentElement.addEventListener('pointerdown', (e) => {
      const r = mini.getBoundingClientRect();
      const s = Math.min(r.width / img.w, r.height / img.h);
      const ox = (r.width - img.w * s) / 2, oy = (r.height - img.h * s) / 2;
      const u = (e.clientX - r.left - ox) / (img.w * s);
      const v = (e.clientY - r.top - oy) / (img.h * s);
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      tweenTo(u, v, Math.max(view.zoom, 2.6), 900);
    });
  }

  /* ---------- minikort ---------- */
  function paintMini() {
    const cw = mini.width, ch = mini.height;
    miniCtx.clearRect(0, 0, cw, ch);
    const s = Math.min(cw / img.w, ch / img.h);
    const dw = img.w * s, dh = img.h * s;
    miniCtx.drawImage(poster, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    miniCtx.fillStyle = 'rgba(0,0,0,.25)';
    miniCtx.fillRect(0, 0, cw, ch);
    miniReady = true;
  }

  function drawMini(k) {
    if (!miniReady) return;
    const cw = mini.width, ch = mini.height;
    const s = Math.min(cw / img.w, ch / img.h);
    const ox = (cw - img.w * s) / 2, oy = (ch - img.h * s) / 2;
    const x0 = clamp((visL - view.tx) / k, 0, img.w);
    const y0 = clamp((visT - view.ty) / k, 0, img.h);
    const x1 = clamp((visR - view.tx) / k, 0, img.w);
    const y1 = clamp((visB - view.ty) / k, 0, img.h);
    const pad = 6;
    miniBox.style.opacity = view.zoom <= 1.04 ? '0' : '1';
    miniBox.style.left = (pad + ox + x0 * s) + 'px';
    miniBox.style.top = (pad + oy + y0 * s) + 'px';
    miniBox.style.width = Math.max(6, (x1 - x0) * s) + 'px';
    miniBox.style.height = Math.max(6, (y1 - y0) * s) + 'px';
  }

  /* ---------- redigering ---------- */
  function setEditing(on) {
    state.editing = on;
    app.classList.toggle('is-editing', on);
    editbar.hidden = !on;
    editToggleText.textContent = on ? 'Færdig' : 'Redigér steder';
    if (!on) disarm();
    else toast('Redigeringstilstand: klik på et sted for at rette det, eller træk i prikkerne.', 5000);
    updateActiveRows();
    state.dots.forEach((el) => el.classList.toggle('is-editing', on));
    markersEl.classList.toggle('is-muted', false);
  }

  function arm() {
    state.armed = true;
    addPlaceBtn.classList.add('is-armed');
    scene.classList.add('is-adding');
    toast('Klik på illustrationen, hvor det nye sted ligger.', 4000);
  }
  function disarm() {
    state.armed = false;
    addPlaceBtn.classList.remove('is-armed');
    scene.classList.remove('is-adding');
  }

  function addPlace(u, v) {
    state.places.push({ navn: 'Nyt sted', x: u, y: v, zoom: 3, tekst: '' });
    const i = state.places.length - 1;
    disarm();
    renderMenu();
    buildMarkers();
    state.dots.forEach((el) => el.classList.add('is-editing'));
    select(i);
    toggleEditor(i, true);
    setTimeout(() => {
      const f = state.rows[i]?.__fields.nameInput;
      if (f) { f.focus(); f.select(); }
    }, 260);
    touch();
    hideHint();
  }

  function removePlace(i) {
    const p = state.places[i];
    if (!p) return;
    if (!confirm(`Slet "${p.navn}"?`)) return;
    const iRuten = state.rute.indexOf(p.navn);
    if (iRuten >= 0) { state.rute.splice(iRuten, 1); gemRute(); }
    state.places.splice(i, 1);
    if (state.active === i) state.active = -1;
    else if (state.active > i) state.active--;
    renderMenu();
    buildMarkers();
    state.dots.forEach((el) => el.classList.add('is-editing'));
    renderDetail();
    touch();
  }

  function startMarkerDrag(e, i) {
    e.preventDefault();
    e.stopPropagation();
    const el = state.dots[i];
    el.classList.add('is-dragging');
    try { el.setPointerCapture(e.pointerId); } catch { }
    const move = (ev) => {
      const k = view.zoom * img.fit;
      const u = unproject(ev.clientX, ev.clientY, k);
      state.places[i].x = clamp(u.u, 0, 1);
      state.places[i].y = clamp(u.v, 0, 1);
      el.__dragged = true;
      applyView();
    };
    const up = () => {
      el.classList.remove('is-dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      touch();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /* ---------- billede ---------- */
  /** Tager målene fra det billede, der netop er landet. */
  function adoptImage() {
    img.w = poster.naturalWidth || 1;
    img.h = poster.naturalHeight || 1;
    world.style.width = img.w + 'px';
    world.style.height = img.h + 'px';
  }

  /** Sætter illustrationen og venter på, at netop det <img> er færdigt — så
      minikort og målinger ikke bygger på et halvt indlæst billede. */
  let imageSeq = 0;      // tælles op hver gang et nyt billede sættes i gang

  function loadImageFrom(src, revoke) {
    imageSeq++;
    return new Promise((res, rej) => {
      const prev = state.objectUrl;
      poster.onload = () => {
        if (revoke) {
          if (prev && prev !== src) URL.revokeObjectURL(prev);
          state.objectUrl = src;
        }
        adoptImage();
        res();
      };
      poster.onerror = () => rej(new Error('kunne ikke læse billedet'));
      poster.src = src;
    });
  }

  /** Bytter det lette forhåndsbillede ud med fuld opløsning — uden at kameraet rykker. */
  let upgrading = false;
  async function upgradeToFullRes() {
    if (upgrading || !poster.src || poster.src.endsWith(DEFAULT_IMAGE)) return;
    upgrading = true;
    // samme udsnit før og efter, så opløsningsskiftet er usynligt
    const c = unproject(focus.x, focus.y, view.zoom * img.fit);
    const z = view.zoom;
    const prev = poster.src;
    const seq = imageSeq;
    try {
      poster.src = DEFAULT_IMAGE;
      await poster.decode();          // billedet er klar til at blive vist
    } catch {
      // decode() afviser også, hvis nogen har skiftet billede imens — så rører vi intet.
      if (seq === imageSeq && poster.src.endsWith(DEFAULT_IMAGE)) poster.src = prev;
      upgrading = false;
      return;
    }
    // Er der valgt et andet billede imens, rører vi ikke visningen.
    if (seq !== imageSeq || !poster.src.endsWith(DEFAULT_IMAGE)) { upgrading = false; return; }
    adoptImage();
    measure();
    const k = z * img.fit;
    const t = clampTranslate(focus.x - c.u * img.w * k, focus.y - c.v * img.h * k, k);
    cancelTween();
    view.zoom = z; view.tx = t.tx; view.ty = t.ty;
    applyView();
    paintMini();
    upgrading = false;
  }

  function fitView() {
    cancelTween();
    measure();
    const k = img.fit;
    const c = clampTranslate(focus.x - .5 * img.w * k, focus.y - .5 * img.h * k, k);
    view.zoom = 1; view.tx = c.tx; view.ty = c.ty;
    applyView();
  }

  /** Skalerer ned og koder som WebP — det format de udgivne filer har. */
  function encodeWebp(im, side, quality) {
    const s = Math.min(1, side / im.naturalWidth);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(im.naturalWidth * s));
    cv.height = Math.max(1, Math.round(im.naturalHeight * s));
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(im, 0, 0, cv.width, cv.height);
    return new Promise((res) => cv.toBlob(res, 'image/webp', quality));
  }

  async function handleUpload(file) {
    if (!state.unlocked) { askKey(); return; }
    if (!file.type.startsWith('image/')) { toast('Vælg en billedfil.'); return; }
    const url = URL.createObjectURL(file);
    toast('Læser illustrationen …', 20000);
    try {
      const im = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('bad image'));
        i.src = url;
      });
      URL.revokeObjectURL(url);
      const full = await encodeWebp(im, FULL_SIDE, .86);
      const low = await encodeWebp(im, LOW_SIDE, .75);
      if (!full) throw new Error('kunne ikke kode billedet');
      await storeImage({ full, low });
      state.imageDirty = true;
      renderBadge();

      const keep = confirm(
        'Vil du beholde de nuværende steder?\n\nOK = behold dem (flyt prikkerne bagefter)\nAfbryd = start forfra med tom liste');
      await loadImageFrom(URL.createObjectURL(full), true);
      if (!keep) {
        state.places = [];
        state.active = -1;
        renderMenu();
        buildMarkers();
        renderDetail();
        touch();
        setEditing(true);
        arm();
        toast('Ny illustration klar. Klik for at sætte det første sted.', 5200);
      } else {
        fitView();
        toast('Ny illustration indlæst. Træk i prikkerne, og hent kortet ud bagefter.', 5400);
        if (!state.editing) setEditing(true);
      }
      paintMini();
    } catch {
      URL.revokeObjectURL(url);
      toast('Kunne ikke læse billedet. Prøv en JPG, PNG eller WebP.');
    }
  }

  /* ---------- zip (uden komprimering — rigeligt til en håndfuld filer) ---------- */
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function makeZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const cen = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + data.length;
    }
    const cenSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- hent kortet ud / læs det ind ---------- */
  async function exportBundle() {
    const data = {
      navn: meta.navn,
      udgave: 1,
      opdateret: new Date().toISOString().slice(0, 19) + 'Z',
      places: state.places
    };
    const json = JSON.stringify(data, null, 2) + '\n';
    state.pendingText = json;      // vi bliver på dette kort, til filen matcher det
    const files = [{ name: SHARED_FILE, blob: new Blob([json], { type: 'application/json' }) }];
    const pair = await readImage();
    if (pair) {
      files.push({ name: DEFAULT_IMAGE, blob: pair.full });
      if (pair.low) files.push({ name: LOW_IMAGE, blob: pair.low });
    }
    download(await makeZip(files), slug(meta.navn) + '-kort.zip');

    // Det udpakkede indhold er nu klar til at lægge op. Lokalt holder vi op
    // med at kalde det en kladde, så siden igen følger den udgivne fil.
    clearDraftFlags();
    state.imageDirty = false;
    renderBadge();
    toast('Kortet er hentet som zip. Læg det på plads og udgiv med: node tools/publish.mjs', 7500);
  }

  function importJson(file) {
    if (!state.unlocked) { askKey(); return; }
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = cleanShared(JSON.parse(String(fr.result)));
        meta.navn = data.navn;
        $('title').textContent = meta.navn;
        document.title = `${meta.navn} — interaktivt kort`;
        state.places = copyPlaces(data.places);
        state.active = -1;
        state.draft = true;
        renderMenu();
        buildMarkers();
        renderDetail();
        renderBadge();
        touch();
        fitView();
        toast(`${state.places.length} steder indlæst som kladde.`);
      } catch {
        toast('Filen kunne ikke læses som et sted-ark.');
      }
    };
    fr.readAsText(file);
  }

  /** Kassér alt ugent, lokalt: kladden og det uploadede billede. */
  async function discardLocal() {
    if (!confirm('Kassér kladden og det uploadede billede og vis den udgivne fil igen?')) return;
    clearDraftFlags();
    state.pendingText = '';
    try { await idb.del('image'); } catch { }
    state.imageDirty = false;
    renderBadge();
    if (state.shared) {
      meta.navn = state.shared.navn;
      state.places = copyPlaces(state.shared.places);
      $('title').textContent = meta.navn;
      document.title = `${meta.navn} — interaktivt kort`;
      state.active = -1;
      applyPlaces();
    }
    if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
    try { await loadImageFrom(LOW_IMAGE, false); fitView(); paintMini(); upgradeToFullRes(); }
    catch { /* behold det vi har */ }
    toast('Kladden er kasseret. Siden viser den udgivne fil igen.');
  }

  /* ---------- opstart ---------- */
  function hideHint() { hintEl.classList.add('is-gone'); }

  function bindUi() {
    $('zoomIn').addEventListener('click', () => zoomAt(1.45, focus.x, focus.y));
    $('zoomOut').addEventListener('click', () => zoomAt(1 / 1.45, focus.x, focus.y));
    $('zoomFit').addEventListener('click', () => {
      state.active = -1;
      updateActiveRows();
      renderDetail();
      fitView();
    });
    $('prevBtn').addEventListener('click', () => step(-1));
    $('nextBtn').addEventListener('click', () => step(1));
    editToggle.addEventListener('click', () => {
      if (state.editing) return setEditing(false);
      if (!state.unlocked) return askKey();
      setEditing(true);
    });
    addPlaceBtn.addEventListener('click', () => (state.armed ? disarm() : arm()));
    $('uploadImage').addEventListener('click', () => {
      if (!state.unlocked) return askKey();
      imageInput.click();
    });
    imageInput.addEventListener('change', () => {
      const f = imageInput.files?.[0];
      if (f) handleUpload(f);
      imageInput.value = '';
    });
    $('exportBtn').addEventListener('click', exportBundle);
    $('importBtn').addEventListener('click', () => jsonInput.click());
    jsonInput.addEventListener('change', () => {
      const f = jsonInput.files?.[0];
      if (f) importJson(f);
      jsonInput.value = '';
    });
    $('discardBtn').addEventListener('click', discardLocal);
    $('lockBtn').addEventListener('click', lockEditing);

    // rundturen
    $('tourStart').addEventListener('click', startTour);
    tourPauseBtn.addEventListener('click', () => pauseTour());
    $('tourStop').addEventListener('click', () => stopTour(STOP_HINT));

    // den personlige rute
    $('ruteStart').addEventListener('click', startTour);
    $('ruteDel').addEventListener('click', delRute);
    $('ruteAlle').addEventListener('click', () => sætRute(state.places.map((p) => p.navn)));
    $('ruteRyd').addEventListener('click', () => sætRute([]));

    // nøglelågen
    $('gateForm').addEventListener('submit', (e) => { e.preventDefault(); tryUnlock(); });
    $('gateClose').addEventListener('click', closeGate);
    gate.addEventListener('pointerdown', (e) => { if (e.target === gate) closeGate(); });

    // følg den fælles fil uden at nogen skal genindlæse
    setInterval(() => pollShared(), POLL_MS);
    addEventListener('visibilitychange', () => { if (!document.hidden) pollShared(true); });
    addEventListener('focus', () => pollShared(true));

    addEventListener('resize', () => { measure(); applyView(); });
    addEventListener('orientationchange', () => setTimeout(() => { measure(); applyView(); }, 250));

    addEventListener('keydown', (e) => {
      if (e.target instanceof Element && e.target.matches('input, textarea')) return;
      if (e.key === 't' || e.key === 'T') {
        tour.on ? stopTour(STOP_HINT) : startTour();
        return;
      }
      if (e.key === ' ') {
        if (tour.on) { e.preventDefault(); pauseTour(); }
        return;
      }
      if (e.key === 'Escape') {
        if (tour.on) stopTour(STOP_HINT);
        disarm();
        if (state.editing) setEditing(false);
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        if (state.active >= 0) skiftHak(state.places[state.active].navn);   // hak af/på det sted man ser
        return;
      }
      // tager man selv fat, holder rundturen op — ellers kæmper de to om kameraet
      if (tour.on && (e.key.startsWith('Arrow') || e.key === 'j' || e.key === 'k' || /^[1-9]$/.test(e.key) || e.key === '0')) {
        stopTour(TAKEOVER_HINT);
      }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); step(-1); }
      else if (e.key === '+' || e.key === '=') zoomAt(1.35, focus.x, focus.y);
      else if (e.key === '-') zoomAt(1 / 1.35, focus.x, focus.y);
      else if (e.key === '0') fitView();
      else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (state.places[idx]) select(idx);
      }
    });

    // tager den besøgende selv fat, standser rundturen — rundturens egne knapper undtaget
    addEventListener('pointerdown', (e) => {
      if (!tour.on) return;
      if (e.target instanceof Element && e.target.closest('#tourBar, #tourStart, #caption')) return;
      stopTour(TAKEOVER_HINT);
    }, true);
    addEventListener('wheel', () => {
      if (tour.on) stopTour(TAKEOVER_HINT);
    }, { capture: true, passive: true });

    markersEl.addEventListener('pointerenter', () => markersEl.classList.remove('is-muted'));
    ['pointerdown', 'wheel', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, hideHint, { once: true, passive: true }));

    setTimeout(hideHint, 11000);
  }

  async function boot() {
    document.title = `${meta.navn} — interaktivt kort`;
    $('title').textContent = meta.navn;

    // Er redigeringen låst op i denne browser? Og ligger der en kladde?
    try { state.unlocked = localStorage.getItem(UNLOCK_LS) === '1'; } catch { }
    const draft = state.unlocked ? loadDraft() : null;

    // Den fælles fil er kilden. Kan den ikke læses, bruges standardstederne.
    let shared = null;
    try {
      const fresh = await fetchShared();
      state.shared = fresh.data;
      state.sharedText = fresh.text;
      shared = fresh.data;
    } catch { /* ingen fil endnu */ }

    if (draft) {
      state.draft = true;
      meta.navn = draft.navn;
      state.places = copyPlaces(draft.places);
    } else if (shared) {
      meta.navn = shared.navn;
      state.places = copyPlaces(shared.places);
    } else {
      state.places = DEFAULT_PLACES.map((p) => ({ ...p }));
    }

    // Den besøgendes egen rundtur huskes i denne browser. Steder der ikke
    // længere findes i filen, ryger ud med det samme. En delt rute i adressen
    // (#rute=…) vinder over den gemte, og bliver ens egen her i browseren.
    const kunKendte = (liste) => (Array.isArray(liste) ? liste : [])
      .filter((n) => typeof n === 'string' && state.places.some((p) => p.navn === n));
    try {
      const gemt = kunKendte(JSON.parse(localStorage.getItem(RUTE_LS) || '[]'));
      const delt = hashRute();
      const fraAdresse = delt ? kunKendte(delt) : null;
      // Et link uden brugbare navne må ikke slette ens egen rute.
      state.rute = delt && !fraAdresse.length ? gemt : (fraAdresse || gemt);
      if (delt) fraLink = { antal: fraAdresse.length };
      if (state.rute.join("\u0000") !== gemt.join("\u0000")) gemRute();
    } catch { state.rute = []; }

    document.title = `${meta.navn} — interaktivt kort`;
    $('title').textContent = meta.navn;
    renderMenu();
    renderDetail();
    renderBadge();

    // Billedet: et lokalt uploadet par vinder over de udgivne filer.
    const stored = await readImage();
    if (stored?.full) {
      state.imageDirty = true;
      renderBadge();
      try { await loadImageFrom(URL.createObjectURL(stored.full), true); }
      catch { try { await loadImageFrom(LOW_IMAGE, false); } catch { } }
    } else {
      try {
        await loadImageFrom(LOW_IMAGE, false);
      } catch {
        try { await loadImageFrom(DEFAULT_IMAGE, false); }
        catch { toast('Kunne ikke hente illustrationen. Brug "Byt illustration" for at vælge en fil.'); }
      }
    }

    buildMarkers();
    markersEl.classList.add('is-muted');
    fitView();
    paintMini();
    bindStage();
    bindUi();
    if (!stored?.full) upgradeToFullRes();

    // En delt rute åbner sig selv. Først ryddes adressen, så et genindlæsning
    // bagefter bruger den rute, der nu er ens egen — og så sætter turen i gang,
    // når indgangsanimationen har lagt sig.
    if (fraLink) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { }
      // Kun hvis linket faktisk indeholdt steder, sætter turen i gang. Ellers
      // må ens egen rute ikke begynde at spille på et link, der ikke virker.
      if (fraLink.antal) {
        setTimeout(() => {
          startTour();
          toast(`Ruten fra linket kører nu · ${stedTal(fraLink.antal)} · ${hvorLænge(ruteSekunder())}`, 7000);
        }, 1400);
      } else {
        toast('Der var ingen steder i linket, som findes på kortet længere.', 5600);
      }
    }

    frame(() => {
      app.classList.add('is-ready', 'is-anim');
      // Indgangsanimationen er kun et lag ovenpå det færdige udseende —
      // den fjernes igen, så indholdet ikke kan hænge fast i usynlig tilstand.
      setTimeout(() => app.classList.remove('is-anim'), 2600);
    });
    if (state.places.length) {
      setTimeout(() => { markersEl.classList.add('is-muted'); }, 400);
    }
  }

  boot();
})();
