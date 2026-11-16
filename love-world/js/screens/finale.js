/* LOVE WORLD — Grand cinematic finale: story lines → star warp → particle heart → names → the question → fireworks */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, esc, wait, rand, clamp, shuffle } = LW;

  const COLORS = ['#ff7ab6', '#ffd27a', '#c79bff', '#ffffff', '#ff9fc8'];

  function glowSprite(color, size = 32) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(0.22, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const scr = {
    title: 'Buyuk final',
    hud: false,
    sky: 'hidden',
    enter(el) {
      const C = LW.C, F = C.finale || {};
      this.el = el; this.alive = true; this.tk = 0; this.said = false; this.targetKind = null; this.parts = null;
      el.innerHTML = `
        <div class="finale" id="finale">
          <canvas class="fn-canvas" aria-hidden="true"></canvas>
          <div class="fn-vignette" aria-hidden="true"></div>
          <div class="fn-bars" aria-hidden="true"><i class="top"></i><i class="bot"></i></div>
          <div class="fn-text" id="fnText" aria-live="polite"></div>
          <div class="fn-question" id="fnQ" hidden>
            <div class="fn-qcard glass">
              <span class="fn-qheart">${LW.icon('heart', 'beat')}</span>
              <h2 class="fn-qtext">${LW.tx(F.question || '')}</h2>
              <div class="fn-qbtns">
                <button class="btn btn-primary btn-lg fn-yes" id="fnYes">${LW.icon('heart')}<span>${LW.tx(F.yes || 'Ha')}</span></button>
                <button class="btn btn-ghost fn-no" id="fnNo"><span>${LW.tx(F.no || 'Yo‘q')}</span></button>
              </div>
            </div>
          </div>
          <div class="fn-end" id="fnEnd" hidden>
            <p class="eyebrow">${esc(C.siteTitle || 'LOVE WORLD')}</p>
            <h2 class="fn-final">${LW.tx(F.finalMessage || '')}</h2>
            <p class="fn-sign hand">${LW.tx(F.finalSignature || '')}</p>
            <div class="fn-endbtns">
              <button class="btn btn-ghost" id="fnReplay">${LW.icon('refresh')}<span>Yana bir bor ko‘rish</span></button>
              <button class="btn btn-gold" id="fnHome">${LW.icon('home')}<span>Olamga qaytish</span></button>
            </div>
          </div>
          <div class="fn-start" id="fnStart">
            <p class="eyebrow">Buyuk final</p>
            <h1 class="title-lg">Tayyormisan, <span class="gold-text">${esc(C.herName || '')}</span>?</h1>
            <p class="lead center">Chiroqni xiralashtir, ovozni yoq va bir necha daqiqaga faqat shu lahzaga berilgin…</p>
            <div class="fn-startbtns">
              <button class="btn btn-primary btn-lg" id="fnGoMusic">${LW.icon('music')}<span>Musiqa bilan boshlash</span></button>
              <button class="btn btn-ghost" id="fnGo">${LW.icon('play')}<span>Musiqasiz</span></button>
            </div>
          </div>
          <div class="fn-controls">
            <button class="btn btn-ghost btn-sm" id="fnSkip" hidden>${LW.icon('skip')}<span>O‘tkazib yuborish</span></button>
            <button class="btn-icon" id="fnExit" aria-label="Olamga qaytish">${LW.icon('close')}</button>
          </div>
        </div>`;
      this.fin = $('#finale', el);
      this.cv = $('.fn-canvas', el);
      this.sprites = COLORS.map((c) => glowSprite(c));
      this.setupCanvas();
      this.loop();
      $('#fnGoMusic', el).addEventListener('click', () => { LW.audio.unlock(); if (!LW.store.d.settings.music) LW.audio.setMusic(true); this.start(); });
      $('#fnGo', el).addEventListener('click', () => { LW.audio.unlock(); if (LW.store.d.settings.music) LW.audio.setMusic(false); this.start(); });
      $('#fnSkip', el).addEventListener('click', () => { LW.audio.sfx('tap'); this.skip(); });
      $('#fnExit', el).addEventListener('click', () => { LW.audio.sfx('tap'); LW.go('olam'); });
      $('#fnYes', el).addEventListener('click', () => this.yes());
      $('#fnReplay', el).addEventListener('click', () => { LW.audio.sfx('tap'); this.replay(); });
      $('#fnHome', el).addEventListener('click', () => { LW.audio.sfx('tap'); LW.go('olam'); });
      this.setupNo();
      this.onKey = (e) => { if (e.key === 'Escape') LW.go('olam'); };
      addEventListener('keydown', this.onKey);
      this.onResize = () => { this.setupCanvas(true); };
      addEventListener('resize', this.onResize);
      document.body.classList.add('no-trail');
    },
    leave() {
      this.alive = false;
      this.tk++;
      clearInterval(this.beatTimer);
      cancelAnimationFrame(this.raf);
      removeEventListener('keydown', this.onKey);
      removeEventListener('resize', this.onResize);
      document.body.classList.remove('no-trail');
    },

    /* ── Particle engine ── */
    setupCanvas(keep) {
      const { ctx, w, h } = LW.fitCanvas(this.cv, 1.5);
      this.ctx = ctx; this.w = w; this.h = h;
      const n = Math.round(clamp((w * h) / 1000, 460, 1200) * (LW.reduced() ? 0.45 : 1));
      if (!keep || !this.parts) {
        this.parts = Array.from({ length: n }, () => ({
          x: rand(0, w), y: rand(0, h), vx: rand(-8, 8), vy: rand(-8, 8), tx: 0, ty: 0, z: rand(0.2, 1),
          s: rand(3, 9), c: Math.floor(Math.random() * COLORS.length), ph: rand(0, 6.28), a: rand(0.4, 1)
        }));
        this.mode = 'drift';
        this.sparks = []; this.rockets = [];
        this.fireworks = false;
        this.beat = 0;
      } else if (this.targetKind) this.setTargets(this.targetKind);
    },
    heartPoints(n) {
      const { w, h } = this;
      const S = Math.min(w, h * 1.1) * 0.0205;
      const cx = w / 2, cy = h * 0.47;
      return Array.from({ length: n }, (_, i) => {
        const t = rand(0, Math.PI * 2);
        const r = i % 3 === 0 ? Math.sqrt(Math.random()) * 0.94 : 1 + rand(-0.025, 0.025);
        const xp = 16 * Math.pow(Math.sin(t), 3), yp = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [cx + xp * S * r, cy - (yp + 2.5) * S * r];
      });
    },
    textPoints(n) {
      const { w, h } = this;
      const C = LW.C;
      const c = document.createElement('canvas');
      c.width = Math.round(w); c.height = Math.round(h);
      const g = c.getContext('2d');
      const her = C.herName || '', me = C.myName || '';
      const narrow = w < 640;
      const lines = narrow ? [her, '&', me] : [`${her} & ${me}`];
      let fs = narrow ? Math.min(h * 0.13, w * 0.26) : Math.min(h * 0.24, w * 0.16);
      const font = (f) => `italic 600 ${f}px "Cormorant Garamond", Georgia, serif`;
      g.font = font(fs);
      const widest = () => Math.max(...lines.map((l) => g.measureText(l).width));
      while (widest() > w * 0.86 && fs > 18) { fs *= 0.94; g.font = font(fs); }
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lh = fs * 0.98, top = h * 0.46 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => g.fillText(l, w / 2, top + i * lh));
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const step = Math.max(2, Math.round(Math.sqrt((w * h * 0.045) / n)));
      const pts = [];
      for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) if (data[(y * c.width + x) * 4 + 3] > 140) pts.push([x, y]);
      return pts.length ? shuffle(pts) : this.heartPoints(n);
    },
    setTargets(kind) {
      this.targetKind = kind;
      const n = this.parts.length;
      const pts = kind === 'text' ? this.textPoints(n) : this.heartPoints(n);
      this.parts.forEach((p, i) => {
        const q = pts[i % pts.length];
        p.tx = q[0] + (i >= pts.length ? rand(-2, 2) : 0);
        p.ty = q[1] + (i >= pts.length ? rand(-2, 2) : 0);
      });
    },
    burstFirework(x, y, heart) {
      const col = Math.floor(Math.random() * COLORS.length);
      const col2 = Math.floor(Math.random() * COLORS.length);
      const n = heart ? 90 : 70;
      const sp = rand(140, 230) * clamp(Math.min(this.w, this.h) / 700, 0.6, 1.3);
      for (let i = 0; i < n; i++) {
        let vx, vy;
        if (heart) {
          const t = (i / n) * Math.PI * 2;
          vx = 16 * Math.pow(Math.sin(t), 3) / 16 * sp;
          vy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 * sp;
        } else {
          const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * sp;
          vx = Math.cos(a) * r; vy = Math.sin(a) * r;
        }
        this.sparks.push({ x, y, vx, vy, life: 0, max: rand(1.2, 2.1), c: i % 4 === 0 ? col2 : col, s: rand(4, 8) });
      }
      LW.audio.sfx('firework');
    },
    loop() {
      let last = performance.now();
      const frame = (now) => {
        if (!this.alive) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const { ctx, w, h } = this;
        const t = now / 1000;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.mode === 'warp' ? 'rgba(6,2,18,0.24)' : 'rgba(6,2,18,0.32)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        const cx = w / 2, cy = h / 2;
        this.beat = Math.max(0, this.beat - dt * 2.4);
        const beatK = 1 + Math.sin(Math.min(1, this.beat) * Math.PI) * 0.06;
        const dim = this.dim == null ? 1 : this.dim;
        for (const p of this.parts) {
          if (this.mode === 'warp') {
            const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy) || 1;
            const sp = (40 + d * 2.6) * p.z * dt;
            const ox = p.x, oy = p.y;
            p.x += (dx / d) * sp; p.y += (dy / d) * sp;
            if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) { p.x = cx + rand(-60, 60); p.y = cy + rand(-40, 40); continue; }
            ctx.strokeStyle = COLORS[p.c];
            ctx.globalAlpha = Math.min(1, d / 300) * 0.8;
            ctx.lineWidth = p.z * 1.6;
            ctx.beginPath(); ctx.moveTo(ox - (p.x - ox) * 3, oy - (p.y - oy) * 3); ctx.lineTo(p.x, p.y); ctx.stroke();
            continue;
          }
          if (this.mode === 'form') {
            const tx = cx + (p.tx - cx) * beatK, ty = cy + (p.ty - cy) * beatK;
            const k = 1 - Math.exp(-dt * (2.6 + p.z * 1.8)); // frame-rate independent easing
            p.x += (tx - p.x) * k + Math.sin(t * 2 + p.ph) * 0.25;
            p.y += (ty - p.y) * k + Math.cos(t * 2 + p.ph) * 0.25;
          } else if (this.mode === 'scatter') {
            if (!p.sc) { const a = Math.atan2(p.y - cy, p.x - cx); const v = rand(200, 700); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.sc = 1; }
            const f = Math.pow(0.94, dt * 60);
            p.vx *= f; p.vy *= f;
            p.x += p.vx * dt; p.y += p.vy * dt;
          } else {
            p.sc = 0;
            p.x += (p.vx + Math.sin(t * 0.5 + p.ph) * 6) * dt * p.z;
            p.y += (p.vy + Math.cos(t * 0.4 + p.ph) * 6) * dt * p.z;
            if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
          }
          const tw = 0.6 + 0.4 * Math.sin(t * 3 + p.ph);
          ctx.globalAlpha = p.a * tw * dim * (this.mode === 'drift' ? 0.55 : 1);
          const s = p.s * (this.mode === 'form' ? 1 : 0.8);
          ctx.drawImage(this.sprites[p.c], p.x - s / 2, p.y - s / 2, s, s);
        }
        // fireworks
        if (this.fireworks && Math.random() < dt * (LW.reduced() ? 0.8 : 1.6)) {
          this.rockets.push({ x: rand(w * 0.12, w * 0.88), y: h + 10, vx: rand(-30, 30), vy: -rand(h * 0.9, h * 1.25), ty: rand(h * 0.12, h * 0.45), heart: Math.random() < 0.35 });
          LW.audio.sfx('launch');
        }
        for (let i = this.rockets.length - 1; i >= 0; i--) {
          const r = this.rockets[i];
          r.vy += 380 * dt;
          r.x += r.vx * dt; r.y += r.vy * dt;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(this.sprites[1], r.x - 5, r.y - 5, 10, 10);
          if (r.y <= r.ty || r.vy >= -40) { this.rockets.splice(i, 1); this.burstFirework(r.x, r.y, r.heart); }
        }
        for (let i = this.sparks.length - 1; i >= 0; i--) {
          const s = this.sparks[i];
          s.life += dt;
          if (s.life >= s.max) { this.sparks.splice(i, 1); continue; }
          s.vx *= 0.985; s.vy = s.vy * 0.985 + 70 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          ctx.globalAlpha = 1 - s.life / s.max;
          ctx.drawImage(this.sprites[s.c], s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    },

    /* ── Timeline ── */
    async line(text, dur, cls = '') {
      const box = $('#fnText', this.el);
      box.innerHTML = `<p class="fn-line ${cls}">${text}</p>`;
      const p = box.firstChild;
      requestAnimationFrame(() => p.classList.add('in'));
      await wait(Math.max(600, dur - 900));
      p.classList.add('out');
      await wait(900);
    },
    async start() {
      const st = $('#fnStart', this.el);
      st.classList.add('gone');
      setTimeout(() => st.remove(), 800);
      $('#fnSkip', this.el).hidden = false;
      this.play();
    },
    async play() {
      const tk = ++this.tk;
      const ok = () => this.alive && tk === this.tk;
      const F = LW.C.finale || {};
      const R = LW.reduced();
      this.dim = 1;
      this.fin.classList.add('bars');
      this.mode = 'drift';
      await wait(R ? 400 : 1800);
      if (!ok()) return;
      this.mode = 'warp';
      LW.audio.sfx('whoosh');
      LW.audio.swell(1.35);
      for (const l of F.lines || []) {
        await this.line(LW.tx(l), R ? 2200 : 3600);
        if (!ok()) return;
      }
      // heart forms
      this.setTargets('heart');
      this.mode = 'form';
      LW.audio.sfx('magic');
      await wait(R ? 1200 : 2600);
      if (!ok()) return;
      for (let b = 0; b < 3; b++) {
        this.beat = 1; LW.audio.sfx('heartbeat');
        await wait(900);
        if (!ok()) return;
      }
      // names
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      if (!ok()) return;
      this.setTargets('text');
      LW.audio.sfx('magic');
      await wait(R ? 1600 : 3800);
      if (!ok()) return;
      this.mode = 'scatter';
      LW.audio.sfx('whoosh');
      await wait(700);
      if (!ok()) return;
      this.showQuestion();
    },
    skip() {
      this.tk++;
      const box = $('#fnText', this.el);
      box.innerHTML = '';
      this.fin.classList.add('bars');
      this.showQuestion();
    },
    showQuestion() {
      $('#fnSkip', this.el).hidden = true;
      $('#fnText', this.el).innerHTML = '';
      this.setTargets('heart');
      this.mode = 'form';
      this.dim = 0.5;
      const q = $('#fnQ', this.el);
      q.hidden = false;
      requestAnimationFrame(() => q.classList.add('show'));
      this.beatTimer = setInterval(() => { if (this.alive && this.mode === 'form') this.beat = 1; }, 1300);
      setTimeout(() => { const y = $('#fnYes', this.el); y && y.focus({ preventScroll: true }); }, 600);
    },
    setupNo() {
      const F = LW.C.finale || {};
      const no = $('#fnNo', this.el), yesB = $('#fnYes', this.el);
      const taunts = (F.noTaunts && F.noTaunts.length ? F.noTaunts : ['Ishonchingiz komilmi?']).map(LW.tx);
      this.dodges = 0;
      const dodge = (e) => {
        if (no.dataset.yes) return;
        e && e.preventDefault && e.preventDefault();
        this.dodges++;
        LW.audio.sfx('slide');
        yesB.style.setProperty('--grow', 1 + Math.min(this.dodges, 6) * 0.07);
        if (this.dodges > taunts.length) {
          no.dataset.yes = '1';
          no.classList.remove('btn-ghost', 'flying');
          no.classList.add('btn-primary');
          no.style.left = no.style.top = '';
          $('span', no).innerHTML = LW.tx(F.yes || 'Ha');
          $('.fn-qbtns', this.el).appendChild(no);
          return;
        }
        $('span', no).innerHTML = taunts[this.dodges - 1];
        const host = this.fin;
        if (no.parentElement !== host) host.appendChild(no);
        no.classList.add('flying');
        const bw = no.offsetWidth, bh = no.offsetHeight;
        const W = host.clientWidth, H = host.clientHeight;
        const px = e && e.clientX != null ? e.clientX : W / 2, py = e && e.clientY != null ? e.clientY : H / 2;
        // keep clear of the pointer, the question text and the "yes" button
        const hr = host.getBoundingClientRect();
        const avoid = ['.fn-qtext', '#fnYes', '.fn-qheart'].map((s) => $(s, this.el)).filter(Boolean).map((n) => {
          const r = n.getBoundingClientRect();
          return { l: r.left - hr.left - 10, t: r.top - hr.top - 10, r: r.right - hr.left + 10, b: r.bottom - hr.top + 10 };
        });
        const hits = (x, y) => avoid.some((a) => x < a.r && x + bw > a.l && y < a.b && y + bh > a.t);
        let x = 0, y = 0;
        for (let k = 0; k < 40; k++) {
          x = rand(16, Math.max(17, W - bw - 16));
          y = rand(70, Math.max(71, H - bh - 70));
          if (Math.hypot(x + bw / 2 - px, y + bh / 2 - py) > Math.min(W, H) * 0.3 && !hits(x, y)) break;
        }
        no.style.left = x + 'px';
        no.style.top = y + 'px';
        no.style.setProperty('--s', Math.max(0.75, 1 - this.dodges * 0.05));
      };
      no.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') dodge(e); });
      no.addEventListener('pointerdown', (e) => { if (!no.dataset.yes) dodge(e); });
      no.addEventListener('click', (e) => { if (no.dataset.yes) this.yes(); else dodge(e); });
    },
    async yes() {
      if (this.said) return;
      this.said = true;
      clearInterval(this.beatTimer);
      const d = LW.store.d;
      d.finaleSeen = true;
      d.said = 'ha';
      LW.store.save();
      LW.audio.sfx('win');
      const q = $('#fnQ', this.el);
      q.classList.remove('show');
      const no = $('#fnNo', this.el);
      if (no && no.classList.contains('flying')) no.classList.add('gone');
      this.dim = 1;
      this.beat = 1;
      await wait(400);
      if (!this.alive) return;
      this.mode = 'scatter';
      this.fireworks = true;
      for (let i = 0; i < 3; i++) setTimeout(() => this.alive && this.burstFirework(rand(this.w * 0.2, this.w * 0.8), rand(this.h * 0.15, this.h * 0.4), i === 1), i * 350);
      LW.fx.confetti();
      LW.fx.rain(70);
      await wait(900);
      if (!this.alive) return;
      q.hidden = true;
      this.mode = 'drift';
      const end = $('#fnEnd', this.el);
      end.hidden = false;
      requestAnimationFrame(() => end.classList.add('show'));
    },
    replay() {
      this.tk++;
      clearInterval(this.beatTimer);
      this.said = false;
      this.fireworks = false;
      this.sparks = []; this.rockets = [];
      const end = $('#fnEnd', this.el);
      end.classList.remove('show');
      setTimeout(() => (end.hidden = true), 600);
      const q = $('#fnQ', this.el);
      q.hidden = true;
      q.classList.remove('show');
      // restore the "no" button for another round
      const no = $('#fnNo', this.el);
      delete no.dataset.yes;
      no.className = 'btn btn-ghost fn-no';
      no.style.left = no.style.top = '';
      $('span', no).innerHTML = LW.tx((LW.C.finale || {}).no || 'Yo‘q');
      $('.fn-qbtns', this.el).appendChild(no);
      $('#fnYes', this.el).style.removeProperty('--grow');
      this.dodges = 0;
      this.fin.classList.remove('bars');
      $('#fnSkip', this.el).hidden = false;
      setTimeout(() => this.play(), 300);
    }
  };
  LW.route('final', scr);
})();
