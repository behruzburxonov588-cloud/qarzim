/* Game 4 — Yulduzlar turkumi: connect the stars to draw our constellations */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, rand, randi, wait } = LW;

  const SHAPES = [
    {
      name: 'Yurak turkumi',
      line: 'Ikki yurak bitta osmonda.',
      pts: () => Array.from({ length: 12 }, (_, k) => {
        const t = (k / 12) * Math.PI * 2;
        return [50 + 16 * Math.pow(Math.sin(t), 3) * 2.35, 50 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 2.3];
      })
    },
    {
      name: 'Orzu yulduzi',
      line: 'Har bir orzuim seni yetaklaydi.',
      pts: () => Array.from({ length: 10 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 17 : 41;
        return [50 + Math.cos(a) * r, 55 + Math.sin(a) * r];
      })
    },
    {
      name: 'Abadiyat turkumi',
      line: 'Bizning sevgimizning oxiri yo‘q.',
      pts: () => Array.from({ length: 12 }, (_, k) => {
        const t = ((15 + k * 30) * Math.PI) / 180, d = 1 + Math.sin(t) * Math.sin(t);
        return [50 + (43 * Math.cos(t)) / d, 50 + (58 * Math.sin(t) * Math.cos(t)) / d];
      })
    }
  ];

  LW.registerGame({
    id: 'yulduzlar',
    title: 'Yulduzlar turkumi',
    short: 'Yulduzlarni ulab, osmonga bizning ramzlarimizni chiz.',
    icon: 'constellation',
    colors: ['#7ec8ff', '#5b6cff'],
    kind: 'dom',
    rules: `<p>Tungi osmonda raqamli yulduzlar bor. Ularni <b>1 dan boshlab tartib bilan</b> bos — yulduzlar nur bilan ulanadi.</p>
      <p>Uchta sehrli turkumni chizib tugatsang, kalit seniki. Kamroq xato — ko‘proq yulduz!</p>`,
    bestLabel: (b) => `${b} ta xato`,
    mount(stage, api) {
      const S = { level: 0, next: 1, mistakes: 0, busy: false, order: [], done: false };
      api.debug(S);
      api.stats([
        { id: 'lvl', icon: 'constellation', label: 'Turkum', value: `1/${SHAPES.length}` },
        { id: 'miss', icon: 'sparkle', label: 'Xato', value: '0' }
      ]);
      const bg = Array.from({ length: 46 }, () => `<circle cx="${rand(2, 98).toFixed(1)}" cy="${rand(2, 98).toFixed(1)}" r="${rand(0.15, 0.55).toFixed(2)}" style="--d:${rand(0, 4).toFixed(2)}s"/>`).join('');
      stage.innerHTML = `
        <div class="cst">
          <div class="cst-head"><p class="eyebrow" id="cstLvl"></p><h3 class="cst-name" id="cstName">?</h3></div>
          <div class="cst-frame">
            <svg class="cst-sky" viewBox="0 0 100 100" role="img" aria-label="Yulduzlar osmoni">
              <defs>
                <radialGradient id="cHalo"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#bfe3ff" stop-opacity=".5"/><stop offset="1" stop-color="#7ec8ff" stop-opacity="0"/></radialGradient>
                <linearGradient id="cFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9fc8" stop-opacity=".55"/><stop offset="1" stop-color="#7c5cff" stop-opacity=".35"/></linearGradient>
                <filter id="cGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <g class="cst-bg">${bg}</g>
              <path class="cst-fill" d=""/>
              <g class="cst-lines" filter="url(#cGlow)"></g>
              <g class="cst-stars"></g>
            </svg>
          </div>
          <p class="cst-tip" id="cstTip">${LW.icon('sparkle')} 1-yulduzdan boshla</p>
        </div>`;
      const svg = $('.cst-sky', stage), lines = $('.cst-lines', svg), starsG = $('.cst-stars', svg), fill = $('.cst-fill', svg);
      let pts = [];
      const NS = 'http://www.w3.org/2000/svg';

      function load() {
        const sh = SHAPES[S.level];
        const raw = sh.pts();
        const start = randi(0, raw.length - 1), dir = Math.random() < 0.5 ? 1 : -1;
        pts = raw.map((_, k) => raw[(start + dir * k + raw.length * 2) % raw.length]);
        S.next = 1;
        S.order = pts;
        lines.innerHTML = '';
        fill.setAttribute('d', 'M' + pts.map((p) => p.map((v) => v.toFixed(2)).join(' ')).join(' L') + ' Z');
        fill.classList.remove('show');
        svg.classList.remove('complete');
        $('#cstLvl', stage).textContent = `Turkum ${S.level + 1} / ${SHAPES.length}`;
        $('#cstName', stage).textContent = '? ? ?';
        $('#cstName', stage).classList.remove('reveal');
        api.stat('lvl', `${S.level + 1}/${SHAPES.length}`);
        // shuffle number labels around each star a bit so it reads naturally
        starsG.innerHTML = pts.map((p, k) => {
          const ang = Math.atan2(p[1] - 50, p[0] - 50);
          const lx = Math.cos(ang) * 4.6, ly = Math.sin(ang) * 4.6 + 1.2;
          return `<g class="cs" data-n="${k + 1}" transform="translate(${p[0].toFixed(2)} ${p[1].toFixed(2)})" style="--i:${k}" role="button" aria-label="Yulduz ${k + 1}" tabindex="0">
            <circle class="hit" r="5.6"/><circle class="halo" r="3.6"/><circle class="core" r="1.25"/>
            <text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}">${k + 1}</text></g>`;
        }).join('');
        $$('.cs', starsG).forEach((g) => {
          g.addEventListener('click', () => tap(g));
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(g); } });
        });
        markNext();
      }
      function markNext() {
        $$('.cs', starsG).forEach((g) => g.classList.toggle('next', +g.dataset.n === S.next && S.level === 0));
      }
      function addLine(a, b, cls = '') {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]);
        l.setAttribute('pathLength', '1');
        l.setAttribute('class', 'cl ' + cls);
        lines.appendChild(l);
      }
      async function tap(g) {
        if (S.busy || S.done) return;
        const n = +g.dataset.n;
        if (g.classList.contains('on')) return;
        if (n !== S.next) {
          S.mistakes++;
          api.stat('miss', S.mistakes);
          LW.audio.sfx('wrong');
          g.classList.remove('bad'); void g.getBBox(); g.classList.add('bad');
          setTimeout(() => g.classList.remove('bad'), 600);
          $('#cstTip', stage).innerHTML = `${LW.icon('sparkle')} Hozir <b>${S.next}</b>-yulduz navbatda`;
          return;
        }
        g.classList.add('on');
        LW.audio.sfx('note', n - 1);
        const r = g.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 8, speed: 120, g: 0, shapes: ['spark', 'star'], colors: ['#bfe3ff', '#fff', '#ffd27a'] });
        if (n > 1) addLine(pts[n - 2], pts[n - 1]);
        S.next++;
        markNext();
        $('#cstTip', stage).innerHTML = S.next <= pts.length ? `${LW.icon('sparkle')} Endi <b>${S.next}</b>-yulduz` : '';
        if (n === pts.length) {
          S.busy = true;
          await wait(350);
          addLine(pts[pts.length - 1], pts[0], 'close');
          await wait(500);
          fill.classList.add('show');
          svg.classList.add('complete');
          LW.audio.sfx('magic');
          const name = $('#cstName', stage);
          name.textContent = SHAPES[S.level].name;
          name.classList.add('reveal');
          $('#cstTip', stage).innerHTML = `${LW.icon('heart')} <i>${SHAPES[S.level].line}</i>`;
          const rr = svg.getBoundingClientRect();
          LW.fx.burst(rr.left + rr.width / 2, rr.top + rr.height / 2, { count: 40, speed: 380 });
          await wait(LW.reduced() ? 900 : 2200);
          if (!api.alive()) return;
          S.level++;
          S.busy = false;
          if (S.level >= SHAPES.length) {
            S.done = true;
            const stars = S.mistakes <= 1 ? 3 : S.mistakes <= 4 ? 2 : 1;
            const nb = api.best(S.mistakes, true);
            api.win({ title: 'Osmon bizniki!', text: `Sen uchta sehrli turkumni chizding${S.mistakes ? ` (<b>${S.mistakes}</b> ta xato bilan)` : ' — birorta ham xatosiz'}! Endi har gal osmonga qaraganingda, bizni eslaysan.`, stars, newBest: nb });
          } else load();
        }
      }
      load();
      return { destroy() {} };
    }
  });
})();
