/* LOVE WORLD — Secret room: 7-key door → candles → hidden message → gift & love coupons → wish jar */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc, wait, rand } = LW;

  LW.route('sirli-xona', {
    title: 'Sirli xona',
    hud: true,
    sky: 'calm',
    enter(el) {
      this.el = el;
      this.alive = true;
      if (!LW.store.d.secret.opened) this.renderDoor();
      else this.renderRoom(true);
    },
    leave() { this.alive = false; },

    /* ── Door with seven keyholes ── */
    renderDoor() {
      const el = this.el;
      el.innerHTML = `
        <div class="wrap sr-door-stage">
          <header class="screen-head compact">
            <p class="eyebrow">Sirli xona</p>
            <h1 class="title-lg">Yetti kalitli <em class="gold-text">eshik</em></h1>
            <p class="lead">Sen yettita sinovdan o‘tding. Endi har bir kalitni o‘z qulfiga sol.</p>
          </header>
          <div class="big-door" id="bigDoor">
            <div class="bd-frame">
              <div class="bd-leaf l"><i></i><i></i></div>
              <div class="bd-leaf r"><i></i><i></i></div>
              <div class="bd-light"></div>
            </div>
            <div class="bd-arch">
              ${LW.GAME_IDS.map((id, i) => `<span class="bd-kh" style="--a:${-90 + (i - 3) * 24}deg;--i:${i}"><b>${LW.icon('key')}</b></span>`).join('')}
            </div>
            <span class="bd-heart">${LW.icon('heart')}</span>
          </div>
          <button class="btn btn-gold btn-lg" id="useKeys">${LW.icon('key')}<span>Yetti kalitni solish</span></button>
        </div>`;
      $('#useKeys', el).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.classList.add('gone');
        const door = $('#bigDoor', el);
        const khs = $$('.bd-kh', door);
        for (let i = 0; i < khs.length; i++) {
          if (!this.alive) return;
          khs[i].classList.add('on');
          LW.audio.sfx('note', i * 2);
          const r = khs[i].getBoundingClientRect();
          LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 8, speed: 120, g: 0, colors: ['#ffd27a', '#fff'], shapes: ['spark'] });
          await wait(LW.reduced() ? 60 : 260);
        }
        await wait(300);
        LW.audio.sfx('unlock');
        door.classList.add('open');
        await wait(400);
        LW.audio.sfx('door');
        LW.store.d.secret.opened = true;
        LW.store.save();
        await wait(LW.reduced() ? 300 : 1500);
        if (!this.alive) return;
        el.classList.add('flash');
        this.renderRoom(false);
        setTimeout(() => el.classList.remove('flash'), 900);
      });
    },

    /* ── The room ── */
    renderRoom() {
      const el = this.el, C = LW.C, S = LW.store.d.secret;
      const lit = S.candles;
      const heights = [70, 96, 82, 112, 82, 96, 70];
      const words = LW.t((C.secret && C.secret.message) || '').split(/\s+/);
      el.innerHTML = `
        <div class="sr-room ${lit ? 'all-lit' : ''}" id="room" style="--light:${lit ? 1 : 0}">
          <div class="room-glow" aria-hidden="true"></div>
          <div class="wrap">
            <header class="screen-head compact">
              <p class="eyebrow">Sirli xona</p>
              <h1 class="title-lg">${lit ? 'Shamlar <em class="gold-text">yonmoqda</em>' : 'Shamlarni <em class="gold-text">yoq</em>'}</h1>
              <p class="lead" id="roomLead">${lit ? 'Bu xona endi har doim sen uchun yorug‘.' : 'Har bir sham — sen o‘tgan bitta sinov. Yettitasini yoqsang, xonaning sirri ochiladi.'}</p>
            </header>
            <div class="candles" role="group" aria-label="Shamlar">
              ${heights.map((hh, i) => `<button class="candle ${lit ? 'lit' : ''}" data-i="${i}" style="--h:${hh}px;--i:${i}" aria-label="${i + 1}-sham">
                <span class="flame"><i></i></span><span class="wick"></span><span class="wax"><i></i></span></button>`).join('')}
            </div>
            <section class="secret-msg ${lit ? 'show' : ''}" id="secretMsg" ${lit ? '' : 'hidden'}>
              <p class="eyebrow">Eng katta sirim</p>
              <p class="secret-text hand">${words.map((w, j) => `<span style="--w:${j}">${esc(w)}</span>`).join(' ')}</p>
              <p class="secret-sign hand">— ${esc(C.myName || '')}</p>
            </section>
            <section class="gift-area" id="giftArea" hidden>
              <button class="gift ${S.gift ? 'open' : ''}" id="gift" aria-label="Sovg‘ani ochish">
                <span class="gift-rays"></span>
                <span class="gift-lid"><i class="bow l"></i><i class="bow r"></i></span>
                <span class="gift-box"><i class="ribbon"></i></span>
              </button>
              <p class="gift-hint" id="giftHint">${S.gift ? '' : `${LW.icon('gift')} Sovg‘ani och`}</p>
            </section>
            <section class="coupons" id="coupons" hidden></section>
            <section class="jar-wrap glass" id="jarWrap" hidden></section>
            <div class="sr-final" id="srFinal" hidden>
              <p class="lead center">Hamma sirlar ochildi. Endi hikoyamizning eng go‘zal lahzasi qoldi…</p>
              <a class="btn btn-gold btn-lg" href="#/final">${LW.icon('crown')}<span>Buyuk finalga o‘tish</span></a>
            </div>
          </div>
        </div>`;
      $$('.candle', el).forEach((c) => c.addEventListener('click', () => this.light(c)));
      if (lit) this.afterMessage(true);
    },
    async light(c) {
      if (c.classList.contains('lit')) return;
      c.classList.add('lit');
      const i = +c.dataset.i;
      LW.audio.sfx('candle', i * 2);
      const r = c.getBoundingClientRect();
      LW.fx.burst(r.left + r.width / 2, r.top + 4, { count: 10, speed: 110, colors: ['#ffd27a', '#ffb347', '#fff2c4'], shapes: ['spark'], up: 120, g: -40 });
      const n = $$('.candle.lit', this.el).length;
      const room = $('#room', this.el);
      room.style.setProperty('--light', n / 7);
      if (n < 7) return;
      // all candles lit
      LW.store.d.secret.candles = true;
      LW.store.save();
      room.classList.add('all-lit');
      await wait(700);
      if (!this.alive) return;
      LW.audio.sfx('magic');
      $('h1', room).innerHTML = 'Shamlar <em class="gold-text">yonmoqda</em>';
      $('#roomLead', room).textContent = 'Xona yorishdi… va devorda yashirin yozuv paydo bo‘ldi.';
      const msg = $('#secretMsg', room);
      msg.hidden = false;
      requestAnimationFrame(() => msg.classList.add('show'));
      msg.scrollIntoView({ behavior: LW.reduced() ? 'auto' : 'smooth', block: 'center' });
      LW.fx.rain(30);
      LW.toast('Buyuk final ochildi! ✨', 'crown', 3600);
      const words = $$('.secret-text span', msg).length;
      await wait(LW.reduced() ? 300 : Math.min(6000, 600 + words * 70));
      if (!this.alive) return;
      this.afterMessage(false);
    },
    afterMessage(instant) {
      const S = LW.store.d.secret;
      const ga = $('#giftArea', this.el);
      ga.hidden = false;
      if (!instant) requestAnimationFrame(() => ga.classList.add('show'));
      else ga.classList.add('show');
      const gift = $('#gift', this.el);
      if (S.gift) { this.showCoupons(true); return; }
      gift.addEventListener('click', async () => {
        if (gift.classList.contains('open')) return;
        gift.classList.add('open');
        $('#giftHint', this.el).textContent = '';
        LW.audio.sfx('magic');
        setTimeout(() => LW.audio.sfx('win'), 300);
        const r = gift.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height * 0.3, { count: 70, speed: 480 });
        LW.fx.confetti();
        S.gift = true;
        LW.store.save();
        await wait(LW.reduced() ? 200 : 900);
        if (this.alive) this.showCoupons(false);
      });
      if (!instant) setTimeout(() => ga.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
    },
    showCoupons(instant) {
      const C = LW.C, S = LW.store.d.secret, el = this.el;
      const list = (C.secret && C.secret.coupons) || [];
      const cp = $('#coupons', el);
      const usedAt = (i) => (S.coupons.find((c) => c.i === i) || {}).at;
      const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };
      cp.innerHTML = `
        <div class="sec-head center"><p class="eyebrow">Sovg‘a ichida</p><h2 class="title-md">Sevgi kuponlari</h2>
          <p class="lead center">Har birini istagan paytingda ishlat — men va’damda turaman.</p></div>
        <div class="coupon-grid">
          ${list.map((t, i) => `<div class="coupon ${usedAt(i) ? 'used' : ''}" style="--i:${i}">
              <span class="cp-n">Kupon №${i + 1}</span>
              <p class="cp-text">${LW.tx(t)}</p>
              <span class="cp-foot"><span class="cp-sig">${esc(C.myName || '')} ${LW.icon('heart')}</span>
              <button class="btn btn-sm btn-primary cp-use" data-i="${i}">Ishlatish</button></span>
              <span class="cp-stamp">${LW.icon('check')} Ishlatildi${usedAt(i) ? ' · ' + esc(fmt(usedAt(i))) : ''}</span>
            </div>`).join('')}
        </div>`;
      cp.hidden = false;
      requestAnimationFrame(() => cp.classList.add('show'));
      $$('.cp-use', cp).forEach((b) => b.addEventListener('click', async () => {
        const i = +b.dataset.i;
        const ok = await LW.confirm('Kuponni ishlatasanmi?', `«${LW.tx(list[i])}» — bu kupon ishlatilgan deb belgilanadi. Uni ${esc(C.myName || 'menga')}ga ko‘rsatishni unutma!`, 'Ha, ishlataman', 'Hozir emas');
        if (!ok || !this.alive) return;
        if (!S.coupons.find((c) => c.i === i)) S.coupons.push({ i, at: new Date().toISOString() });
        LW.store.save();
        const card = b.closest('.coupon');
        card.classList.add('used', 'stamping');
        $('.cp-stamp', card).innerHTML = `${LW.icon('check')} Ishlatildi · ${esc(fmt(new Date().toISOString()))}`;
        LW.audio.sfx('unlock');
        const r = card.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 20 });
        LW.toast(`Kupon faollashdi! Endi uni ${esc(C.myName || '')}ga ko‘rsat 💝`, 'gift');
      }));
      this.showJar(instant);
      if (!instant) setTimeout(() => cp.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    },
    showJar() {
      const S = LW.store.d.secret, el = this.el;
      const jw = $('#jarWrap', el);
      jw.innerHTML = `
        <div class="jar" id="jar" aria-label="Orzular bankasi">
          <span class="jar-lid"></span><span class="jar-neck"></span>
          <span class="jar-body"><span class="jar-stars" id="jarStars"></span><span class="jar-shine"></span><span class="jar-label">Orzular</span></span>
        </div>
        <div class="jar-side">
          <p class="eyebrow">Orzular bankasi</p>
          <h2 class="title-md">Orzuingni yoz</h2>
          <p class="muted">Yozgan orzuing yulduzga aylanib, bankaga tushadi. Ularni birga ushaltiramiz.</p>
          <form class="jar-form" id="jarForm">
            <textarea class="field" id="wishText" rows="2" maxlength="140" placeholder="Masalan: birga Parijga borish…" aria-label="Orzu"></textarea>
            <button class="btn btn-gold" type="submit">${LW.icon('star')}<span>Yulduzga aylantir</span></button>
          </form>
          <ul class="wish-list" id="wishList"></ul>
        </div>`;
      jw.hidden = false;
      requestAnimationFrame(() => jw.classList.add('show'));
      const draw = () => {
        const stars = $('#jarStars', jw), ul = $('#wishList', jw);
        stars.innerHTML = S.wishes.map((w, i) => {
          const sx = 12 + ((i * 37) % 76), sy = 82 - ((i * 23) % 56) - Math.floor(i / 6) * 4;
          return `<button class="jar-star" style="left:${sx}%;top:${Math.max(10, sy)}%;--d:${(i % 5) * 0.4}s" data-i="${i}" aria-label="Orzu ${i + 1}">${LW.icon('star')}</button>`;
        }).join('');
        ul.innerHTML = S.wishes.slice().reverse().slice(0, 6).map((w) => `<li>${LW.icon('star')}<span>${esc(w.t)}</span></li>`).join('');
        $$('.jar-star', stars).forEach((b) => b.addEventListener('click', () => { LW.audio.sfx('note', +b.dataset.i); LW.toast(esc(S.wishes[+b.dataset.i].t), 'star'); }));
      };
      draw();
      $('#jarForm', jw).addEventListener('submit', async (e) => {
        e.preventDefault();
        const ta = $('#wishText', jw);
        const t = ta.value.trim();
        if (!t) { ta.focus(); return; }
        ta.value = '';
        const a = ta.getBoundingClientRect(), b = $('#jar', jw).getBoundingClientRect();
        const fly = LW.h(`<div class="wish-fly">${LW.icon('star')}</div>`);
        fly.style.left = a.left + a.width / 2 + 'px';
        fly.style.top = a.top + a.height / 2 + 'px';
        document.body.appendChild(fly);
        LW.audio.sfx('magic');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          fly.classList.add('go');
          fly.style.left = b.left + b.width / 2 + 'px';
          fly.style.top = b.top + b.height * 0.45 + 'px';
        }));
        await wait(LW.reduced() ? 100 : 900);
        fly.remove();
        S.wishes.push({ t, at: new Date().toISOString() });
        LW.store.save();
        draw();
        LW.audio.sfx('correct');
        LW.fx.burst(b.left + b.width / 2, b.top + b.height * 0.4, { count: 16, shapes: ['star', 'spark'], colors: ['#ffd27a', '#fff'] });
      });
      const fin = $('#srFinal', el);
      fin.hidden = false;
      requestAnimationFrame(() => fin.classList.add('show'));
    }
  });
})();
