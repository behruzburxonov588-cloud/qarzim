/* LOVE WORLD — Secret password adventure: 3 riddle gates → lantern key hunt → padlock */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc, wait, rand, clamp } = LW;

  const GARDEN_SVG = `
  <svg class="garden" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241052"/><stop offset=".6" stop-color="#4b1d6e"/><stop offset="1" stop-color="#7a2f6b"/></linearGradient>
      <linearGradient id="gHill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a7a"/><stop offset="1" stop-color="#1c1240"/></linearGradient>
      <linearGradient id="gGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f6a62"/><stop offset="1" stop-color="#0e2f3a"/></linearGradient>
      <radialGradient id="gLamp"><stop offset="0" stop-color="#fff2c4"/><stop offset=".4" stop-color="#ffc56b" stop-opacity=".8"/><stop offset="1" stop-color="#ff9d4d" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="800" height="500" fill="url(#gSky)"/>
    <circle cx="640" cy="90" r="44" fill="#fff1d6"/><circle cx="624" cy="80" r="44" fill="#3a1a66" opacity=".9"/>
    <g fill="#fff" opacity=".8"><circle cx="90" cy="60" r="1.6"/><circle cx="210" cy="110" r="1.2"/><circle cx="330" cy="40" r="1.8"/><circle cx="460" cy="90" r="1.3"/><circle cx="520" cy="30" r="1.5"/><circle cx="740" cy="170" r="1.2"/><circle cx="40" cy="170" r="1.3"/></g>
    <path d="M0 300 Q120 220 260 270 T520 250 T800 270 V500 H0z" fill="url(#gHill)"/>
    <path d="M0 360 Q160 320 330 350 T660 340 T800 350 V500 H0z" fill="url(#gGrass)"/>
    <path d="M330 500 Q370 420 400 360 Q430 420 470 500z" fill="#c9a3d9" opacity=".35"/>
    <g fill="#163e47"><circle cx="90" cy="250" r="60"/><circle cx="140" cy="215" r="52"/><circle cx="50" cy="210" r="44"/><rect x="92" y="270" width="16" height="100" fill="#2a1a2e"/></g>
    <g fill="#174a4e"><circle cx="700" cy="245" r="58"/><circle cx="660" cy="210" r="46"/><circle cx="745" cy="200" r="40"/><rect x="694" y="270" width="16" height="100" fill="#2a1a2e"/></g>
    <path d="M330 365 V250 Q400 170 470 250 V365" fill="none" stroke="#e9b8ff" stroke-width="10" opacity=".75"/>
    <path d="M345 365 V256 Q400 192 455 256 V365" fill="none" stroke="#ff9fd0" stroke-width="3" stroke-dasharray="6 9" opacity=".8"/>
    <g fill="#ff7ab6"><circle cx="338" cy="290" r="7"/><circle cx="352" cy="232" r="6"/><circle cx="400" cy="205" r="7"/><circle cx="448" cy="232" r="6"/><circle cx="462" cy="290" r="7"/></g>
    <g fill="#2a7a6a"><ellipse cx="230" cy="380" rx="70" ry="34"/><ellipse cx="570" cy="385" rx="80" ry="36"/><ellipse cx="60" cy="420" rx="90" ry="40"/><ellipse cx="760" cy="430" rx="80" ry="40"/></g>
    <g><circle cx="200" cy="365" r="7" fill="#ffb3d1"/><circle cx="235" cy="355" r="6" fill="#ffd27a"/><circle cx="262" cy="370" r="7" fill="#c79bff"/><circle cx="545" cy="365" r="7" fill="#ffd27a"/><circle cx="585" cy="358" r="6" fill="#ff7ab6"/><circle cx="612" cy="372" r="7" fill="#ffb3d1"/><circle cx="40" cy="400" r="6" fill="#ff7ab6"/><circle cx="96" cy="405" r="7" fill="#ffd27a"/><circle cx="730" cy="410" r="6" fill="#c79bff"/><circle cx="780" cy="420" r="7" fill="#ff7ab6"/></g>
    <g><rect x="268" y="300" width="5" height="75" fill="#5a3b6e"/><circle cx="270" cy="296" r="26" fill="url(#gLamp)"/><rect x="262" y="288" width="16" height="16" rx="3" fill="#ffd27a"/>
       <rect x="528" y="300" width="5" height="75" fill="#5a3b6e"/><circle cx="530" cy="296" r="26" fill="url(#gLamp)"/><rect x="522" y="288" width="16" height="16" rx="3" fill="#ffd27a"/></g>
    <path d="M380 470 l20-14 20 14 -20 14z M300 450 l14-10 14 10 -14 10z M470 455 l14-10 14 10 -14 10z" fill="#e9c6ff" opacity=".35"/>
  </svg>`;

  const PADLOCK_SVG = `
  <svg viewBox="0 0 200 250" aria-hidden="true">
    <defs>
      <linearGradient id="plBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".45" stop-color="#ffc766"/><stop offset="1" stop-color="#d5702c"/></linearGradient>
      <linearGradient id="plShackle" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b98a4a"/><stop offset=".5" stop-color="#fff3d1"/><stop offset="1" stop-color="#b98a4a"/></linearGradient>
      <radialGradient id="plGlow"><stop offset="0" stop-color="#ffdca0" stop-opacity=".9"/><stop offset="1" stop-color="#ff9fc8" stop-opacity="0"/></radialGradient>
    </defs>
    <circle class="pl-glow" cx="100" cy="160" r="98" fill="url(#plGlow)"/>
    <path class="shackle" d="M58 118 V78 a42 42 0 0 1 84 0 V118" fill="none" stroke="url(#plShackle)" stroke-width="17" stroke-linecap="round"/>
    <rect x="24" y="106" width="152" height="130" rx="28" fill="url(#plBody)"/>
    <rect x="35" y="117" width="130" height="108" rx="20" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
    <g transform="translate(76 132) scale(2)"><path d="M12 20.3c-.3 0-.6-.1-.8-.3C7.7 17 3 13.2 3 8.9 3 6.2 5 4 7.6 4c1.8 0 3.3.9 4.4 2.4C13.1 4.9 14.6 4 16.4 4 19 4 21 6.2 21 8.9c0 4.3-4.7 8.1-8.2 11.1-.2.2-.5.3-.8.3z" fill="#6b2412"/></g>
    <rect x="96" y="160" width="8" height="22" rx="4" fill="#fff3d1" opacity=".9"/>
    <circle cx="44" cy="126" r="4" fill="#fff" opacity=".6"/><circle cx="156" cy="126" r="4" fill="#fff" opacity=".6"/>
    <circle cx="44" cy="216" r="4" fill="#fff" opacity=".6"/><circle cx="156" cy="216" r="4" fill="#fff" opacity=".6"/>
  </svg>`;

  const scr = {
    title: 'Sirli parol',
    hud: false,
    sky: 'calm',
    enter(el) {
      this.el = el;
      this.alive = true;
      const A = LW.C.adventure || {};
      this.gates = A.gates || [];
      this.total = this.gates.length + 2;
      el.innerHTML = `
        <div class="wrap adv">
          <header class="screen-head">
            <p class="eyebrow">Sirli parol sarguzashti</p>
            <h1 class="title-lg">Sehrli olam <em class="gold-text">darvozalari</em></h1>
            <p class="lead">${LW.tx(A.intro || '')}</p>
          </header>
          <ol class="adv-steps" aria-label="Bosqichlar">
            ${this.gates.map((g, i) => `<li data-s="${i}"><span>${LW.icon('door')}</span><small>${i + 1}-darvoza</small></li>`).join('')}
            <li data-s="${this.gates.length}"><span>${LW.icon('flame')}</span><small>Fonar</small></li>
            <li data-s="${this.gates.length + 1}"><span>${LW.icon('lock')}</span><small>Qulf</small></li>
          </ol>
          <div class="adv-stage" id="advStage"></div>
          <div class="adv-scroll glass" aria-label="Topilgan sehrli so‘zlar">
            <span class="adv-scroll-label">${LW.icon('feather')} Sehrli so‘zlar</span>
            <div class="frags">${this.gates.map((g, i) => `<span class="frag" data-f="${i}">?</span>`).join('<i class="frag-dot"></i>')}</div>
          </div>
        </div>`;
      this.stage = $('#advStage', el);
      this.renderStep(true);
    },
    leave() {
      this.alive = false;
      this.stopLantern();
    },
    step() { return clamp(LW.store.d.adv.step | 0, 0, this.total - 1); },
    syncChrome() {
      const s = this.step();
      $$('.adv-steps li', this.el).forEach((li) => {
        const i = +li.dataset.s;
        li.classList.toggle('done', i < s);
        li.classList.toggle('now', i === s);
      });
      $$('.frag', this.el).forEach((f) => {
        const i = +f.dataset.f;
        const got = i < s;
        f.textContent = got ? this.gates[i].reward || '★' : '?';
        f.classList.toggle('got', got);
      });
    },
    async renderStep(first) {
      if (!this.alive) return;
      this.stopLantern();
      if (!first) {
        this.stage.classList.add('swap');
        await wait(LW.reduced() ? 50 : 380);
        if (!this.alive) return;
      }
      const s = this.step();
      this.syncChrome();
      if (s < this.gates.length) this.renderGate(s);
      else if (s === this.gates.length) this.renderLantern();
      else this.renderLock();
      this.stage.classList.remove('swap');
    },

    /* ── Riddle gate ── */
    renderGate(i) {
      const g = this.gates[i];
      let tries = 0;
      this.stage.innerHTML = `
        <div class="tablet glass">
          <div class="tablet-ring" aria-hidden="true"><i></i><i></i></div>
          <p class="eyebrow">${LW.tx(g.title || i + 1 + '-darvoza')} · ${i + 1}/${this.gates.length}</p>
          <h2 class="riddle">${LW.tx(g.question)}</h2>
          <form class="answer-form" autocomplete="off">
            <input class="field" name="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Javobingni yoz…" aria-label="Javob" maxlength="60">
            <button class="btn btn-primary" type="submit">${LW.icon('sparkle')}<span>Javob berish</span></button>
          </form>
          <div class="tablet-foot">
            <button type="button" class="btn btn-ghost btn-sm hint-btn">${LW.icon('bulb')}<span>Maslahat</span></button>
          </div>
          <p class="hint-text" role="status" hidden></p>
          <div class="reward" hidden><span>Darvoza ochildi! Sehrli so‘z:</span><b>${esc(g.reward || '★')}</b></div>
        </div>`;
      const tab = $('.tablet', this.stage);
      const form = $('form', tab), input = $('input', tab), hint = $('.hint-text', tab);
      const showHint = (extra) => {
        hint.hidden = false;
        hint.innerHTML = `${LW.icon('bulb')} ${LW.tx(g.hint || '')}${extra ? `<br><small>${extra}</small>` : ''}`;
      };
      $('.hint-btn', tab).addEventListener('click', () => { LW.audio.sfx('magic'); showHint(); });
      setTimeout(() => this.alive && matchMedia('(pointer: fine)').matches && input.focus({ preventScroll: true }), 500);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = LW.norm(input.value);
        if (!v || tab.classList.contains('solved')) return;
        const answers = (g.answers || []).map(LW.norm).filter(Boolean);
        const ok = answers.some((a) => v === a || (a.length >= 3 && v.includes(a)));
        if (!ok) {
          tries++;
          LW.audio.sfx('wrong');
          tab.classList.remove('shake'); void tab.offsetWidth; tab.classList.add('shake');
          input.select();
          const first = LW.t((g.answers || [''])[0]).trim();
          if (tries === 2) showHint();
          if (tries >= 3) showHint(`Yana kichik yordam: javob «${esc(first.charAt(0).toUpperCase())}» harfi bilan boshlanadi va ${first.length} ta harfdan iborat.`);
          return;
        }
        tab.classList.add('solved');
        input.disabled = true;
        $('button[type=submit]', form).disabled = true;
        LW.audio.sfx('correct');
        setTimeout(() => LW.audio.sfx('magic'), 250);
        const rw = $('.reward', tab);
        rw.hidden = false;
        const r = rw.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 34, colors: ['#ffd27a', '#fff', '#ff9fc8'] });
        await wait(LW.reduced() ? 300 : 1100);
        if (!this.alive) return;
        // fly the word to the scroll
        const slot = $(`.frag[data-f="${i}"]`, this.el);
        const word = $('b', rw);
        if (slot && word) {
          const a = word.getBoundingClientRect(), b = slot.getBoundingClientRect();
          const fly = LW.h(`<div class="word-fly">${esc(g.reward || '★')}</div>`);
          fly.style.left = a.left + a.width / 2 + 'px';
          fly.style.top = a.top + a.height / 2 + 'px';
          document.body.appendChild(fly);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            fly.classList.add('go');
            fly.style.left = b.left + b.width / 2 + 'px';
            fly.style.top = b.top + b.height / 2 + 'px';
          }));
          await wait(LW.reduced() ? 150 : 800);
          fly.remove();
        }
        LW.store.d.adv.step = i + 1;
        LW.store.save();
        this.syncChrome();
        if (slot) LW.fx.burst(slot.getBoundingClientRect().left + 20, slot.getBoundingClientRect().top + 16, { count: 12, shapes: ['spark'], speed: 140, g: 0 });
        await wait(500);
        this.renderStep();
      });
    },

    /* ── Lantern key hunt ── */
    renderLantern() {
      const A = LW.C.adventure || {};
      this.stage.innerHTML = `
        <div class="lantern-wrap">
          <p class="lead center">${LW.tx(A.lanternText || '')}</p>
          <div class="lantern-stage" id="lStage">
            ${GARDEN_SVG}
            <button class="hidden-key" type="button" aria-label="Oltin kalit">${LW.icon('key')}</button>
            <canvas class="darkness" aria-hidden="true"></canvas>
          </div>
          <p class="lantern-tip">${LW.icon('flame')} <span>Barmog‘ing yoki sichqonchang bilan bog‘ni yorit</span></p>
        </div>`;
      const st = $('#lStage', this.stage);
      const key = $('.hidden-key', st);
      const cv = $('canvas', st);
      let { ctx, w, h } = LW.fitCanvas(cv);
      const touch = matchMedia('(pointer: coarse)').matches;
      const L = { x: w / 2, y: h * 0.82, tx: w / 2, ty: h * 0.82 };
      // place key away from start
      let kx, ky, guard = 0;
      do { kx = rand(0.1, 0.9); ky = rand(0.14, 0.78); guard++; } while (Math.hypot(kx - 0.5, (ky - 0.82) * 0.7) < 0.32 && guard < 50);
      key.style.left = kx * 100 + '%';
      key.style.top = ky * 100 + '%';
      this.keyPos = { kx, ky };
      const flies = Array.from({ length: 14 }, () => ({ x: rand(0, w), y: rand(0, h), a: rand(0, 6.28), s: rand(12, 30) }));
      const t0 = performance.now();
      let hintShown = false, found = false;
      const move = (e) => {
        const r = st.getBoundingClientRect();
        L.tx = e.clientX - r.left;
        L.ty = e.clientY - r.top - (e.pointerType === 'touch' ? 56 : 0);
      };
      st.addEventListener('pointermove', move);
      st.addEventListener('pointerdown', move);
      const onResize = () => ({ ctx, w, h } = LW.fitCanvas(cv));
      addEventListener('resize', onResize);
      const loop = (now) => {
        if (!this.lanternOn) return;
        const t = (now - t0) / 1000;
        L.x += (L.tx - L.x) * 0.18;
        L.y += (L.ty - L.y) * 0.18;
        const R = Math.max(touch ? 95 : 80, Math.min(w, h) * (touch ? 0.26 : 0.2)) * (1 + Math.sin(t * 3) * 0.03);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(5,2,16,0.965)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-out';
        const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, R);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.55, 'rgba(0,0,0,.92)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(L.x, L.y, R, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // warm lantern tint
        const g2 = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, R);
        g2.addColorStop(0, 'rgba(255,200,120,.16)');
        g2.addColorStop(1, 'rgba(255,160,90,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(L.x, L.y, R, 0, 7); ctx.fill();
        // fireflies
        for (const f of flies) {
          f.a += 0.02 + Math.sin(t + f.s) * 0.01;
          f.x += Math.cos(f.a) * 0.6; f.y += Math.sin(f.a * 1.3) * 0.4;
          if (f.x < 0) f.x = w; if (f.x > w) f.x = 0; if (f.y < 0) f.y = h; if (f.y > h) f.y = 0;
          const al = 0.35 + 0.35 * Math.sin(t * 2 + f.s);
          ctx.fillStyle = `rgba(210,255,170,${al})`;
          ctx.beginPath(); ctx.arc(f.x, f.y, 1.8, 0, 7); ctx.fill();
          ctx.fillStyle = `rgba(210,255,170,${al * 0.18})`;
          ctx.beginPath(); ctx.arc(f.x, f.y, 6, 0, 7); ctx.fill();
        }
        // hint: key twinkles through the dark
        if (t > 16) {
          if (!hintShown) {
            hintShown = true;
            const tip = $('.lantern-tip span', this.stage);
            if (tip) tip.textContent = 'Qorong‘ida nimadir yaltirab ketdi… diqqat bilan qara!';
          }
          const ph = (t % 2.4) / 2.4;
          if (ph < 0.35) {
            const a = Math.sin((ph / 0.35) * Math.PI);
            const x = kx * w, y = ky * h, s = 10 + a * 12;
            ctx.save(); ctx.translate(x, y); ctx.rotate(t);
            ctx.fillStyle = `rgba(255,226,150,${a})`;
            ctx.beginPath();
            ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
            ctx.fill(); ctx.restore();
          }
        }
        // proximity glow on the key
        const kd = Math.hypot(kx * w - L.x, ky * h - L.y);
        key.classList.toggle('lit', kd < R * 0.8);
        requestAnimationFrame(loop);
      };
      this.lanternOn = true;
      this.lanternCleanup = () => removeEventListener('resize', onResize);
      requestAnimationFrame(loop);
      key.addEventListener('click', async () => {
        if (found) return;
        found = true;
        LW.audio.sfx('key');
        const r = key.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 46, colors: ['#ffd27a', '#fff2c4', '#ffffff'], shapes: ['star', 'spark'] });
        key.classList.add('found');
        st.classList.add('revealed');
        await wait(LW.reduced() ? 300 : 1300);
        if (!this.alive) return;
        LW.store.d.adv.step = this.gates.length + 1;
        LW.store.save();
        this.renderStep();
      });
    },
    stopLantern() {
      this.lanternOn = false;
      if (this.lanternCleanup) { this.lanternCleanup(); this.lanternCleanup = null; }
    },

    /* ── Final padlock ── */
    renderLock() {
      const A = LW.C.adventure || {};
      const words = this.gates.map((g) => g.reward).filter(Boolean);
      let tries = 0;
      this.stage.innerHTML = `
        <div class="lock-wrap">
          <div class="padlock" id="padlock">${PADLOCK_SVG}<span class="pl-key">${LW.icon('key')}</span></div>
          <p class="eyebrow">Oltin kalit topildi</p>
          <h2 class="title-md">So‘nggi sehrli qulf</h2>
          <p class="lead center">${LW.tx(A.passwordHint || '')}</p>
          <div class="frag-chips">${words.map((w) => `<span>${esc(w)}</span>`).join('<i>+</i>')}</div>
          <form class="answer-form" autocomplete="off">
            <input class="field" name="pw" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Sirli parol…" aria-label="Sirli parol" maxlength="80">
            <button class="btn btn-gold" type="submit">${LW.icon('unlock')}<span>Qulfni ochish</span></button>
          </form>
          <p class="hint-text" role="status" hidden></p>
        </div>`;
      const wrap = $('.lock-wrap', this.stage);
      const lock = $('#padlock', wrap), form = $('form', wrap), input = $('input', wrap), hint = $('.hint-text', wrap);
      setTimeout(() => this.alive && matchMedia('(pointer: fine)').matches && input.focus({ preventScroll: true }), 500);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (lock.classList.contains('open')) return;
        const v = LW.norm(input.value);
        if (!v) return;
        const pw = LW.norm(A.password || words.join(' '));
        if (v !== pw) {
          tries++;
          LW.audio.sfx('wrong');
          lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake');
          hint.hidden = false;
          hint.innerHTML = tries >= 3
            ? `${LW.icon('bulb')} Parol — yuqoridagi so‘zlar shu tartibda: <b>${words.map(esc).join(' ')}</b>`
            : `${LW.icon('lock')} Qulf qimirlamadi… yana urinib ko‘r.`;
          input.select();
          return;
        }
        input.disabled = true;
        $('button', form).disabled = true;
        hint.hidden = true;
        lock.classList.add('inserting');
        LW.audio.sfx('tap');
        await wait(LW.reduced() ? 200 : 800);
        lock.classList.add('open');
        LW.audio.sfx('unlock');
        const r = lock.getBoundingClientRect();
        LW.fx.burst(r.left + r.width / 2, r.top + r.height * 0.6, { count: 70, speed: 460 });
        LW.store.d.unlocked = true;
        LW.store.d.adv.step = this.total - 1;
        LW.store.save();
        await wait(LW.reduced() ? 300 : 1200);
        if (!this.alive) return;
        LW.fx.confetti();
        const done = LW.h(`<div class="unlocked-msg">
            <h2 class="title-lg gold-text">Olam ochildi!</h2>
            <p class="lead center">Xush kelibsan, ${esc(LW.C.herName || '')}. Endi bu sehrli olamning har bir burchagi sening ixtiyoringda.</p>
            <button class="btn btn-primary btn-lg" id="toHub">${LW.icon('sparkle')}<span>Olamga kirish</span></button>
          </div>`);
        wrap.appendChild(done);
        requestAnimationFrame(() => done.classList.add('in'));
        $('#toHub', done).addEventListener('click', () => LW.doorTransition(() => LW.go('olam')));
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };
  LW.route('sarguzasht', scr);
})();
