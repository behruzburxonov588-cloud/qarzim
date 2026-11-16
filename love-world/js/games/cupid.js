/* Game 7 — Kupidon o‘qi: aim the bow, hit the flying hearts */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, rand, clamp } = LW;
  const TARGET = 12, TIME = 45;

  LW.registerGame({
    id: 'kupidon',
    title: 'Kupidon o‘qi',
    short: 'Kamonni nishonga ol va uchib yurgan yuraklarni ur.',
    icon: 'arrow',
    colors: ['#ff8fc4', '#c86dd7'],
    kind: 'canvas',
    rules: `<p>Sen — Kupidonsan! Barmog‘ing yoki sichqoncha bilan nishonga ol va qo‘yib yubor (bos) — o‘q uchadi.</p>
      <ul class="rules">
        <li><i class="dot pink"></i>Qanotli yurak — <b>+1</b></li>
        <li><i class="dot gold"></i>Oltin yurak — <b>+2</b> (u tezroq uchadi)</li>
      </ul>
      <p><b>${TIME} soniya</b> ichida <b>${TARGET} ochko</b> to‘pla. <span class="muted">Klaviatura: <kbd>←</kbd><kbd>→</kbd> nishon, <kbd>Probel</kbd> otish.</span></p>`,
    bestLabel: (b) => `${b} soniya qoldi`,
    mount(stage, api) {
      stage.innerHTML = '<canvas class="gcanvas" aria-label="Kupidon o‘qi o‘yin maydoni"></canvas><div class="ghint">' + LW.icon('target') + ' Nishonga ol va bos</div>';
      const cv = $('canvas', stage);
      let { ctx, w, h } = LW.fitCanvas(cv);
      const S = { score: 0, time: TIME, hearts: [], arrows: [], pops: [], aim: -Math.PI / 2, cd: 0, spawn: 0.3, t: 0, over: false, bx: 0, by: 0, shots: 0, hits: 0 };
      const layout = () => { S.bx = w / 2; S.by = h - 46; };
      layout();
      api.stats([
        { id: 'score', icon: 'heart', label: 'Ochko', value: `0/${TARGET}` },
        { id: 'time', icon: 'clock', label: 'Vaqt', value: `${TIME}` }
      ]);
      api.debug(S);
      const speed = () => clamp(h * 1.55, 720, 1150);
      const G = 320;
      const toScreen = (x, y) => { const r = cv.getBoundingClientRect(); return [r.left + x, r.top + y]; };
      let hinted = false;
      const hideHint = () => { if (!hinted) { hinted = true; const g = $('.ghint', stage); g && g.classList.add('gone'); } };
      const aimAt = (e) => {
        const r = cv.getBoundingClientRect();
        const a = Math.atan2(e.clientY - r.top - S.by, e.clientX - r.left - S.bx);
        S.aim = clamp(a > Math.PI / 2 ? -Math.PI + 0.12 : a > 0 ? -0.12 : a, -Math.PI + 0.12, -0.12);
      };
      const shoot = () => {
        if (S.over || S.cd > 0) return;
        S.cd = 0.3;
        S.shots++;
        const v = speed();
        S.arrows.push({ x: S.bx + Math.cos(S.aim) * 30, y: S.by + Math.sin(S.aim) * 30, vx: Math.cos(S.aim) * v, vy: Math.sin(S.aim) * v });
        LW.audio.sfx('shoot');
        hideHint();
      };
      cv.addEventListener('pointermove', aimAt);
      cv.addEventListener('pointerdown', (e) => {
        aimAt(e);
        if (e.pointerType === 'mouse') shoot();
        else cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { aimAt(e); shoot(); } });
      const keys = {};
      const kd = (e) => {
        if (LW.modalOpen()) return;
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { keys[e.key] = true; e.preventDefault(); hideHint(); }
        if ([' ', 'Enter', 'ArrowUp'].includes(e.key)) { e.preventDefault(); shoot(); }
      };
      const ku = (e) => { keys[e.key] = false; };
      addEventListener('keydown', kd);
      addEventListener('keyup', ku);
      const onResize = () => { ({ ctx, w, h } = LW.fitCanvas(cv)); layout(); };
      addEventListener('resize', onResize);

      const spawn = () => {
        const gold = Math.random() < 0.16;
        const left = Math.random() < 0.5;
        const s = gold ? 28 : rand(34, 46);
        const v = (gold ? rand(150, 200) : rand(70, 140)) * clamp(w / 700, 0.75, 1.3);
        S.hearts.push({ gold, s, x: left ? -s : w + s, y: rand(h * 0.08, h * 0.58), vx: left ? v : -v, amp: rand(8, 22), ph: rand(0, 6.28), fl: rand(6, 10) });
      };
      function hit(hh, a) {
        const pts = hh.gold ? 2 : 1;
        S.score += pts; S.hits++;
        const [sx, sy] = toScreen(hh.x, hh.y);
        LW.audio.sfx(hh.gold ? 'gold' : 'pop', S.score % 12);
        LW.fx.burst(sx, sy, { count: hh.gold ? 26 : 16, colors: hh.gold ? ['#ffd27a', '#fff2c4', '#fff'] : ['#ff7ab6', '#ffb3d1', '#fff', '#c79bff'], speed: 260 });
        S.pops.push({ x: hh.x, y: hh.y, txt: '+' + pts, c: hh.gold ? '#ffd27a' : '#ffd1e6', t: 0 });
        api.stat('score', `${Math.min(S.score, TARGET)}/${TARGET}`);
        if (S.score >= TARGET && !S.over) {
          S.over = true;
          const left = Math.ceil(S.time);
          const acc = Math.round((S.hits / Math.max(1, S.shots)) * 100);
          const nb = api.best(left);
          api.win({ title: 'Kupidonning o‘zi!', text: `Sen <b>${TARGET}</b> ochkoni <b>${left}</b> soniya qolganida to‘plading. Aniqlik: <b>${acc}%</b>. Mening yuragimga ham aynan shunday tekkansan.`, stars: left >= 18 ? 3 : left >= 8 ? 2 : 1, newBest: nb });
        }
      }
      function drawBow() {
        const pull = S.cd > 0.18 ? 0 : 1 - S.cd / 0.18 * 0;
        ctx.save();
        ctx.translate(S.bx, S.by);
        // base glow
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 70);
        g.addColorStop(0, 'rgba(255,170,220,.35)'); g.addColorStop(1, 'rgba(255,170,220,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.fill();
        // trajectory preview
        if (!S.over) {
          const v = speed();
          ctx.fillStyle = 'rgba(255,240,250,.55)';
          for (let t = 0.06; t < 0.55; t += 0.05) {
            const x = Math.cos(S.aim) * v * t, y = Math.sin(S.aim) * v * t + 0.5 * G * t * t;
            ctx.globalAlpha = 0.65 - t;
            ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        ctx.rotate(S.aim + Math.PI / 2);
        // bow limbs
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(-34, 10); ctx.quadraticCurveTo(-30, -22, 0, -26); ctx.quadraticCurveTo(30, -22, 34, 10); ctx.stroke();
        ctx.shadowBlur = 0;
        // string
        const sy = S.cd > 0 ? 10 : 18 * pull;
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-34, 10); ctx.lineTo(0, sy); ctx.lineTo(34, 10); ctx.stroke();
        // nocked arrow
        if (S.cd <= 0 && !S.over) drawArrowShape(0, sy - 20, -Math.PI / 2, 1);
        // heart gem
        LW.drawHeart(ctx, 0, -26, 14, '#fff', '#ff7ab6');
        ctx.restore();
      }
      function drawArrowShape(x, y, ang, alpha) {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffe6a8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(12, 0); ctx.stroke();
        ctx.strokeStyle = '#ffb3d1'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-32, -6); ctx.moveTo(-26, 0); ctx.lineTo(-32, 6); ctx.moveTo(-20, 0); ctx.lineTo(-26, -6); ctx.moveTo(-20, 0); ctx.lineTo(-26, 6); ctx.stroke();
        ctx.rotate(Math.PI / 2);
        LW.drawHeart(ctx, 0, -16, 12, '#ff9ccb', '#ff2f78');
        ctx.restore();
      }
      function drawTarget(hh) {
        const flap = Math.sin(S.t * hh.fl + hh.ph);
        ctx.save();
        ctx.translate(hh.x, hh.y);
        // wings
        ctx.fillStyle = hh.gold ? 'rgba(255,240,200,.85)' : 'rgba(255,255,255,.8)';
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.scale(side, 1);
          ctx.rotate(-0.3 - flap * 0.35);
          ctx.beginPath(); ctx.ellipse(hh.s * 0.52, -hh.s * 0.12, hh.s * 0.34, hh.s * 0.16, -0.4, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.ellipse(hh.s * 0.44, hh.s * 0.04, hh.s * 0.24, hh.s * 0.11, -0.1, 0, 7); ctx.fill();
          ctx.restore();
        }
        if (hh.gold) LW.drawHeart(ctx, 0, 0, hh.s, '#fff4c2', '#ffae3d', 20);
        else LW.drawHeart(ctx, 0, 0, hh.s, '#ff9ccb', '#ff2f78', 12);
        ctx.restore();
      }

      let raf, last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.04, (now - last) / 1000);
        last = now;
        S.t += dt;
        if (!S.over) {
          S.time -= dt;
          api.stat('time', `${Math.max(0, Math.ceil(S.time))}`);
          if (S.time <= 0) {
            S.over = true;
            api.lose({ title: 'Vaqt tugadi!', text: `Sen <b>${S.score}</b> ochko to‘plading — kalit uchun <b>${TARGET}</b> kerak. Kupidon ham birinchi urinishda nishonga tegmagan, yana bir bor!` });
          }
          S.spawn -= dt;
          if (S.spawn <= 0 && S.hearts.length < 6) { spawn(); S.spawn = rand(0.55, 1.15); }
          if (keys.ArrowLeft) S.aim = clamp(S.aim - 1.8 * dt, -Math.PI + 0.12, -0.12);
          if (keys.ArrowRight) S.aim = clamp(S.aim + 1.8 * dt, -Math.PI + 0.12, -0.12);
        }
        S.cd = Math.max(0, S.cd - dt);
        for (let i = S.hearts.length - 1; i >= 0; i--) {
          const hh = S.hearts[i];
          hh.x += hh.vx * dt;
          hh.y += Math.cos(S.t * 2 + hh.ph) * hh.amp * dt;
          if ((hh.vx > 0 && hh.x > w + hh.s * 2) || (hh.vx < 0 && hh.x < -hh.s * 2)) S.hearts.splice(i, 1);
        }
        for (let i = S.arrows.length - 1; i >= 0; i--) {
          const a = S.arrows[i];
          a.vy += G * dt;
          a.x += a.vx * dt; a.y += a.vy * dt;
          let gone = a.x < -60 || a.x > w + 60 || a.y < -80 || a.y > h + 40;
          if (!gone && !S.over) {
            const ang = Math.atan2(a.vy, a.vx);
            const tx = a.x + Math.cos(ang) * 14, ty = a.y + Math.sin(ang) * 14;
            for (let j = S.hearts.length - 1; j >= 0; j--) {
              const hh = S.hearts[j];
              if (Math.hypot(tx - hh.x, ty - hh.y) < hh.s * 0.5) { S.hearts.splice(j, 1); hit(hh, a); gone = true; break; }
            }
          }
          if (gone) S.arrows.splice(i, 1);
        }
        ctx.clearRect(0, 0, w, h);
        S.hearts.forEach(drawTarget);
        for (const a of S.arrows) drawArrowShape(a.x, a.y, Math.atan2(a.vy, a.vx), 1);
        drawBow();
        S.pops = S.pops.filter((p) => (p.t += dt) < 0.9);
        ctx.font = '700 20px Manrope, sans-serif';
        ctx.textAlign = 'center';
        for (const p of S.pops) { ctx.globalAlpha = 1 - p.t / 0.9; ctx.fillStyle = p.c; ctx.fillText(p.txt, p.x, p.y - 20 - p.t * 50); }
        ctx.globalAlpha = 1;
        if (!S.over && S.time < 10) {
          ctx.fillStyle = `rgba(255,120,160,${0.06 + 0.06 * Math.sin(S.t * 8)})`;
          ctx.fillRect(0, 0, w, h);
        }
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
