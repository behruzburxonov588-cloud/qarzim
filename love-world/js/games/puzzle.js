/* Game 5 — Sehrli jumboq: 3×3 sliding puzzle of our picture */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, rand, pick, wait } = LW;
  const N = 3;

  /** Paint the default romantic artwork (names, moon, heart) to a data URL. */
  function paintArt(size = 720) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const s = size / 100;
    const sky = g.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, '#1b0b45'); sky.addColorStop(0.55, '#5a1f73'); sky.addColorStop(1, '#ff7aa8');
    g.fillStyle = sky; g.fillRect(0, 0, size, size);
    // stars
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = rand(0.3, 1);
      g.fillStyle = pick(['#fff', '#ffe6f2', '#fff3c9']);
      g.beginPath(); g.arc(rand(0, size), rand(0, size * 0.6), rand(0.4, 1.6) * s * 0.35, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // moon
    const mg = g.createRadialGradient(78 * s, 20 * s, 0, 78 * s, 20 * s, 22 * s);
    mg.addColorStop(0, 'rgba(255,240,220,.55)'); mg.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = mg; g.fillRect(50 * s, 0, 50 * s, 45 * s);
    const moon = document.createElement('canvas');
    moon.width = moon.height = Math.ceil(20 * s);
    const mc = moon.getContext('2d');
    mc.fillStyle = '#fff4dc'; mc.beginPath(); mc.arc(10 * s, 10 * s, 8 * s, 0, 7); mc.fill();
    mc.globalCompositeOperation = 'destination-out';
    mc.beginPath(); mc.arc(6.6 * s, 7.8 * s, 7.4 * s, 0, 7); mc.fill();
    g.save(); g.shadowColor = 'rgba(255,240,210,.9)'; g.shadowBlur = 18; g.drawImage(moon, 68 * s, 10 * s); g.restore();
    // hills
    g.fillStyle = '#2a0f4a';
    g.beginPath(); g.moveTo(0, 78 * s); g.quadraticCurveTo(25 * s, 66 * s, 50 * s, 74 * s); g.quadraticCurveTo(75 * s, 82 * s, 100 * s, 70 * s); g.lineTo(100 * s, 100 * s); g.lineTo(0, 100 * s); g.fill();
    g.fillStyle = '#190731';
    g.beginPath(); g.moveTo(0, 88 * s); g.quadraticCurveTo(30 * s, 80 * s, 60 * s, 88 * s); g.quadraticCurveTo(80 * s, 93 * s, 100 * s, 86 * s); g.lineTo(100 * s, 100 * s); g.lineTo(0, 100 * s); g.fill();
    // big heart glow
    const hg = g.createRadialGradient(50 * s, 46 * s, 0, 50 * s, 46 * s, 36 * s);
    hg.addColorStop(0, 'rgba(255,140,190,.6)'); hg.addColorStop(1, 'rgba(255,140,190,0)');
    g.fillStyle = hg; g.fillRect(0, 0, size, size);
    g.save(); g.shadowColor = '#ff6fa8'; g.shadowBlur = 40 * s * 0.4;
    LW.drawHeart(g, 50 * s, 46 * s, 46 * s, '#ffb0d2', '#ff2f78');
    g.restore();
    // names
    const C = LW.C;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(80,0,40,.6)'; g.shadowBlur = 10;
    let fs = 7.5 * s;
    const text = `${C.herName || ''} & ${C.myName || ''}`.trim();
    g.font = `italic 600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    while (g.measureText(text).width > 40 * s && fs > 3 * s) { fs -= 0.3 * s; g.font = `italic 600 ${fs}px "Cormorant Garamond", Georgia, serif`; }
    g.fillText(text, 50 * s, 45 * s);
    g.shadowBlur = 0;
    g.font = `700 ${2.6 * s}px Manrope, sans-serif`;
    g.fillStyle = 'rgba(255,240,250,.9)';
    g.fillText('L O V E   W O R L D', 50 * s, 94 * s);
    // little floating hearts
    for (let i = 0; i < 9; i++) LW.drawHeart(g, rand(8, 92) * s, rand(58, 86) * s, rand(2.5, 5) * s, '#ffd1e6', '#ff7ab6');
    return c.toDataURL('image/jpeg', 0.9);
  }
  function loadImage(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const img = new Image();
      img.onload = () => {
        const size = 720, c = document.createElement('canvas');
        c.width = c.height = size;
        const m = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext('2d').drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, size, size);
        try { res(c.toDataURL('image/jpeg', 0.9)); } catch (e) { res(src); }
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  LW.registerGame({
    id: 'jumboq',
    title: 'Sehrli jumboq',
    short: 'Bo‘laklarni surib, sehrli rasmni qayta tikla.',
    icon: 'grid',
    colors: ['#7ef0d0', '#25b39b'],
    kind: 'dom',
    rules: `<p>Sehrli rasm 9 bo‘lakka bo‘linib aralashib ketdi. Bo‘sh joy yonidagi bo‘lakni bosib, uni suring.</p>
      <p>Rasmni to‘liq tiklasang, kalit seniki. <span class="muted">Klaviaturada <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> ham ishlaydi.</span></p>`,
    bestLabel: (b) => `${b} yurish`,
    mount(stage, api) {
      const S = { board: [], moves: 0, done: false, ready: false };
      api.debug(S);
      api.stats([
        { id: 'moves', icon: 'refresh', label: 'Yurish', value: '0' },
        { id: 'place', icon: 'grid', label: 'Joyida', value: '0/8' }
      ]);
      stage.innerHTML = `
        <div class="pz">
          <div class="pz-board" id="pzBoard" aria-label="Jumboq taxtasi"><div class="pz-loading">${LW.icon('sparkle')} Rasm chizilmoqda…</div></div>
          <div class="pz-tools">
            <button class="btn btn-ghost btn-sm" id="pzPeek">${LW.icon('eye')}<span>Rasmga qarash</span></button>
            <button class="btn btn-ghost btn-sm" id="pzNums" aria-pressed="true">${LW.icon('grid')}<span>Raqamlar</span></button>
            <button class="btn btn-ghost btn-sm" id="pzShuffle">${LW.icon('refresh')}<span>Aralashtirish</span></button>
          </div>
        </div>`;
      const board = $('#pzBoard', stage);
      let alive = true, img = '';
      const solved = () => S.board.every((v, i) => v === i);
      const placed = () => S.board.filter((v, i) => v === i && v !== N * N - 1).length;
      const empty = () => S.board.indexOf(N * N - 1);
      const neighbors = (i) => {
        const r = Math.floor(i / N), c = i % N, out = [];
        if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N);
        if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1);
        return out;
      };
      function shuffle() {
        S.board = Array.from({ length: N * N }, (_, i) => i);
        let e = N * N - 1, prev = -1;
        for (let k = 0; k < 140 || solved() || placed() > 3; k++) {
          const opts = neighbors(e).filter((x) => x !== prev);
          const t = pick(opts);
          [S.board[e], S.board[t]] = [S.board[t], S.board[e]];
          prev = e; e = t;
          if (k > 400) break;
        }
        S.moves = 0;
        api.stat('moves', 0);
      }
      function layout() {
        $$('.pz-tile', board).forEach((t) => {
          const v = +t.dataset.v, pos = S.board.indexOf(v);
          t.style.setProperty('--x', pos % N);
          t.style.setProperty('--y', Math.floor(pos / N));
          t.classList.toggle('ok', pos === v);
        });
        api.stat('place', `${placed()}/8`);
      }
      function build() {
        board.innerHTML = Array.from({ length: N * N - 1 }, (_, v) =>
          `<button class="pz-tile" data-v="${v}" style="background-image:url('${img}');background-position:${(v % N) * 50}% ${Math.floor(v / N) * 50}%" aria-label="Bo‘lak ${v + 1}"><span class="pz-num">${v + 1}</span></button>`
        ).join('') + `<div class="pz-final" style="background-image:url('${img}')"></div>`;
        $$('.pz-tile', board).forEach((t) => t.addEventListener('click', () => move(S.board.indexOf(+t.dataset.v))));
        layout();
      }
      function move(pos) {
        if (S.done || !S.ready) return;
        const e = empty();
        if (!neighbors(e).includes(pos)) {
          const t = $(`.pz-tile[data-v="${S.board[pos]}"]`, board);
          if (t) { t.classList.remove('nudge'); void t.offsetWidth; t.classList.add('nudge'); }
          return;
        }
        [S.board[e], S.board[pos]] = [S.board[pos], S.board[e]];
        S.moves++;
        api.stat('moves', S.moves);
        LW.audio.sfx('slide');
        layout();
        if (solved()) finish();
      }
      async function finish() {
        S.done = true;
        board.classList.add('solved');
        LW.audio.sfx('magic');
        const r = board.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 60, speed: 420 });
        await wait(1100);
        if (!alive) return;
        const stars = S.moves <= 40 ? 3 : S.moves <= 80 ? 2 : 1;
        const nb = api.best(S.moves, true);
        api.win({ title: 'Rasm tiklandi!', text: `Sen jumboqni <b>${S.moves}</b> yurishda yechding. Har bir bo‘lak o‘z joyini topdi — xuddi men sen bilan topganimdek.`, stars, newBest: nb });
      }
      const onKey = (e) => {
        if (LW.modalOpen() || S.done) return;
        const em = empty(), r = Math.floor(em / N), c = em % N;
        let t = -1;
        if (e.key === 'ArrowUp' && r < N - 1) t = em + N;
        if (e.key === 'ArrowDown' && r > 0) t = em - N;
        if (e.key === 'ArrowLeft' && c < N - 1) t = em + 1;
        if (e.key === 'ArrowRight' && c > 0) t = em - 1;
        if (t >= 0) { e.preventDefault(); move(t); }
      };
      addEventListener('keydown', onKey);
      $('#pzPeek', stage).addEventListener('click', () => {
        board.classList.add('peek');
        LW.audio.sfx('flip');
        setTimeout(() => board.classList.remove('peek'), 1800);
      });
      $('#pzNums', stage).addEventListener('click', (e) => {
        const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on);
        board.classList.toggle('no-nums', !on);
        LW.audio.sfx('tap');
      });
      $('#pzShuffle', stage).addEventListener('click', () => { if (S.done) return; shuffle(); layout(); LW.audio.sfx('whoosh'); });
      // fonts must be ready before painting names onto the art
      const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.all([loadImage(LW.C.puzzleImage), fontsReady]).then(([custom]) => {
        if (!alive) return;
        img = custom || paintArt();
        shuffle();
        build();
        S.ready = true;
      });
      return { destroy() { alive = false; removeEventListener('keydown', onKey); } };
    }
  });
})();
