/* LOVE WORLD — Memory book with real 3D page flips (spread on desktop, single page on phones) */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc } = LW;
  const ART = {
    heart: ['#ff8fc4', '#ff3d7f'], star: ['#ffd27a', '#ff9f43'], moon: ['#9ab8ff', '#5b4cff'], ring: ['#ffb3e6', '#c86dd7'],
    music: ['#7ef0d0', '#2a9db3'], sun: ['#ffd27a', '#ff7a59'], gift: ['#ff9a8b', '#ff5f6d'], infinity: ['#c79bff', '#7c5cff'],
    camera: ['#a0c4ff', '#6a7bff'], flower: ['#ffb3d1', '#ff6fa8']
  };

  function photoBlock(m, i) {
    const icon = LW.iconNames.includes(m.icon) ? m.icon : 'heart';
    const [c1, c2] = ART[icon] || ART.heart;
    return `<figure class="pg-photo" style="--c1:${c1};--c2:${c2};--tilt:${i % 2 ? 2.2 : -2.4}deg">
      <span class="pg-art">${LW.icon(icon)}<i></i><i></i><i></i><i></i></span>
      ${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(LW.t(m.title || ''))}" loading="lazy" decoding="async">` : ''}
      <span class="pg-tape"></span>
    </figure>`;
  }
  function pageHTML(p, n) {
    const C = LW.C;
    switch (p.type) {
      case 'cover':
        return `<div class="pg pg-cover"><div class="cover-frame">
          <span class="cover-orn">${LW.icon('sparkle')}</span>
          <p class="cover-eyebrow">${esc(C.siteTitle || 'LOVE WORLD')}</p>
          <h2 class="cover-title">${LW.tx(C.bookTitle || 'Bizning xotiralarimiz')}</h2>
          <span class="cover-heart">${LW.icon('heart')}</span>
          <p class="cover-names">${esc(C.herName || '')} &amp; ${esc(C.myName || '')}</p>
          <p class="cover-tap">Varaqlash uchun bos ${LW.icon('right')}</p>
        </div></div>`;
      case 'dedication':
        return `<div class="pg pg-ded"><p class="ded-small">Bu kitob</p><p class="ded-name">${esc(C.herName || '')}</p><p class="ded-small">uchun yozildi.</p>
          <span class="ded-line"></span><p class="ded-text hand">Har bir sahifada — biz. Har bir satrda — sen.</p><span class="pg-num">${n}</span></div>`;
      case 'memory':
        return `<div class="pg pg-mem">
          ${photoBlock(p.m, n)}
          <p class="pg-date">${LW.tx(p.m.date || '')}</p>
          <h3 class="pg-title">${LW.tx(p.m.title || '')}</h3>
          <p class="pg-text hand">${LW.tx(p.m.text || '')}</p>
          <span class="pg-num">${n}</span></div>`;
      case 'blank':
        return `<div class="pg pg-blank"><span class="blank-ic">${LW.icon('feather')}</span><p class="hand">Bu sahifa kelajakdagi xotiramiz uchun bo‘sh qoldirildi…</p><span class="pg-num">${n}</span></div>`;
      case 'end':
        return `<div class="pg pg-end"><span class="end-ic">${LW.icon('infinity')}</span><h3 class="pg-title">Davomi bor…</h3>
          <p class="hand">Eng go‘zal sahifalarimizni hali birga yozamiz.</p><span class="pg-num">${n}</span></div>`;
      case 'back':
        return `<div class="pg pg-cover pg-backcover"><div class="cover-frame"><span class="cover-heart">${LW.icon('heart')}</span><p class="cover-names">${esc(C.myName || '')} ${LW.icon('heart')} ${esc(C.herName || '')}</p></div></div>`;
      default:
        return '<div class="pg pg-paper"></div>';
    }
  }

  LW.route('xotiralar', {
    title: 'Xotiralar kitobi',
    hud: true,
    sky: 'calm',
    enter(el) {
      const C = LW.C;
      this.el = el;
      this.mems = (C.memories || []).filter(Boolean);
      el.innerHTML = `
        <div class="wrap bookscr">
          <header class="screen-head compact">
            <p class="eyebrow">Xotiralar kitobi</p>
            <h1 class="title-lg">${LW.tx(C.bookTitle || 'Bizning xotiralarimiz')}</h1>
          </header>
          <div class="book-stage" id="bookStage"><div class="book" id="book"></div></div>
          <div class="book-nav">
            <button class="btn-icon btn-lg-icon" id="bkPrev" aria-label="Oldingi sahifa">${LW.icon('left')}</button>
            <span class="book-pos" id="bkPos"></span>
            <button class="btn-icon btn-lg-icon" id="bkNext" aria-label="Keyingi sahifa">${LW.icon('right')}</button>
          </div>
          <p class="book-tip">${LW.icon('sparkle')} Sahifani bos, suring yoki <kbd>←</kbd> <kbd>→</kbd> tugmalaridan foydalan</p>
        </div>`;
      this.book = $('#book', el);
      this.f = 0;
      this.build(true);
      $('#bkPrev', el).addEventListener('click', () => this.prev());
      $('#bkNext', el).addEventListener('click', () => this.next());
      // tap / swipe on the book
      let sx = null, sy = null;
      const stage = $('#bookStage', el);
      stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
      stage.addEventListener('pointerup', (e) => {
        if (sx == null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        sx = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? this.next() : this.prev(); return; }
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
          const r = this.book.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          if (x < 0 || x > 1) return;
          if (this.spread) (x >= 0.5 || this.f === 0 ? this.next() : this.prev());
          else (x > 0.35 ? this.next() : this.prev());
        }
      });
      this.onKey = (e) => {
        if (LW.modalOpen()) return;
        if (e.key === 'ArrowRight') this.next();
        if (e.key === 'ArrowLeft') this.prev();
      };
      this.onResize = () => {
        const sp = this.wantSpread();
        if (sp !== this.spread) this.build(false);
      };
      addEventListener('keydown', this.onKey);
      addEventListener('resize', this.onResize);
    },
    wantSpread() { return innerWidth >= 860 && innerHeight >= 560; },
    pages(spread) {
      const inner = [{ type: 'dedication' }, ...this.mems.map((m) => ({ type: 'memory', m })), { type: 'end' }];
      if (!spread) return [{ type: 'cover' }, ...inner];
      if (inner.length % 2) inner.splice(inner.length - 1, 0, { type: 'blank' });
      return [{ type: 'cover' }, ...inner, { type: 'back' }];
    },
    build(first) {
      // keep reading position (as page index) across mode changes
      const oldSpread = this.spread;
      const pageIdx = first ? 0 : oldSpread ? Math.max(0, this.f * 2 - 1) : this.f;
      this.spread = this.wantSpread();
      const pages = this.pages(this.spread);
      this.pageCount = pages.length;
      const leaves = [];
      if (this.spread) {
        for (let i = 0; i < pages.length; i += 2) leaves.push([pages[i], pages[i + 1]]);
      } else pages.forEach((p) => leaves.push([p, { type: 'paper' }]));
      this.leaves = leaves.length;
      this.book.className = 'book ' + (this.spread ? 'spread' : 'single');
      this.book.innerHTML = leaves.map(([a, b], i) => {
        const na = this.spread ? i * 2 : i, nb = na + 1;
        return `<div class="leaf" data-i="${i}">
          <div class="face front">${pageHTML(a, na)}</div>
          <div class="face back">${pageHTML(b, nb)}</div>
        </div>`;
      }).join('');
      $$('img', this.book).forEach((img) => img.addEventListener('error', () => img.remove()));
      this.leafEls = $$('.leaf', this.book);
      this.f = this.spread ? Math.min(this.leaves, Math.ceil(pageIdx / 2)) : Math.min(this.leaves - 1, pageIdx);
      this.apply(true);
    },
    apply(instant) {
      const n = this.leaves;
      this.leafEls.forEach((l, i) => {
        const flipped = i < this.f;
        if (instant) l.classList.add('instant');
        l.classList.toggle('flipped', flipped);
        l.style.zIndex = flipped ? i + 1 : n - i;
        if (instant) { void l.offsetWidth; l.classList.remove('instant'); }
      });
      this.book.classList.toggle('closed', this.spread && this.f === 0);
      this.book.classList.toggle('ended', this.spread && this.f === n);
      const pos = $('#bkPos', this.el);
      if (this.spread) pos.textContent = this.f === 0 ? 'Muqova' : this.f === n ? 'Oxiri' : `${this.f * 2 - 1}–${this.f * 2} / ${this.pageCount - 2}`;
      else pos.textContent = this.f === 0 ? 'Muqova' : `${this.f} / ${this.pageCount - 1}`;
      $('#bkPrev', this.el).disabled = this.f === 0;
      $('#bkNext', this.el).disabled = this.spread ? this.f === n : this.f === n - 1;
      const atEnd = this.spread ? this.f >= n - 1 : this.f === n - 1;
      if (atEnd && !LW.store.d.memoriesSeen) {
        LW.store.d.memoriesSeen = true;
        LW.store.save();
        setTimeout(() => LW.toast('Xotiralar kitobi to‘liq varaqlandi 📖', 'book'), 900);
      }
    },
    turn(leaf) {
      leaf.style.zIndex = this.leaves + 10;
      clearTimeout(leaf._t);
      leaf._t = setTimeout(() => this.apply(false), 1000);
    },
    next() {
      const max = this.spread ? this.leaves : this.leaves - 1;
      if (this.f >= max) return;
      const leaf = this.leafEls[this.f];
      this.f++;
      LW.audio.sfx('flip');
      leaf.classList.add('flipped');
      this.turn(leaf);
      this.apply(false);
      leaf.style.zIndex = this.leaves + 10;
    },
    prev() {
      if (this.f <= 0) return;
      this.f--;
      const leaf = this.leafEls[this.f];
      LW.audio.sfx('flip');
      leaf.classList.remove('flipped');
      this.apply(false);
      leaf.style.zIndex = this.leaves + 10;
      this.turn(leaf);
    },
    leave() {
      removeEventListener('keydown', this.onKey);
      removeEventListener('resize', this.onResize);
      (this.leafEls || []).forEach((l) => clearTimeout(l._t));
    }
  });
})();
