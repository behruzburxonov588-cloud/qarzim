/* LOVE WORLD — shared mini-game frame: intro, stats, win/lose, key reward */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, esc, wait } = LW;
  LW.games = {};
  LW.registerGame = (def) => { LW.games[def.id] = def; };

  const scr = {
    title: 'Sinov',
    hud: true,
    sky: 'calm',
    enter(el, id) {
      const g = LW.games[id];
      this.el = el; this.g = g; this.id = id; this.inst = null; this.alive = true;
      const idx = LW.GAME_IDS.indexOf(id);
      const best = LW.store.d.best[id];
      const had = !!LW.store.d.keys[id];
      document.title = `${g.title} · ${LW.C.siteTitle || 'LOVE WORLD'}`;
      el.innerHTML = `
        <div class="game-screen" style="--c1:${g.colors[0]};--c2:${g.colors[1]}">
          <div class="wrap game-top">
            <div class="game-title">
              <p class="eyebrow">Sinov ${idx + 1}/${LW.GAME_IDS.length}${had ? ` · ${LW.icon('key')} kalit olingan` : ''}</p>
              <h1 class="title-md">${esc(g.title)}</h1>
            </div>
            <div class="game-stats" id="gStats" aria-live="polite"></div>
          </div>
          <div class="game-stage ${g.kind || 'dom'}" id="gStage"></div>
          <div class="game-intro" id="gIntro">
            <div class="intro-card glass">
              <span class="intro-icon">${LW.icon(g.icon)}</span>
              <p class="eyebrow">Sinov ${idx + 1}</p>
              <h2 class="title-md">${esc(g.title)}</h2>
              <div class="intro-rules">${g.rules}</div>
              <button class="btn btn-primary btn-lg" id="gStart">${LW.icon('play')}<span>Boshlash</span></button>
              ${best != null && g.bestLabel ? `<p class="intro-best">${LW.icon('trophy')} Eng yaxshi natija: <b>${esc(g.bestLabel(best))}</b></p>` : ''}
            </div>
          </div>
        </div>`;
      this.stage = $('#gStage', el);
      this.statsEl = $('#gStats', el);
      $('#gStart', el).addEventListener('click', () => {
        LW.audio.sfx('magic');
        $('#gIntro', el).classList.add('gone');
        setTimeout(() => { const i = $('#gIntro', el); i && i.remove(); }, 500);
        this.mount();
      });
    },
    mount() {
      if (!this.alive) return;
      this.destroyInst();
      this.stage.innerHTML = '';
      this.statsEl.innerHTML = '';
      const self = this, id = this.id, g = this.g;
      let finished = false;
      const api = {
        stats(list) {
          self.statsEl.innerHTML = list.map((s) => `<div class="stat" data-id="${s.id}">${LW.icon(s.icon)}<span><small>${s.label}</small><b>${s.value}</b></span></div>`).join('');
        },
        stat(sid, value) {
          const b = $(`.stat[data-id="${sid}"] b`, self.statsEl);
          if (!b || b.innerHTML === String(value)) return;
          b.innerHTML = value;
          const s = b.closest('.stat');
          s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
        },
        alive: () => self.alive && self.inst === inst && !finished,
        best(score, lowerIsBetter) {
          const cur = LW.store.d.best[id];
          if (cur == null || (lowerIsBetter ? score < cur : score > cur)) { LW.store.d.best[id] = score; LW.store.save(); return true; }
          return false;
        },
        debug(obj) { LW._dbg = obj; },
        async win(o = {}) {
          if (finished || !self.alive) return;
          finished = true;
          const isNew = !LW.store.d.keys[id];
          LW.store.d.keys[id] = true;
          LW.store.save();
          LW.audio.sfx('win');
          LW.fx.confetti();
          await wait(LW.reduced() ? 200 : 900);
          if (!self.alive) return;
          const stars = o.stars || 0;
          const m = LW.modal({
            cls: 'win-modal',
            icon: 'trophy',
            title: o.title || 'Ajoyib!',
            dismissible: false,
            html: `<p>${o.text || ''}</p>
              ${stars ? `<div class="stars-row">${[1, 2, 3].map((n) => `<span class="${n <= stars ? 'on' : ''}" style="--i:${n}">${LW.icon('star')}</span>`).join('')}</div>` : ''}
              ${o.newBest ? `<p class="new-best">${LW.icon('trophy')} Yangi rekord!</p>` : ''}
              ${isNew ? `<div class="win-key"><span class="win-key-ic">${LW.icon('key')}</span><span><b>Sehrli kalit seniki!</b><small>${LW.keyCount()}/${LW.GAME_IDS.length} kalit to‘plandi</small></span></div>`
                : '<p class="muted">Bu sinov kaliti allaqachon sening qo‘lingda. Barakalla!</p>'}`,
            buttons: [
              { label: 'Yana o‘ynash', icon: 'refresh', onClick: () => { setTimeout(() => self.mount(), 350); } },
              {
                label: isNew ? 'Kalitni olish' : 'Olamga qaytish', icon: isNew ? 'key' : 'home', cls: 'btn-gold', close: false,
                onClick: async (btn) => {
                  btn.disabled = true;
                  m.close();
                  if (isNew) await LW.flyKey();
                  if (self.alive) LW.go('olam');
                }
              }
            ]
          });
        },
        async lose(o = {}) {
          if (finished || !self.alive) return;
          finished = true;
          LW.audio.sfx('lose');
          await wait(600);
          if (!self.alive) return;
          LW.modal({
            cls: 'lose-modal',
            icon: 'heart',
            title: o.title || 'Yana bir urinish!',
            dismissible: false,
            html: `<p>${o.text || 'Hechqisi yo‘q — sevgi sabr bilan yutadi.'}</p>`,
            buttons: [
              { label: 'Olamga qaytish', icon: 'home', onClick: () => LW.go('olam') },
              { label: 'Qayta urinish', icon: 'refresh', cls: 'btn-primary', onClick: () => setTimeout(() => self.mount(), 350) }
            ]
          });
        }
      };
      const inst = { destroy() {} };
      this.inst = inst;
      try {
        const r = g.mount(this.stage, api);
        if (r && r.destroy) inst.destroy = r.destroy;
      } catch (e) { console.error(e); }
    },
    destroyInst() {
      if (this.inst) { try { this.inst.destroy(); } catch (e) { console.error(e); } }
      this.inst = null;
      LW._dbg = null;
    },
    leave() {
      this.alive = false;
      this.destroyInst();
    }
  };
  LW.route('oyin', scr);
})();
