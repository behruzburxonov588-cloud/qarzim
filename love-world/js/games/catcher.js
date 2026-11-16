/* Game 1 — Yurak ovchisi: catch falling hearts in a magic bowl */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, rand, clamp } = LW;
  const TARGET = 25;

  LW.registerGame({
    id: 'yurak-ovchisi',
    title: 'Yurak ovchisi',
    short: 'Osmondan yog‘ilayotgan yuraklarni sehrli idishga tut.',
    icon: 'bowl',
    colors: ['#ff6fa8', '#ff3d7f'],
    kind: 'canvas',
    rules: `<p>Sehrli idishni barmog‘ing, sichqoncha yoki <kbd>←</kbd> <kbd>→</kbd> tugmalari bilan boshqar.</p>
      <ul class="rules">
        <li><i class="dot pink"></i>Pushti yurak — <b>+1</b></li>
        <li><i class="dot gold"></i>Oltin yurak — <b>+3</b></li>
        <li><i class="dot gray"></i>Siniq yurakdan qoch — u bitta jonni oladi</li>
      </ul>
      <p><b>${TARGET} ochko</b> to‘plasang, kalit seniki!</p>`,
    bestLabel: (b) => `${b} ta jon bilan`,
    mount(stage, api) {
      stage.innerHTML = '<canvas class="gcanvas" aria-label="Yurak ovchisi o‘yin maydoni"></canvas><div class="ghint">' + LW.icon('left') + ' Idishni sur ' + LW.icon('right') + '</div>';
      const cv = $('canvas', stage);
      let { ctx, w, h } = LW.fitCanvas(cv);
      const S = { score: 0, lives: 3, items: [], pops: [], bx: w / 2, btx: w / 2, bw: 0, by: 0, t: 0, spawn: 0.8, shake: 0, flash: 0, kl: false, kr: false, over: false, streak: 0 };
      const layout = () => { S.bw = clamp(w * 0.2, 86, 140); S.by = h - 52; S.bx = clamp(S.bx, S.bw / 2, w - S.bw / 2); S.btx = S.bx; };
      layout();
      const livesHtml = () => Array.from({ length: 3 }, (_, i) => `<i class="life ${i < S.lives ? 'on' : ''}"></i>`).join('');
      api.stats([
        { id: 'score', icon: 'heart', label: 'Ochko', value: `0/${TARGET}` },
        { id: 'lives', icon: 'sparkle', label: 'Jon', value: livesHtml() }
      ]);
      api.debug(S);

      const toScreen = (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + x, r.top + y]; };
      const spawn = () => {
        const r = Math.random();
        const type = r < 0.11 ? 'gold' : r < 0.32 ? 'broken' : 'heart';
        const s = type === 'gold' ? 32 : rand(28, 38);
        S.items.push({ type, x: rand(s, w - s), y: -s, s, vy: rand(125, 185) * (1 + S.score / 42), amp: rand(10, 40), sw: rand(1, 2.4), ph: rand(0, 6.28), rot: rand(-0.3, 0.3) });
      };
      const setX = (e) => { const r = cv.getBoundingClientRect(); S.btx = clamp(e.clientX - r.left, S.bw / 2, w - S.bw / 2); hideHint(); };
      let hinted = false;
      const hideHint = () => { if (!hinted) { hinted = true; const g = $('.ghint', stage); g && g.classList.add('gone'); } };
      cv.addEventListener('pointermove', setX);
      cv.addEventListener('pointerdown', (e) => { setX(e); cv.setPointerCapture && cv.setPointerCapture(e.pointerId); });
      const kd = (e) => {
        if (['ArrowLeft', 'a', 'A'].includes(e.key)) { S.kl = true; hideHint(); e.preventDefault(); }
        if (['ArrowRight', 'd', 'D'].includes(e.key)) { S.kr = true; hideHint(); e.preventDefault(); }
      };
      const ku = (e) => {
        if (['ArrowLeft', 'a', 'A'].includes(e.key)) S.kl = false;
        if (['ArrowRight', 'd', 'D'].includes(e.key)) S.kr = false;
      };
      addEventListener('keydown', kd);
      addEventListener('keyup', ku);
      const onResize = () => { ({ ctx, w, h } = LW.fitCanvas(cv)); layout(); };
      addEventListener('resize', onResize);

      function catchItem(it) {
        const [sx, sy] = toScreen(it.x, S.by - 8);
        if (it.type === 'broken') {
          S.lives--; S.shake = 0.45; S.flash = 0.5; S.streak = 0;
          LW.audio.sfx('bad');
          LW.fx.burst(sx, sy, { count: 14, colors: ['#9a8fb0', '#5a5070', '#c9c0dd'], shapes: ['spark'], speed: 200 });
          S.pops.push({ x: it.x, y: S.by - 30, txt: '−1 jon', c: '#c9c0dd', t: 0 });
          api.stat('lives', livesHtml());
          if (S.lives <= 0) {
            S.over = true;
            api.lose({ title: 'Yuraklar qochib ketdi…', text: `Sen <b>${S.score}</b> ochko to‘plading. Siniq yuraklardan ehtiyot bo‘l — yana bir bor urinib ko‘r!` });
          }
          return;
        }
        const pts = it.type === 'gold' ? 3 : 1;
        S.score += pts; S.streak++;
        LW.audio.sfx(it.type === 'gold' ? 'gold' : 'pop', Math.min(12, S.streak));
        LW.fx.burst(sx, sy, { count: it.type === 'gold' ? 22 : 9, colors: it.type === 'gold' ? ['#ffd27a', '#fff2c4', '#fff'] : ['#ff7ab6', '#ffb3d1', '#fff'], shapes: ['heart', 'spark'], speed: 220, up: 140 });
        S.pops.push({ x: it.x, y: S.by - 30, txt: '+' + pts, c: it.type === 'gold' ? '#ffd27a' : '#ffb3d1', t: 0 });
        api.stat('score', `${Math.min(S.score, TARGET)}/${TARGET}`);
        if (S.score >= TARGET) {
          S.over = true;
          const nb = api.best(S.lives);
          api.win({ title: 'Yuraklar ovchisi!', text: `Sen <b>${TARGET}</b> ta yurakni tutding — xuddi mening yuragimni tutganingdek.`, stars: S.lives, newBest: nb });
        }
      }

      function drawBowl() {
        const x = S.bx + (S.shake > 0 ? Math.sin(S.t * 60) * 7 * S.shake : 0), y = S.by, bw = S.bw;
        ctx.save();
        ctx.translate(x, y);
        const glow = ctx.createRadialGradient(0, 4, 4, 0, 4, bw * 0.9);
        glow.addColorStop(0, 'rgba(255,120,190,.45)');
        glow.addColorStop(1, 'rgba(255,120,190,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(0, 6, bw * 0.9, 40, 0, 0, 7); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-bw / 2, -8);
        ctx.bezierCurveTo(-bw / 2, 22, -bw * 0.22, 28, 0, 28);
        ctx.bezierCurveTo(bw * 0.22, 28, bw / 2, 22, bw / 2, -8);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -8, 0, 28);
        g.addColorStop(0, 'rgba(255,255,255,.28)');
        g.addColorStop(1, 'rgba(255,90,160,.55)');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -8, bw / 2, 7, 0, 0, 7);
        ctx.fillStyle = 'rgba(40,10,50,.55)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,245,.95)'; ctx.lineWidth = 2; ctx.stroke();
        LW.drawHeart(ctx, 0, 12, 16, '#fff', '#ffd2e6');
        ctx.restore();
      }
      function drawItem(it) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot + Math.sin(S.t * 2 + it.ph) * 0.12);
        if (it.type === 'gold') {
          LW.drawHeart(ctx, 0, 0, it.s, '#fff4c2', '#ffae3d', 22);
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          const k = 0.5 + 0.5 * Math.sin(S.t * 8 + it.ph);
          LW.starPath(ctx, it.s * 0.32, -it.s * 0.32, 3 + k * 3, 0.4, 4); ctx.fill();
        } else if (it.type === 'broken') {
          ctx.globalAlpha = 0.95;
          LW.drawHeart(ctx, 0, 0, it.s, '#b3a8c9', '#5f5578', 4);
          ctx.strokeStyle = '#2a2140'; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(-1, -it.s * 0.3); ctx.lineTo(-it.s * 0.1, -it.s * 0.08); ctx.lineTo(it.s * 0.08, it.s * 0.06); ctx.lineTo(-it.s * 0.04, it.s * 0.36); ctx.stroke();
        } else {
          LW.drawHeart(ctx, 0, 0, it.s, '#ff9ccb', '#ff2f78', 14);
        }
        ctx.restore();
      }

      let raf, last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.04, (now - last) / 1000);
        last = now;
        S.t += dt;
        if (!S.over) {
          S.spawn -= dt;
          if (S.spawn <= 0) { spawn(); S.spawn = rand(0.42, 0.82) / (1 + S.score / 55); }
          if (S.kl) S.btx -= 620 * dt;
          if (S.kr) S.btx += 620 * dt;
          S.btx = clamp(S.btx, S.bw / 2, w - S.bw / 2);
        }
        S.bx += (S.btx - S.bx) * Math.min(1, dt * 16);
        S.shake = Math.max(0, S.shake - dt);
        S.flash = Math.max(0, S.flash - dt);
        for (let i = S.items.length - 1; i >= 0; i--) {
          const it = S.items[i];
          it.y += it.vy * dt;
          it.x += Math.cos(S.t * it.sw + it.ph) * it.amp * dt;
          if (!S.over && it.y + it.s * 0.35 >= S.by - 12 && it.y - it.s * 0.3 <= S.by + 16 && Math.abs(it.x - S.bx) < S.bw / 2 + it.s * 0.15) {
            S.items.splice(i, 1);
            catchItem(it);
            continue;
          }
          if (it.y > h + 40) { S.items.splice(i, 1); if (it.type !== 'broken') S.streak = 0; }
        }
        ctx.clearRect(0, 0, w, h);
        if (S.flash > 0) { ctx.fillStyle = `rgba(120,80,160,${S.flash * 0.35})`; ctx.fillRect(0, 0, w, h); }
        // ground line glow
        const gl = ctx.createLinearGradient(0, 0, w, 0);
        gl.addColorStop(0, 'rgba(255,150,210,0)'); gl.addColorStop(0.5, 'rgba(255,150,210,.35)'); gl.addColorStop(1, 'rgba(255,150,210,0)');
        ctx.fillStyle = gl; ctx.fillRect(0, h - 14, w, 1.5);
        S.items.forEach(drawItem);
        drawBowl();
        S.pops = S.pops.filter((p) => (p.t += dt) < 0.9);
        ctx.font = '700 18px Manrope, sans-serif';
        ctx.textAlign = 'center';
        for (const p of S.pops) {
          ctx.globalAlpha = 1 - p.t / 0.9;
          ctx.fillStyle = p.c;
          ctx.fillText(p.txt, p.x, p.y - p.t * 50);
        }
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return {
        destroy() {
          cancelAnimationFrame(raf);
          removeEventListener('keydown', kd);
          removeEventListener('keyup', ku);
          removeEventListener('resize', onResize);
        }
      };
    }
  });
})();
