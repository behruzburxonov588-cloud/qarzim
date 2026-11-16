/* LOVE WORLD — core: utils, content, progress, icons, router, HUD, UI, FX */
(function () {
  'use strict';
  const LW = (window.LW = window.LW || {});

  /* ───────────────────────── Utils ───────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  Object.assign(LW, { $, $$, wait, rand, randi, clamp, pick, shuffle, esc, h });

  /* ─────────────────────── Content ─────────────────────── */
  const OVERRIDE_KEY = 'loveworld.content.override';
  let C = window.LOVE_CONTENT || {};
  try {
    const o = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null');
    if (o && typeof o === 'object') C = Object.assign({}, C, o);
  } catch (e) { /* storage unavailable */ }
  LW.C = C;
  LW.OVERRIDE_KEY = OVERRIDE_KEY;

  /** Replace {herName} / {myName} placeholders. */
  LW.t = (s) =>
    String(s == null ? '' : s)
      .replace(/\{herName\}/g, C.herName || 'Sevgilim')
      .replace(/\{myName\}/g, C.myName || '');
  /** Escaped + templated text, newlines → <br>. */
  LW.tx = (s) => esc(LW.t(s)).replace(/\n/g, '<br>');

  /** Normalize free-text answers: case, apostrophes, accents, spaces. */
  LW.norm = (s) =>
    LW.t(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[‘’ʻʼ`'´"«»“”.,!?;:()\-–—_]/g, '')
      .replace(/\s+/g, '');

  /* ─────────────────────── Progress ─────────────────────── */
  const KEY = 'loveworld.progress.v1';
  const defaults = () => ({
    unlocked: false,
    adv: { step: 0 },
    keys: {},
    best: {},
    reasons: [],
    memoriesSeen: false,
    letterRead: false,
    secret: { opened: false, candles: false, gift: false, coupons: [], wishes: [] },
    finaleSeen: false,
    said: '',
    settings: { music: false, sfx: true, reduce: false },
    visits: 0
  });
  function deepFill(target, def) {
    for (const k in def) {
      if (!(k in target) || target[k] === null || typeof target[k] !== typeof def[k]) target[k] = def[k];
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) deepFill(target[k], def[k]);
    }
    return target;
  }
  let memoryOnly = false;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return deepFill(raw ? JSON.parse(raw) : {}, defaults());
    } catch (e) {
      memoryOnly = true;
      return defaults();
    }
  }
  const store = {
    d: load(),
    save() {
      if (memoryOnly) return;
      try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { memoryOnly = true; }
    },
    reset() {
      const settings = this.d.settings;
      this.d = defaults();
      this.d.settings = settings;
      this.save();
    }
  };
  LW.store = store;
  LW.reduced = () => store.d.settings.reduce || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  LW.GAME_IDS = ['yurak-ovchisi', 'juftliklar', 'viktorina', 'yulduzlar', 'jumboq', 'soz-sehri', 'kupidon'];
  LW.keyCount = () => LW.GAME_IDS.filter((id) => store.d.keys[id]).length;
  LW.secretOpen = () => LW.keyCount() >= LW.GAME_IDS.length;
  LW.finaleOpen = () => !!store.d.secret.candles;

  /* ─────────────────────── Icons ─────────────────────── */
  const P = {
    heart: '<path d="M12 20.3c-.3 0-.6-.1-.8-.3C7.7 17 3 13.2 3 8.9 3 6.2 5 4 7.6 4c1.8 0 3.3.9 4.4 2.4C13.1 4.9 14.6 4 16.4 4 19 4 21 6.2 21 8.9c0 4.3-4.7 8.1-8.2 11.1-.2.2-.5.3-.8.3z"/>',
    star: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8z"/>',
    moon: '<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4"/><path d="M10.4 12.6L20 3M16 7l2.5 2.5M13.6 9.4l2 2"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
    unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7M12 14.5v2.5"/>',
    ring: '<circle cx="12" cy="15" r="5.8"/><path d="M9.6 6.2L12 3l2.4 3.2L12 9z"/>',
    envelope: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="M3.8 6.5l8.2 6.6 8.2-6.6"/>',
    music: '<path d="M9 17.5V5.2L20 3v12"/><circle cx="6.3" cy="17.6" r="2.8"/><circle cx="17.3" cy="15.2" r="2.8"/>',
    musicOff: '<path d="M9 17.5V9.5M9 5.5V5.2L20 3v10"/><circle cx="6.3" cy="17.6" r="2.8"/><path d="M3 3l18 18"/>',
    infinity: '<path d="M12 12c-2.1-2.8-3.7-4.2-5.6-4.2a4.2 4.2 0 0 0 0 8.4c1.9 0 3.5-1.4 5.6-4.2zm0 0c2.1 2.8 3.7 4.2 5.6 4.2a4.2 4.2 0 0 0 0-8.4c-1.9 0-3.5 1.4-5.6 4.2z"/>',
    sparkle: '<path d="M11 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7zM19 15.5c.25 1.8 1.2 2.75 3 3-1.8.25-2.75 1.2-3 3-.25-1.8-1.2-2.75-3-3 1.8-.25 2.75-1.2 3-3z"/>',
    gift: '<rect x="3" y="8" width="18" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8S10.6 3.4 8 4.4C6.2 5.1 7.6 8 12 8zm0 0s1.4-4.6 4-3.6C17.8 5.1 16.4 8 12 8z"/>',
    candle: '<rect x="8.5" y="11" width="7" height="10" rx="1.2"/><path d="M12 3c1.6 1.9 2.2 3.1 2.2 4.2a2.2 2.2 0 0 1-4.4 0C9.8 6.1 10.4 4.9 12 3zM12 9.4V11"/>',
    book: '<path d="M4 4.6A2.6 2.6 0 0 1 6.6 2H20v16H6.6A2.6 2.6 0 0 0 4 20.6zM4 20.6A2.6 2.6 0 0 0 6.6 22H20v-4M8 6.5h8"/>',
    crown: '<path d="M3 8l4.6 3.8L12 5l4.4 6.8L21 8l-1.8 10.5H4.8zM5 21h14"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4.5 12.5l4.8 4.8L19.5 7"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/>',
    sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
    home: '<path d="M3.5 11L12 4l8.5 7M6 9.6V20h12V9.6M10 20v-5h4v5"/>',
    arrow: '<path d="M4 20L18.5 5.5M13.5 4.5h5.8v5.8M4 20l1.2-4.6M4 20l4.6-1.2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><path d="M13.5 17h7M17 13.5v7" stroke-dasharray="2 2.2"/>',
    cards: '<rect x="3" y="6" width="11" height="15" rx="2.2" transform="rotate(-8 8.5 13.5)"/><rect x="10" y="3" width="11" height="15" rx="2.2" transform="rotate(8 15.5 10.5)"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.8 2.5c-.7.3-1.2 1-1.2 1.8v.6"/><circle cx="12" cy="17.2" r=".6"/>',
    letters: '<path d="M3 19l4.5-13L12 19M4.6 14.5h5.8M14.5 11.5c.6-1.2 1.7-1.8 3-1.8 1.9 0 3 1.1 3 3V19M20.5 14.2c-4.6-.4-6.4.6-6.4 2.4 0 1.4 1.1 2.4 2.8 2.4 2.2 0 3.6-1.5 3.6-3.9"/>',
    constellation: '<path d="M5 7l6.5-3 6.5 5.5-3.5 9L6 15.5z" stroke-dasharray="2.2 2"/><circle cx="5" cy="7" r="1.6"/><circle cx="11.5" cy="4" r="1.6"/><circle cx="18" cy="9.5" r="1.6"/><circle cx="14.5" cy="18.5" r="1.6"/><circle cx="6" cy="15.5" r="1.6"/>',
    bowl: '<path d="M3 12h18a9 9 0 0 1-18 0zM12 9.2c-.2 0-.3 0-.4-.1C10 7.8 8 6.3 8 4.6 8 3.4 8.9 2.5 10 2.5c.8 0 1.5.4 2 1 .5-.6 1.2-1 2-1 1.1 0 2 .9 2 2.1 0 1.7-2 3.2-3.6 4.5-.1.1-.2.1-.4.1z"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.1.9 1.8v.4h5.4v-.4c0-.7.3-1.3.9-1.8A6 6 0 0 0 12 3z"/>',
    door: '<path d="M6 21V4.2c0-.7.5-1.2 1.2-1.2h9.6c.7 0 1.2.5 1.2 1.2V21M3 21h18"/><circle cx="14.6" cy="12.5" r=".9"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z"/>',
    skip: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
    sound: '<path d="M4 9.5h3.8L13 5.2v13.6l-5.2-4.3H4z"/><path d="M16.5 9a4.2 4.2 0 0 1 0 6M19 6.5a7.8 7.8 0 0 1 0 11"/>',
    soundOff: '<path d="M4 9.5h3.8L13 5.2v13.6l-5.2-4.3H4zM17 9.5l4.5 5M21.5 9.5l-4.5 5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    flame: '<path d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.1 0-3.9 3.5-5.9 4.4-10.9 3.3 2.2 4.1 5 3.9 7.1 1-.6 1.7-1.7 1.9-3 1.8 1.7 2.8 4 2.8 6.8 0 3.5-2.6 6.1-6.5 6.1z"/>',
    sun: '<circle cx="12" cy="12" r="4.3"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.3" r="3.6"/>',
    flower: '<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8c-1.2-2.6.3-4.3 0-4.3s1.2 1.7 0 4.3zM12 11.2v10M12 17c-2.6-.2-4.4-1.6-5-3.8 2.7-.2 4.5 1.2 5 3.8zM12 15.2c2.6-.2 4.4-1.6 5-3.8-2.7-.2-4.5 1.2-5 3.8z"/><path d="M9.8 9c-2.6 1.2-4.3-.3-4.3 0s1.7-1.2 4.3 0zM14.2 9c2.6-1.2 4.3.3 4.3 0s-1.7 1.2-4.3 0zM10.4 7.4C8.5 5.3 9 3.2 8.7 3.4s1.9.3 1.7 4zM13.6 7.4c1.9-2.1 1.4-4.2 1.7-4s-1.9.3-1.7 4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    trophy: '<path d="M8 3.5h8V9a4 4 0 0 1-8 0zM8 5.5H4.5a3.5 3.5 0 0 0 3.8 4.4M16 5.5h3.5a3.5 3.5 0 0 1-3.8 4.4M12 13v3.5M8.5 20.5h7M9.5 20.5l.7-4h3.6l.7 4"/>',
    feather: '<path d="M20 4c-6 0-11.5 3.8-12.8 11.2L5 20M20 4c.6 6.5-3.6 11.7-10.8 11.9M7.6 12.6l5.5-.4M9.8 9.3l5.7-.6"/>',
    broken: '<path d="M12 20.3c-.3 0-.6-.1-.8-.3C7.7 17 3 13.2 3 8.9 3 6.2 5 4 7.6 4c1.8 0 3.3.9 4.4 2.4C13.1 4.9 14.6 4 16.4 4 19 4 21 6.2 21 8.9c0 4.3-4.7 8.1-8.2 11.1-.2.2-.5.3-.8.3z"/><path d="M12 6.4l-1.6 4 3 2-2 3.4 .8 4.4"/>'
  };
  LW.icon = (name, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.heart}</svg>`;
  LW.iconNames = Object.keys(P);

  /* ───────────────────── Canvas helpers ───────────────────── */
  /** MDN-classic heart path centered on (x, y), width s. */
  LW.heartPath = (ctx, x, y, s) => {
    const k = s;
    ctx.beginPath();
    ctx.moveTo(x, y - 0.2955 * k);
    ctx.bezierCurveTo(x, y - 0.3227 * k, x - 0.0455 * k, y - 0.4318 * k, x - 0.2273 * k, y - 0.4318 * k);
    ctx.bezierCurveTo(x - 0.5 * k, y - 0.4318 * k, x - 0.5 * k, y - 0.0909 * k, x - 0.5 * k, y - 0.0909 * k);
    ctx.bezierCurveTo(x - 0.5 * k, y + 0.0682 * k, x - 0.3182 * k, y + 0.2682 * k, x, y + 0.4318 * k);
    ctx.bezierCurveTo(x + 0.3182 * k, y + 0.2682 * k, x + 0.5 * k, y + 0.0682 * k, x + 0.5 * k, y - 0.0909 * k);
    ctx.bezierCurveTo(x + 0.5 * k, y - 0.0909 * k, x + 0.5 * k, y - 0.4318 * k, x + 0.2273 * k, y - 0.4318 * k);
    ctx.bezierCurveTo(x + 0.0909 * k, y - 0.4318 * k, x, y - 0.3227 * k, x, y - 0.2955 * k);
    ctx.closePath();
  };
  LW.starPath = (ctx, x, y, r, inner = 0.45, n = 5, rot = -Math.PI / 2) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 ? r * inner : r;
      const a = rot + (i * Math.PI) / n;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  /** Draw a glossy gradient heart. */
  LW.drawHeart = (ctx, x, y, s, c1 = '#ff7ab6', c2 = '#e8336f', glow = 0) => {
    ctx.save();
    if (glow) { ctx.shadowColor = c1; ctx.shadowBlur = glow; }
    const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    LW.heartPath(ctx, x, y, s);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.22, y - s * 0.2, s * 0.09, s * 0.06, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  /** Size a canvas to its CSS box with devicePixelRatio. */
  LW.fitCanvas = (canvas, maxDpr = 2) => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(r.width));
    const hh = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: hh, dpr };
  };

  /* ───────────────────── Background sky ───────────────────── */
  const sky = {
    stars: [], hearts: [], shooters: [], t: 0, w: 0, h: 0, mode: 'calm', warp: 0, px: 0, py: 0, tx: 0, ty: 0, running: false,
    init() {
      this.c = $('#sky');
      if (!this.c) return;
      this.dot = this.sprite(64, (g, s) => {
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.18, 'rgba(255,240,250,.85)');
        gr.addColorStop(0.45, 'rgba(255,190,230,.18)');
        gr.addColorStop(1, 'rgba(255,190,230,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, s, s);
      });
      this.heartSprites = ['#ff7ab6', '#c79bff', '#ffc27a', '#ff9fc8'].map((col) =>
        this.sprite(64, (g, s) => {
          g.shadowColor = col;
          g.shadowBlur = 14;
          g.globalAlpha = 0.9;
          LW.drawHeart(g, s / 2, s / 2, s * 0.55, col, col);
        })
      );
      this.resize();
      addEventListener('resize', () => this.resize());
      addEventListener('pointermove', (e) => {
        this.tx = (e.clientX / innerWidth - 0.5) * 2;
        this.ty = (e.clientY / innerHeight - 0.5) * 2;
      }, { passive: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.start(); });
      this.start();
    },
    sprite(s, fn) {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      fn(c.getContext('2d'), s);
      return c;
    },
    resize() {
      const { ctx, w, h } = LW.fitCanvas(this.c, 1.5);
      this.ctx = ctx; this.w = w; this.h = h;
      const n = Math.round(clamp((w * h) / 4200, 90, 320) * (LW.reduced() ? 0.5 : 1));
      this.stars = Array.from({ length: n }, () => this.newStar(true));
      const hn = LW.reduced() ? 5 : Math.round(clamp(w / 90, 7, 16));
      this.hearts = Array.from({ length: hn }, () => this.newHeart(true));
    },
    newStar(any) {
      return {
        x: rand(-0.5, 0.5) * this.w * 1.2, y: rand(-0.5, 0.5) * this.h * 1.2, z: rand(0.15, 1),
        r: Math.random() < 0.08 ? rand(1.4, 2.4) : rand(0.4, 1.3), ph: rand(0, 6.28), sp: rand(0.6, 2.4),
        warm: Math.random() < 0.25, any
      };
    },
    newHeart(any) {
      return { x: rand(0, this.w), y: any ? rand(0, this.h) : this.h + 40, s: rand(10, 26), vy: rand(8, 22), sw: rand(0.4, 1.4), ph: rand(0, 6.28), a: rand(0.12, 0.38), spr: randi(0, 3) };
    },
    start() {
      if (this.running || !this.c) return;
      this.running = true;
      let last = performance.now();
      const loop = (now) => {
        if (document.hidden) { this.running = false; return; }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.frame(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    setMode(m) {
      this.mode = m;
      if (this.c) this.c.style.opacity = m === 'hidden' ? '0' : '1';
    },
    frame(dt) {
      if (this.mode === 'hidden') return;
      const { ctx, w, h } = this;
      this.t += dt;
      this.px += (this.tx - this.px) * 0.04;
      this.py += (this.ty - this.py) * 0.04;
      const targetWarp = this.mode === 'warp' ? 1 : 0;
      this.warp += (targetWarp - this.warp) * Math.min(1, dt * 2.2);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      // stars
      for (const s of this.stars) {
        if (this.warp > 0.01) {
          const sp = (1 + s.z * 6) * this.warp * 240 * dt;
          const len = Math.hypot(s.x, s.y) || 1;
          const ox = s.x, oy = s.y;
          s.x += (s.x / len) * sp; s.y += (s.y / len) * sp;
          if (Math.abs(s.x) > w * 0.7 || Math.abs(s.y) > h * 0.7) {
            Object.assign(s, this.newStar(), { x: rand(-0.12, 0.12) * w, y: rand(-0.12, 0.12) * h });
            continue;
          }
          ctx.strokeStyle = `rgba(255,236,250,${0.35 + s.z * 0.6})`;
          ctx.lineWidth = s.r * (0.6 + s.z);
          ctx.beginPath();
          ctx.moveTo(cx + ox - (s.x - ox) * 5 * this.warp, cy + oy - (s.y - oy) * 5 * this.warp);
          ctx.lineTo(cx + s.x, cy + s.y);
          ctx.stroke();
          continue;
        }
        const tw = 0.55 + 0.45 * Math.sin(this.t * s.sp + s.ph);
        const x = cx + s.x - this.px * 14 * s.z;
        const y = cy + s.y - this.py * 10 * s.z;
        const size = s.r * 7 * (0.7 + tw * 0.5);
        ctx.globalAlpha = (0.25 + 0.75 * tw) * (0.4 + s.z * 0.6);
        ctx.drawImage(this.dot, x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      // floating hearts
      if (this.warp < 0.5) {
        for (const p of this.hearts) {
          p.y -= p.vy * dt;
          const x = p.x + Math.sin(this.t * p.sw + p.ph) * 18 - this.px * 20;
          if (p.y < -40) Object.assign(p, this.newHeart(false));
          ctx.globalAlpha = p.a * (1 - this.warp * 2) * clamp(p.y / 120, 0, 1);
          ctx.drawImage(this.heartSprites[p.spr], x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        }
        ctx.globalAlpha = 1;
        // shooting stars
        if (!LW.reduced() && Math.random() < dt * 0.22) {
          const fromLeft = Math.random() < 0.5;
          this.shooters.push({ x: rand(0.1, 0.9) * w, y: rand(0, 0.45) * h, vx: (fromLeft ? 1 : -1) * rand(420, 700), vy: rand(160, 300), life: 0, max: rand(0.7, 1.2) });
        }
        this.shooters = this.shooters.filter((s) => (s.life += dt) < s.max);
        for (const s of this.shooters) {
          s.x += s.vx * dt; s.y += s.vy * dt;
          const a = Math.sin((s.life / s.max) * Math.PI);
          const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.16, s.y - s.vy * 0.16);
          g.addColorStop(0, `rgba(255,248,235,${a})`);
          g.addColorStop(1, 'rgba(255,200,240,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 0.16, s.y - s.vy * 0.16);
          ctx.stroke();
        }
      }
    }
  };
  LW.sky = sky;

  /* ───────────────────── FX particles overlay ───────────────────── */
  const fx = {
    parts: [], running: false,
    init() {
      this.c = $('#fx');
      this.resize();
      addEventListener('resize', () => this.resize());
      // sparkle trail for fine pointers
      if (window.matchMedia('(pointer: fine)').matches) {
        let lastT = 0;
        addEventListener('pointermove', (e) => {
          const now = performance.now();
          if (now - lastT < 45 || LW.reduced() || document.body.classList.contains('no-trail')) return;
          lastT = now;
          this.add({ x: e.clientX + rand(-4, 4), y: e.clientY + rand(-4, 4), vx: rand(-20, 20), vy: rand(-10, 30), size: rand(3, 6), life: rand(0.5, 0.9), shape: Math.random() < 0.3 ? 'heart' : 'spark', color: pick(['#ffd9ec', '#ffe3a6', '#e5d4ff']), g: 20, drag: 0.96 });
        }, { passive: true });
      }
    },
    resize() {
      const { ctx, w, h } = LW.fitCanvas(this.c, 2);
      this.ctx = ctx; this.w = w; this.h = h;
    },
    add(p) {
      p.t = 0;
      p.rot = p.rot || rand(0, 6.28);
      p.vr = p.vr || rand(-4, 4);
      this.parts.push(p);
      if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
      if (!this.running) this.loop();
    },
    loop() {
      this.running = true;
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const { ctx } = this;
        ctx.clearRect(0, 0, this.w, this.h);
        this.parts = this.parts.filter((p) => (p.t += dt) < p.life);
        for (const p of this.parts) {
          p.vx *= p.drag || 0.99; p.vy *= p.drag || 0.99;
          p.vy += (p.g || 0) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const k = p.t / p.life;
          ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.shape === 'heart') LW.drawHeart(ctx, 0, 0, p.size * 2, p.color, p.color2 || p.color);
          else if (p.shape === 'star') { LW.starPath(ctx, 0, 0, p.size); ctx.fill(); }
          else if (p.shape === 'rect') { ctx.scale(1, Math.cos(p.t * 9 + p.rot)); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); }
          else {
            // spark (4-point twinkle)
            ctx.beginPath();
            const s = p.size;
            ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
            ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        if (this.parts.length) requestAnimationFrame(step);
        else { this.running = false; ctx.clearRect(0, 0, this.w, this.h); }
      };
      requestAnimationFrame(step);
    },
    burst(x, y, o = {}) {
      const n = Math.round((o.count || 26) * (LW.reduced() ? 0.4 : 1));
      const colors = o.colors || ['#ff7ab6', '#ffd27a', '#c79bff', '#ffffff', '#ff9fc8'];
      const shapes = o.shapes || ['heart', 'spark', 'star'];
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(o.min || 80, o.speed || 340);
        this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 60), size: rand(o.sMin || 3, o.sMax || 8), life: rand(0.7, o.life || 1.5), shape: pick(shapes), color: pick(colors), g: o.g == null ? 260 : o.g, drag: 0.965 });
      }
    },
    confetti() {
      const colors = ['#ff7ab6', '#ffd27a', '#c79bff', '#7ee0ff', '#ffffff', '#ff5d8f'];
      const n = LW.reduced() ? 50 : 160;
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0;
        this.add({ x: left ? -10 : this.w + 10, y: this.h * rand(0.45, 0.85), vx: (left ? 1 : -1) * rand(200, 620), vy: -rand(380, 820), size: rand(3, 6.5), life: rand(2, 3.4), shape: pick(['rect', 'rect', 'heart', 'star']), color: pick(colors), g: 520, drag: 0.985 });
      }
    },
    rain(n = 40) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => this.add({ x: rand(0, this.w), y: -20, vx: rand(-30, 30), vy: rand(80, 200), size: rand(5, 11), life: rand(3, 5), shape: 'heart', color: pick(['#ff7ab6', '#ff5d8f', '#ffb3d1', '#c79bff']), color2: '#e8336f', g: 30, drag: 1 }), i * 60);
      }
    }
  };
  LW.fx = fx;

  /* ───────────────────────── UI ───────────────────────── */
  LW.toast = (msg, icon = 'sparkle', ms = 2800) => {
    const stack = $('#toasts');
    const el = h(`<div class="toast" role="status">${LW.icon(icon)}<span>${msg}</span></div>`);
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 450); }, ms);
  };

  let openModals = 0;
  LW.modal = ({ title = '', html = '', icon = '', buttons = [], dismissible = true, cls = '', onClose } = {}) => {
    const root = $('#modals');
    const el = h(`<div class="modal-wrap ${cls}" role="dialog" aria-modal="true">
      <div class="modal-backdrop"></div>
      <div class="modal glass">
        ${dismissible ? `<button class="btn-icon modal-x" aria-label="Yopish">${LW.icon('close')}</button>` : ''}
        ${icon ? `<div class="modal-icon">${LW.icon(icon)}</div>` : ''}
        ${title ? `<h2 class="modal-title">${title}</h2>` : ''}
        <div class="modal-body">${html}</div>
        <div class="modal-actions"></div>
      </div></div>`);
    const actions = $('.modal-actions', el);
    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      openModals--;
      el.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), 380);
      onClose && onClose(val);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(); };
    buttons.forEach((b) => {
      const btn = h(`<button class="btn ${b.cls || 'btn-ghost'}">${b.icon ? LW.icon(b.icon) : ''}<span>${b.label}</span></button>`);
      btn.addEventListener('click', () => {
        LW.audio && LW.audio.sfx('tap');
        const r = b.onClick && b.onClick(btn);
        if (b.close !== false && r !== false) close(b.value);
      });
      actions.appendChild(btn);
    });
    if (!buttons.length) actions.remove();
    if (dismissible) {
      $('.modal-backdrop', el).addEventListener('click', () => close());
      $('.modal-x', el).addEventListener('click', () => close());
    }
    document.addEventListener('keydown', onKey);
    root.appendChild(el);
    openModals++;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    const first = $('.modal-actions .btn', el);
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
    return { el, close };
  };
  LW.confirm = (title, text, yes = 'Ha', no = 'Bekor qilish') =>
    new Promise((res) => {
      LW.modal({ title, html: `<p>${text}</p>`, icon: 'question', onClose: (v) => res(v === true), buttons: [{ label: no, value: false }, { label: yes, cls: 'btn-primary', value: true }] });
    });
  LW.modalOpen = () => openModals > 0;

  /** Animated key reward (key already stored); resolves after it lands in the HUD. */
  LW.flyKey = async () => {
    const n = LW.keyCount();
    LW.audio && LW.audio.sfx('key');
    const el = h(`<div class="key-fly">${LW.icon('key')}</div>`);
    document.body.appendChild(el);
    const r0 = { x: innerWidth / 2, y: innerHeight / 2 };
    const target = $('#hudKeys');
    const r1 = target ? target.getBoundingClientRect() : { left: innerWidth - 60, top: 20, width: 40, height: 30 };
    el.style.left = r0.x + 'px';
    el.style.top = r0.y + 'px';
    fx.burst(r0.x, r0.y, { count: 40, colors: ['#ffd27a', '#fff2c4', '#ffb347', '#ffffff'], shapes: ['star', 'spark'] });
    await wait(LW.reduced() ? 200 : 1100);
    el.classList.add('fly');
    el.style.left = r1.left + r1.width / 2 + 'px';
    el.style.top = r1.top + r1.height / 2 + 'px';
    await wait(LW.reduced() ? 200 : 800);
    el.remove();
    hud.update(true);
    if (target) fx.burst(r1.left + r1.width / 2, r1.top + r1.height / 2, { count: 14, colors: ['#ffd27a', '#ffffff'], shapes: ['spark'], speed: 160, g: 0 });
    LW.toast(`Sehrli kalit topildi! <b>${n}/${LW.GAME_IDS.length}</b>`, 'key');
    if (n === LW.GAME_IDS.length) setTimeout(() => LW.toast('Barcha kalitlar to‘plandi — <b>Sirli xona</b> ochildi!', 'door', 4200), 900);
  };

  /* ───────────────────────── HUD ───────────────────────── */
  const hud = {
    init() {
      this.el = $('#hud');
      this.el.innerHTML = `
        <button class="btn-icon hud-back" id="hudBack" aria-label="Olamga qaytish">${LW.icon('home')}</button>
        <a class="hud-brand" href="#/olam" aria-label="Bosh xarita">${LW.icon('heart', 'beat')}<span>${esc(C.siteTitle || 'LOVE WORLD')}</span></a>
        <div class="hud-right">
          <button class="hud-keys" id="hudKeys" aria-label="Kalitlar">${LW.icon('key')}<b>0</b><small>/${LW.GAME_IDS.length}</small></button>
          <button class="btn-icon" id="hudMusic" aria-label="Musiqa"></button>
          <button class="btn-icon" id="hudSettings" aria-label="Sozlamalar">${LW.icon('sliders')}</button>
        </div>`;
      $('#hudBack').addEventListener('click', () => { LW.audio.sfx('tap'); LW.go('olam'); });
      $('#hudKeys').addEventListener('click', () => { LW.audio.sfx('tap'); LW.go('olam'); setTimeout(() => { const s = $('#secretCard'); s && s.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 650); });
      $('#hudMusic').addEventListener('click', () => { LW.audio.toggleMusic(); this.update(); });
      $('#hudSettings').addEventListener('click', () => { LW.audio.sfx('tap'); LW.openSettings(); });
      this.update();
    },
    update(pulse) {
      if (!this.el) return;
      $('#hudKeys b').textContent = LW.keyCount();
      $('#hudKeys').classList.toggle('full', LW.secretOpen());
      if (pulse) { const k = $('#hudKeys'); k.classList.remove('pulse'); void k.offsetWidth; k.classList.add('pulse'); }
      const on = store.d.settings.music;
      const m = $('#hudMusic');
      m.innerHTML = LW.icon(on ? 'music' : 'musicOff');
      m.classList.toggle('on', on);
      m.setAttribute('aria-pressed', on);
    },
    show(on, isHub) {
      document.body.classList.toggle('hud-on', on);
      this.el.classList.toggle('is-hub', !!isHub);
    }
  };
  LW.hud = hud;

  LW.openSettings = () => {
    const s = store.d.settings;
    const row = (id, label, sub, on) => `<label class="switch-row"><span><b>${label}</b><small>${sub}</small></span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i class="switch"></i></label>`;
    const m = LW.modal({
      title: 'Sozlamalar',
      icon: 'sliders',
      html: `<div class="settings">
        ${row('setMusic', 'Musiqa', C.music && C.music.src ? 'Bizning qo‘shig‘imiz' : 'Sehrli musiqa qutisi kuyi', s.music)}
        ${row('setSfx', 'Ovoz effektlari', 'Tugma, o‘yin va sehr tovushlari', s.sfx)}
        ${row('setReduce', 'Yengil animatsiya', 'Harakatlarni kamaytiradi', s.reduce)}
        <div class="settings-sep"></div>
        <div class="settings-stats">
          <span>${LW.icon('key')} Kalitlar: <b>${LW.keyCount()}/${LW.GAME_IDS.length}</b></span>
          <span>${LW.icon('heart')} Sabablar: <b>${store.d.reasons.length}/${(C.reasons || []).length}</b></span>
        </div>
        <button class="btn btn-ghost btn-sm danger" id="setReset">${LW.icon('refresh')}<span>Sarguzashtni boshidan boshlash</span></button>
      </div>`,
      buttons: [{ label: 'Tayyor', cls: 'btn-primary' }]
    });
    $('#setMusic', m.el).addEventListener('change', (e) => { LW.audio.setMusic(e.target.checked); hud.update(); });
    $('#setSfx', m.el).addEventListener('change', (e) => { s.sfx = e.target.checked; store.save(); LW.audio.sfx('tap'); });
    $('#setReduce', m.el).addEventListener('change', (e) => { s.reduce = e.target.checked; store.save(); document.body.classList.toggle('reduce', s.reduce); sky.resize(); });
    $('#setReset', m.el).addEventListener('click', async () => {
      m.close();
      const ok = await LW.confirm('Boshidan boshlaysanmi?', 'Barcha kalitlar, ochilgan sabablar va sirli xona yopiladi. Sarguzasht yana kirish eshigidan boshlanadi.', 'Ha, boshidan', 'Yo‘q');
      if (ok) { store.reset(); hud.update(); LW.go(''); LW.toast('Sarguzasht yangidan boshlandi', 'refresh'); }
    });
  };

  /* ───────────────────────── Router ───────────────────────── */
  const routes = {};
  let current = null;
  let navToken = 0;
  LW.route = (name, mod) => { routes[name] = mod; };
  LW.go = (path) => {
    const target = '#/' + path;
    if (location.hash === target) resolve();
    else location.hash = target;
  };
  LW.currentRoute = () => current && current.name;

  function parse() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
    const [name, param] = raw.split('/');
    return { name: name || '', param };
  }

  async function resolve() {
    let { name, param } = parse();
    if (!routes[name]) name = '';
    const d = store.d;
    // guards
    if (!d.unlocked && name !== '' && name !== 'sarguzasht') { name = ''; history.replaceState(null, '', '#/'); }
    if (name === 'oyin' && !LW.GAME_IDS.includes(param)) { name = 'olam'; history.replaceState(null, '', '#/olam'); }
    if (name === 'sirli-xona' && !LW.secretOpen()) {
      name = 'olam'; history.replaceState(null, '', '#/olam');
      setTimeout(() => LW.toast(`Sirli xona uchun yettita kalit kerak (${LW.keyCount()}/7)`, 'lock'), 500);
    }
    if (name === 'final' && !LW.finaleOpen()) {
      name = 'olam'; history.replaceState(null, '', '#/olam');
      setTimeout(() => LW.toast('Final sirli xonadagi shamlar yonganda ochiladi', 'lock'), 500);
    }
    const token = ++navToken;
    const mod = routes[name];
    const app = $('#app');
    // modals belong to the screen they were opened on
    $$('#modals .modal-wrap').forEach((m) => { m.classList.remove('in'); setTimeout(() => m.remove(), 380); });
    openModals = 0;
    if (current) {
      const prev = current;
      current = null;
      try { prev.mod.leave && prev.mod.leave(); } catch (e) { console.error(e); }
      prev.el.classList.remove('active');
      prev.el.classList.add('leaving');
      setTimeout(() => prev.el.remove(), 520);
      if (!LW.reduced()) await wait(260);
      if (token !== navToken) return;
    }
    hud.show(!!mod.hud, name === 'olam');
    sky.setMode(mod.sky || 'calm');
    document.body.dataset.route = name || 'kirish';
    document.title = (mod.title ? mod.title + ' · ' : '') + (C.siteTitle || 'LOVE WORLD');
    const el = document.createElement('section');
    el.className = `screen screen-${name || 'kirish'}`;
    app.appendChild(el);
    current = { name, mod, el };
    try { mod.enter(el, param); } catch (e) { console.error(e); }
    el.scrollTop = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
    hud.update();
  }
  LW.refresh = resolve;

  /* ───────────────────────── Boot ───────────────────────── */
  LW.boot = () => {
    document.body.classList.toggle('reduce', store.d.settings.reduce);
    store.d.visits++;
    store.save();
    sky.init();
    fx.init();
    hud.init();
    addEventListener('hashchange', resolve);
    resolve();
    // resume music on first gesture if it was on
    const resume = () => { if (store.d.settings.music) LW.audio.setMusic(true); removeEventListener('pointerdown', resume); };
    addEventListener('pointerdown', resume);
  };

  /* Together counter helper */
  LW.together = () => {
    const start = new Date(C.startDate || Date.now());
    if (isNaN(start)) return null;
    let ms = Date.now() - start.getTime();
    if (ms < 0) ms = 0;
    const days = Math.floor(ms / 864e5);
    const hours = Math.floor((ms % 864e5) / 36e5);
    const mins = Math.floor((ms % 36e5) / 6e4);
    const secs = Math.floor((ms % 6e4) / 1e3);
    return { days, hours, mins, secs };
  };
})();
