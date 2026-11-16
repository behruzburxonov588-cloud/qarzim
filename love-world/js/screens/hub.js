/* LOVE WORLD — hub: the magical world map */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc } = LW;

  /** Subtle 3D tilt for cards on fine pointers. */
  LW.tilt = (root) => {
    if (!matchMedia('(pointer: fine)').matches || LW.reduced()) return;
    $$('[data-tilt]', root).forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
        card.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
        card.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
  };

  LW.route('olam', {
    title: 'Sehrli olam',
    hud: true,
    sky: 'calm',
    enter(el) {
      const C = LW.C, d = LW.store.d;
      const keys = LW.keyCount(), total = LW.GAME_IDS.length;
      const games = LW.GAME_IDS.map((id) => LW.games[id]).filter(Boolean);
      const reasonsN = (C.reasons || []).length;
      const secretOpen = LW.secretOpen(), finaleOpen = LW.finaleOpen();
      const circ = 2 * Math.PI * 52;
      const tg = LW.together();
      el.innerHTML = `
        <div class="wrap hub">
          <header class="hub-hero">
            <p class="eyebrow">Sehrli olam xaritasi</p>
            <h1 class="title-lg">Xush kelibsan, <span class="gold-text">${esc(C.herName || '')}</span></h1>
            <p class="lead">Bu olamdagi har bir yulduz, har bir sir va har bir o‘yin — faqat sen uchun yaratilgan.</p>
            ${tg ? `<div class="together glass" aria-live="off">
              <span class="together-label">${LW.icon('heart', 'beat')} Biz birgamiz</span>
              <div class="tg-units">
                <div><b id="tgD">${tg.days}</b><small>kun</small></div>
                <div><b id="tgH">${tg.hours}</b><small>soat</small></div>
                <div><b id="tgM">${tg.mins}</b><small>daqiqa</small></div>
                <div><b id="tgS">${tg.secs}</b><small>soniya</small></div>
              </div>
            </div>` : ''}
          </header>

          <section class="journey glass" style="--k:${keys / total}">
            <div class="ring" aria-label="${keys} ta kalit ${total} tadan">
              <svg viewBox="0 0 120 120"><defs><linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe29a"/><stop offset="1" stop-color="#ff6fa8"/></linearGradient></defs>
                <circle cx="60" cy="60" r="52" class="ring-bg"/>
                <circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" data-off="${circ * (1 - keys / total)}"/>
              </svg>
              <div class="ring-num"><b>${keys}</b><small>/${total}</small><span>kalit</span></div>
            </div>
            <div class="journey-text">
              <h2>Sening sayohating</h2>
              <p>${keys >= total ? 'Barcha yetti kalit sening qo‘lingda! Sirli xona eshigi seni kutmoqda.' : 'Yettita sinovdan o‘tib, har biridan bittadan sehrli kalit ol. Yetti kalit sirli xona eshigini ochadi.'}</p>
              <div class="key-slots">${LW.GAME_IDS.map((id, i) => `<span class="${d.keys[id] ? 'on' : ''}" style="--i:${i}" title="${esc(LW.games[id] ? LW.games[id].title : '')}">${LW.icon('key')}</span>`).join('')}</div>
            </div>
          </section>

          <section class="hub-sec">
            <div class="sec-head"><p class="eyebrow">I bob</p><h2 class="title-md">Yetti sehrli sinov</h2></div>
            <div class="game-grid">
              ${games.map((g, i) => `
                <a class="gcard ${d.keys[g.id] ? 'done' : ''}" href="#/oyin/${g.id}" data-tilt style="--c1:${g.colors[0]};--c2:${g.colors[1]};--i:${i}">
                  <span class="gcard-glow"></span>
                  <span class="gcard-top"><span class="gcard-n">Sinov ${i + 1}</span>${d.keys[g.id] ? `<span class="chip chip-gold">${LW.icon('key')} Kalit olindi</span>` : '<span class="chip">Yangi</span>'}</span>
                  <span class="gcard-icon">${LW.icon(g.icon)}</span>
                  <span class="gcard-title">${esc(g.title)}</span>
                  <span class="gcard-desc">${esc(g.short)}</span>
                  <span class="gcard-go">${d.keys[g.id] ? 'Yana o‘ynash' : 'O‘ynash'} ${LW.icon('right')}</span>
                </a>`).join('')}
            </div>
          </section>

          <section class="hub-sec">
            <div class="sec-head"><p class="eyebrow">II bob</p><h2 class="title-md">Yurak xazinalari</h2></div>
            <div class="treasure-grid">
              <a class="tcard" href="#/sabablar" data-tilt style="--c1:#ff6fa8;--c2:#ff3d7f;--i:0">
                <span class="tcard-icon">${LW.icon('heart')}</span>
                <span class="tcard-body"><span class="tcard-title">Seni sevishimning ${reasonsN} sababi</span>
                <span class="tcard-desc">Har bir muhr ortida yuragimdan bir parcha.</span>
                <span class="meter"><i style="width:${reasonsN ? (d.reasons.length / reasonsN) * 100 : 0}%"></i></span>
                <small class="tcard-meta">${d.reasons.length}/${reasonsN} ochildi</small></span>
              </a>
              <a class="tcard" href="#/xotiralar" data-tilt style="--c1:#b79bff;--c2:#7c5cff;--i:1">
                <span class="tcard-icon">${LW.icon('book')}</span>
                <span class="tcard-body"><span class="tcard-title">${esc(C.bookTitle || 'Xotiralar kitobi')}</span>
                <span class="tcard-desc">${(C.memories || []).length} ta sahifa — bizning eng shirin lahzalarimiz.</span>
                <small class="tcard-meta">${d.memoriesSeen ? `${LW.icon('check')} Varaqlandi` : 'Varaqlashni kutmoqda'}</small></span>
              </a>
              <a class="tcard" href="#/maktub" data-tilt style="--c1:#ffd27a;--c2:#ff9f5a;--i:2">
                <span class="tcard-icon">${LW.icon('envelope')}</span>
                <span class="tcard-body"><span class="tcard-title">Sevgi maktubi</span>
                <span class="tcard-desc">Muhrlangan maktub — faqat sen ochishing mumkin.</span>
                <small class="tcard-meta">${d.letterRead ? `${LW.icon('check')} O‘qildi` : 'Muhrlangan'}</small></span>
              </a>
            </div>
          </section>

          <section class="hub-sec">
            <div class="sec-head"><p class="eyebrow">III bob</p><h2 class="title-md">Eng katta sirlar</h2></div>
            <div class="mystery-grid">
              <a class="scard ${secretOpen ? '' : 'locked'}" id="secretCard" href="#/sirli-xona" data-tilt>
                <span class="scard-door">
                  ${LW.GAME_IDS.map((id, i) => `<i class="kh ${d.keys[id] ? 'on' : ''}" style="--a:${-90 + (i - 3) * 26}deg"></i>`).join('')}
                  <span class="scard-door-ic">${LW.icon(secretOpen ? 'door' : 'lock')}</span>
                </span>
                <span class="scard-title">Sirli xona</span>
                <span class="scard-desc">${secretOpen ? (d.secret.candles ? 'Shamlar yonmoqda. Xona sirlari ochilgan.' : 'Eshik seni kutmoqda. Ichkarida eng katta sirim bor…') : `Ochish uchun yetti kalit kerak · <b>${keys}/${total}</b>`}</span>
              </a>
              <a class="scard is-finale ${finaleOpen ? '' : 'locked'}" href="#/final" data-tilt>
                <span class="scard-door finale-ic"><span class="scard-door-ic">${LW.icon(finaleOpen ? 'crown' : 'lock')}</span></span>
                <span class="scard-title">Buyuk final</span>
                <span class="scard-desc">${finaleOpen ? (d.finaleSeen ? 'Yana bir bor tomosha qilishni xohlaysanmi?' : 'Hikoyamizning eng go‘zal lahzasi. Tayyormisan?') : 'Sirli xonadagi shamlar yonganda ochiladi'}</span>
              </a>
            </div>
          </section>

          <footer class="hub-foot">
            <span>Sevgi bilan yaratildi · ${esc(C.myName || '')}</span>${LW.icon('heart', 'beat')}
          </footer>
        </div>`;

      // locked cards: explain instead of navigating
      $$('.scard.locked', el).forEach((c) =>
        c.addEventListener('click', (e) => {
          e.preventDefault();
          LW.audio.sfx('wrong');
          c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
          LW.toast(c.classList.contains('is-finale') ? 'Final sirli xonadagi shamlar yonganda ochiladi' : `Sirli xona uchun yettita kalit kerak (${LW.keyCount()}/7)`, 'lock');
        })
      );
      $$('a.gcard, a.tcard, a.scard:not(.locked)', el).forEach((a) => a.addEventListener('click', () => LW.audio.sfx('tap')));
      LW.tilt(el);
      // animate ring after paint
      setTimeout(() => { const fg = $('.ring-fg', el); if (fg) fg.style.strokeDashoffset = fg.dataset.off; }, 350);
      // live together counter
      this.timer = setInterval(() => {
        const t = LW.together();
        if (!t) return;
        const set = (id, v) => { const n = $(id, el); if (n && n.textContent !== String(v)) { n.textContent = v; n.classList.remove('tick'); void n.offsetWidth; n.classList.add('tick'); } };
        set('#tgD', t.days); set('#tgH', t.hours); set('#tgM', t.mins); set('#tgS', t.secs);
      }, 1000);
      if (secretOpen && !d.secret.opened && !this.celebrated) {
        this.celebrated = true;
        setTimeout(() => { const s = $('#secretCard', el); s && s.classList.add('glowing'); }, 600);
      }
    },
    leave() { clearInterval(this.timer); }
  });
})();
