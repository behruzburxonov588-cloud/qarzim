/* LOVE WORLD — Animated love letter: wax seal → envelope opens → typewriter letter */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, esc, wait, rand } = LW;

  LW.route('maktub', {
    title: 'Sevgi maktubi',
    hud: true,
    sky: 'calm',
    enter(el) {
      this.el = el;
      this.alive = true;
      this.token = 0;
      const C = LW.C;
      const petals = Array.from({ length: LW.reduced() ? 6 : 16 }, () =>
        `<i class="petal" style="--x:${rand(0, 100).toFixed(1)}%;--d:${rand(7, 14).toFixed(1)}s;--del:${rand(-14, 0).toFixed(1)}s;--s:${rand(0.6, 1.3).toFixed(2)};--r:${rand(-180, 180).toFixed(0)}deg"></i>`).join('');
      el.innerHTML = `
        <div class="petals" aria-hidden="true">${petals}</div>
        <div class="wrap letterscr">
          <header class="screen-head compact">
            <p class="eyebrow">Faqat sen uchun</p>
            <h1 class="title-lg">Sevgi <em class="gold-text">maktubi</em></h1>
          </header>
          <div class="env-stage">
            <div class="envelope" id="env">
              <div class="env-back"></div>
              <div class="env-paper"><span class="hand">${LW.tx((C.letter && C.letter.greeting) || '')}</span><i></i><i></i><i></i></div>
              <div class="env-pocket"></div>
              <div class="env-flap"></div>
              <button class="env-seal" id="envSeal" aria-label="Muhrni sindirib, maktubni ochish">
                <span class="seal-half l"></span><span class="seal-half r"></span>
                <span class="seal-ic">${LW.icon('heart')}</span>
              </button>
              <p class="env-to">${esc(C.herName || '')} uchun</p>
            </div>
            <p class="env-hint" id="envHint">${LW.icon('sparkle')} Muhrni bos</p>
          </div>
        </div>`;
      $('#envSeal', el).addEventListener('click', () => this.openEnvelope());
      if (LW.store.d.letterRead) $('#envHint', el).innerHTML = `${LW.icon('check')} Sen bu maktubni o‘qigansan — yana ochishing mumkin`;
    },
    async openEnvelope() {
      const env = $('#env', this.el);
      if (!env || env.classList.contains('opening')) return;
      const tk = ++this.token;
      env.classList.add('opening');
      LW.audio.sfx('flip');
      const r = $('#envSeal', this.el).getBoundingClientRect();
      LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 22, colors: ['#c2183f', '#ff3d7f', '#ffd27a'], speed: 220 });
      $('#envHint', this.el).classList.add('gone');
      await wait(LW.reduced() ? 100 : 500);
      env.classList.add('flap-open');
      LW.audio.sfx('whoosh');
      await wait(LW.reduced() ? 150 : 800);
      env.classList.add('paper-out');
      LW.audio.sfx('magic');
      await wait(LW.reduced() ? 200 : 1100);
      if (!this.alive || tk !== this.token) return;
      this.read();
    },
    read() {
      const L = LW.C.letter || {};
      const blocks = [
        { cls: 'lt-greet', text: L.greeting },
        ...(L.paragraphs || []).map((p) => ({ cls: 'lt-p', text: p })),
        { cls: 'lt-close', text: L.closing },
        { cls: 'lt-sign', text: L.signature }
      ].filter((b) => b.text);
      const ov = LW.h(`<div class="letter-read" role="dialog" aria-modal="true" aria-label="Sevgi maktubi">
          <div class="lr-bg"></div>
          <div class="lr-scroll">
            <article class="lr-paper">
              <span class="lr-stamp">${LW.icon('heart')}</span>
              <div class="lr-body">${blocks.map((b) => `<p class="${b.cls}"></p>`).join('')}</div>
              <span class="caret"></span>
            </article>
          </div>
          <div class="lr-bar">
            <button class="btn btn-ghost btn-sm" id="lrSkip">${LW.icon('skip')}<span>Hammasini ko‘rsatish</span></button>
            <button class="btn btn-ghost btn-sm" id="lrReplay" hidden>${LW.icon('refresh')}<span>Qayta o‘qish</span></button>
            <button class="btn btn-primary btn-sm" id="lrClose">${LW.icon('heart')}<span>Yuragimga joylab qo‘ydim</span></button>
          </div>
        </div>`);
      document.body.appendChild(ov);
      this.ov = ov;
      requestAnimationFrame(() => ov.classList.add('open'));
      const ps = Array.from(ov.querySelectorAll('.lr-body p'));
      const scroller = $('.lr-scroll', ov);
      const caret = $('.caret', ov);
      let skip = false, stick = true;
      scroller.addEventListener('scroll', () => { stick = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 40; }, { passive: true });
      const done = () => {
        ps.forEach((p, i) => (p.textContent = LW.t(blocks[i].text)));
        caret.classList.add('gone');
        $('#lrSkip', ov).hidden = true;
        $('#lrReplay', ov).hidden = false;
        if (!LW.store.d.letterRead) {
          LW.store.d.letterRead = true;
          LW.store.save();
          LW.toast('Maktub o‘qildi — u endi sening yuragingda 💌', 'envelope');
        }
        const r = $('.lr-paper', ov).getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, Math.min(innerHeight - 80, r.bottom - 60), { count: 30 });
      };
      const type = async () => {
        const my = ++this.token;
        skip = false;
        caret.classList.remove('gone');
        ps.forEach((p) => (p.textContent = ''));
        $('#lrSkip', ov).hidden = false;
        $('#lrReplay', ov).hidden = true;
        scroller.scrollTop = 0;
        await wait(LW.reduced() ? 100 : 900);
        for (let i = 0; i < ps.length; i++) {
          const full = LW.t(blocks[i].text);
          const p = ps[i];
          p.appendChild(caret);
          let out = '';
          for (let k = 0; k < full.length; k++) {
            if (my !== this.token || !this.alive) return;
            if (skip || LW.reduced()) break;
            out += full[k];
            p.firstChild && p.firstChild.nodeType === 3 ? (p.firstChild.nodeValue = out) : p.insertBefore(document.createTextNode(out), caret);
            if (k % 3 === 0) LW.audio.sfx('type');
            if (stick) scroller.scrollTop = scroller.scrollHeight;
            const ch = full[k];
            await wait(ch === '.' || ch === '!' || ch === '?' ? 260 : ch === ',' ? 120 : 26);
          }
          if (skip || LW.reduced()) break;
          await wait(380);
        }
        if (my !== this.token || !this.alive) return;
        ov.querySelector('.lr-paper').appendChild(caret);
        done();
      };
      $('#lrSkip', ov).addEventListener('click', () => { skip = true; LW.audio.sfx('tap'); });
      $('#lrReplay', ov).addEventListener('click', () => { LW.audio.sfx('tap'); type(); });
      $('#lrClose', ov).addEventListener('click', () => {
        LW.audio.sfx('tap');
        if (!LW.store.d.letterRead) done();
        this.closeRead();
        LW.go('olam');
      });
      type();
    },
    closeRead() {
      if (!this.ov) return;
      const ov = this.ov;
      this.ov = null;
      this.token++;
      ov.classList.remove('open');
      setTimeout(() => ov.remove(), 500);
    },
    leave() {
      this.alive = false;
      this.closeRead();
    }
  });
})();
