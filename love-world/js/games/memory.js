/* Game 2 — Xotira juftliklari: flip cards, find the 8 magical pairs */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, shuffle, wait } = LW;
  const PAIRS = [
    ['heart', '#ff6fa8', '#ff3d7f'],
    ['star', '#ffd27a', '#ff9f43'],
    ['moon', '#9ab8ff', '#5b6cff'],
    ['key', '#ffe29a', '#e39b2d'],
    ['ring', '#ffb3e6', '#c86dd7'],
    ['envelope', '#ff9a8b', '#ff5f6d'],
    ['music', '#7ef0d0', '#25b39b'],
    ['infinity', '#c79bff', '#7c5cff']
  ];

  LW.registerGame({
    id: 'juftliklar',
    title: 'Xotira juftliklari',
    short: 'Sehrli kartalarni ochib, sakkizta juftlikni top.',
    icon: 'cards',
    colors: ['#b79bff', '#7c5cff'],
    kind: 'dom',
    rules: `<p>Kartani bosib och. Bir xil belgili ikki kartani topsang, ular ochiq qoladi.</p>
      <p>Barcha <b>8 juftlikni</b> topib, kalitni qo‘lga kirit. Kamroq yurish — ko‘proq yulduz!</p>`,
    bestLabel: (b) => `${b} yurish`,
    mount(stage, api) {
      const deck = shuffle(PAIRS.flatMap(([icon, c1, c2], pair) => [{ icon, c1, c2, pair }, { icon, c1, c2, pair }]));
      stage.innerHTML = `<div class="mm-board" role="grid" aria-label="Xotira kartalari">
        ${deck.map((c, i) => `
          <button class="mm-card" data-i="${i}" data-pair="${c.pair}" style="--c1:${c.c1};--c2:${c.c2};--i:${i}" aria-label="Yopiq karta ${i + 1}">
            <span class="mm-inner">
              <span class="mm-face mm-back"><span class="mm-mono">${LW.icon('heart')}</span></span>
              <span class="mm-face mm-front">${LW.icon(c.icon)}</span>
            </span>
          </button>`).join('')}
      </div>`;
      const S = { moves: 0, found: 0, open: [], lock: false, t0: 0, timer: null, done: false };
      api.debug(S);
      api.stats([
        { id: 'pairs', icon: 'cards', label: 'Juftlik', value: '0/8' },
        { id: 'moves', icon: 'refresh', label: 'Yurish', value: '0' },
        { id: 'time', icon: 'clock', label: 'Vaqt', value: '0:00' }
      ]);
      const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const startTimer = () => {
        if (S.timer) return;
        S.t0 = Date.now();
        S.timer = setInterval(() => api.stat('time', fmt(Math.floor((Date.now() - S.t0) / 1000))), 500);
      };
      const cards = $$('.mm-card', stage);
      cards.forEach((card) => card.addEventListener('click', async () => {
        if (S.lock || S.done || card.classList.contains('open') || card.classList.contains('matched')) return;
        startTimer();
        card.classList.add('open');
        card.setAttribute('aria-label', 'Ochiq karta');
        LW.audio.sfx('flip');
        S.open.push(card);
        if (S.open.length < 2) return;
        S.moves++;
        api.stat('moves', S.moves);
        const [a, b] = S.open;
        S.open = [];
        if (a.dataset.pair === b.dataset.pair) {
          S.found++;
          api.stat('pairs', `${S.found}/8`);
          await wait(260);
          a.classList.add('matched'); b.classList.add('matched');
          LW.audio.sfx('correct');
          [a, b].forEach((c) => { const r = c.getBoundingClientRect(); LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 10, speed: 180, colors: [getComputedStyle(c).getPropertyValue('--c1').trim() || '#ff7ab6', '#fff'] }); });
          if (S.found === 8) {
            S.done = true;
            clearInterval(S.timer);
            const secs = Math.floor((Date.now() - S.t0) / 1000);
            const stars = S.moves <= 12 ? 3 : S.moves <= 18 ? 2 : 1;
            const nb = api.best(S.moves, true);
            await wait(500);
            cards.forEach((c, i) => setTimeout(() => c.classList.add('celebrate'), i * 40));
            api.win({ title: 'Xotirang ajoyib!', text: `Sen barcha juftliklarni <b>${S.moves}</b> yurishda va <b>${fmt(secs)}</b> daqiqada topding. Biz ham shunday — bir-birimizning juftimiz.`, stars, newBest: nb });
          }
        } else {
          S.lock = true;
          await wait(780);
          a.classList.add('nomatch'); b.classList.add('nomatch');
          LW.audio.sfx('slide');
          await wait(260);
          [a, b].forEach((c) => { c.classList.remove('open', 'nomatch'); c.setAttribute('aria-label', 'Yopiq karta'); });
          S.lock = false;
        }
      }));
      return { destroy() { clearInterval(S.timer); } };
    }
  });
})();
