/* LOVE WORLD — 15 reasons: wax-sealed hearts that open into handwritten notes */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc, wait } = LW;

  LW.route('sabablar', {
    title: 'Sabablar',
    hud: true,
    sky: 'calm',
    enter(el) {
      const C = LW.C, d = LW.store.d;
      const R = C.reasons || [];
      this.el = el;
      el.innerHTML = `
        <div class="wrap reasons">
          <header class="screen-head">
            <p class="eyebrow">${R.length} ta muhrlangan sir</p>
            <h1 class="title-lg">Seni sevishimning <em class="gold-text">${R.length} sababi</em></h1>
            <p class="lead">Har bir muhr ortida yuragimdan bir parcha yashiringan. Ularni birma-bir och — shoshilma.</p>
          </header>
          <div class="reason-meter glass">
            <span>${LW.icon('heart', 'beat')} <b id="rmCount">0</b>/${R.length} ochildi</span>
            <span class="meter"><i id="rmBar"></i></span>
            <button class="btn btn-ghost btn-sm" id="rmRead">${LW.icon('book')}<span>Hammasini o‘qish</span></button>
          </div>
          <div class="seal-grid">
            ${R.map((r, i) => `
              <button class="seal" data-i="${i}" style="--i:${i}" aria-label="${i + 1}-sabab">
                <span class="seal-paper"><span class="seal-line"></span><span class="seal-line s"></span></span>
                <span class="seal-wax">${LW.icon('heart')}</span>
                <span class="seal-num">${String(i + 1).padStart(2, '0')}</span>
              </button>`).join('')}
          </div>
          <div class="reasons-outro" id="rOutro" hidden>
            <p class="hand">${LW.tx(C.reasonsOutro || '')}</p>
          </div>
        </div>`;
      $$('.seal', el).forEach((s) => s.addEventListener('click', () => this.open(+s.dataset.i, s)));
      $('#rmRead', el).addEventListener('click', () => {
        const first = R.findIndex((_, i) => !d.reasons.includes(i));
        this.open(first < 0 ? 0 : first);
      });
      this.sync();
    },
    sync() {
      const d = LW.store.d, R = LW.C.reasons || [], el = this.el;
      $$('.seal', el).forEach((s) => s.classList.toggle('opened', d.reasons.includes(+s.dataset.i)));
      $('#rmCount', el).textContent = d.reasons.length;
      $('#rmBar', el).style.width = (R.length ? (d.reasons.length / R.length) * 100 : 0) + '%';
      const all = R.length && d.reasons.length >= R.length;
      $('#rOutro', el).hidden = !all;
    },
    mark(i) {
      const d = LW.store.d;
      if (!d.reasons.includes(i)) {
        d.reasons.push(i);
        LW.store.save();
        const R = LW.C.reasons || [];
        if (d.reasons.length === R.length) {
          setTimeout(() => { LW.fx.rain(50); LW.toast('Barcha sabablar ochildi! Lekin ular aslida cheksiz 💗', 'heart', 4000); }, 900);
        }
        return true;
      }
      return false;
    },
    async open(i, sealEl) {
      const R = LW.C.reasons || [];
      if (!R.length) return;
      if (sealEl && !sealEl.classList.contains('opened')) {
        sealEl.classList.add('cracking');
        LW.audio.sfx('flip');
        const r = sealEl.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 16, colors: ['#ff3d7f', '#ff7ab6', '#ffd27a'], speed: 200 });
        await wait(LW.reduced() ? 100 : 420);
        sealEl.classList.remove('cracking');
      }
      let cur = i;
      const reader = LW.h(`<div class="reader" role="dialog" aria-modal="true" aria-label="Sabab">
          <div class="reader-bg"></div>
          <div class="reader-card">
            <button class="btn-icon reader-x" aria-label="Yopish">${LW.icon('close')}</button>
            <div class="reader-paper">
              <p class="reader-n"></p>
              <p class="reader-text hand"></p>
              <span class="reader-heart">${LW.icon('heart')}</span>
            </div>
            <div class="reader-nav">
              <button class="btn-icon" data-dir="-1" aria-label="Oldingi">${LW.icon('left')}</button>
              <span class="reader-pos"></span>
              <button class="btn-icon" data-dir="1" aria-label="Keyingi">${LW.icon('right')}</button>
            </div>
          </div>
        </div>`);
      document.body.appendChild(reader);
      this.reader = reader;
      const show = (k, dir = 0) => {
        cur = (k + R.length) % R.length;
        const paper = $('.reader-paper', reader);
        paper.classList.remove('in', 'from-l', 'from-r');
        void paper.offsetWidth;
        paper.classList.add(dir < 0 ? 'from-l' : 'from-r');
        $('.reader-n', reader).textContent = `Sabab № ${cur + 1}`;
        const words = LW.t(R[cur]).split(/\s+/);
        $('.reader-text', reader).innerHTML = words.map((w, j) => `<span style="--w:${j}">${esc(w)}</span>`).join(' ');
        $('.reader-pos', reader).textContent = `${cur + 1} / ${R.length}`;
        requestAnimationFrame(() => paper.classList.add('in'));
        const fresh = this.mark(cur);
        if (fresh && dir) LW.audio.sfx('flip');
        this.sync();
      };
      const close = () => {
        reader.classList.remove('open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => reader.remove(), 400);
        this.reader = null;
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowRight') show(cur + 1, 1);
        if (e.key === 'ArrowLeft') show(cur - 1, -1);
      };
      this.closeReader = close;
      $('.reader-x', reader).addEventListener('click', () => { LW.audio.sfx('tap'); close(); });
      $('.reader-bg', reader).addEventListener('click', close);
      $$('.reader-nav [data-dir]', reader).forEach((b) => b.addEventListener('click', () => { LW.audio.sfx('tap'); show(cur + +b.dataset.dir, +b.dataset.dir); }));
      // swipe
      let sx = null;
      const card = $('.reader-card', reader);
      card.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      card.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) show(cur + (e.clientX < sx ? 1 : -1), e.clientX < sx ? 1 : -1); sx = null; });
      document.addEventListener('keydown', onKey);
      LW.audio.sfx('magic');
      show(i, 1);
      requestAnimationFrame(() => reader.classList.add('open'));
    },
    leave() { if (this.reader && this.closeReader) this.closeReader(); }
  });
})();
