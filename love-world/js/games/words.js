/* Game 6 — So‘z sehri: unscramble the words of our love */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, shuffle, wait, esc } = LW;
  const tokenize = (w) => (LW.t(w).toUpperCase().match(/[OG][‘'ʻ’`]|\S/g) || []).map((t) => t.replace(/[‘'ʻ’`]/, '‘'));

  LW.registerGame({
    id: 'soz-sehri',
    title: 'So‘z sehri',
    short: 'Aralashgan harflardan sevgi so‘zlarini yasab chiq.',
    icon: 'letters',
    colors: ['#ff9a8b', '#ff5f6d'],
    kind: 'dom',
    get rules() {
      return `<p>Sehrgar so‘zlarning harflarini aralashtirib yubordi! Harflarni to‘g‘ri tartibda bosib, <b>${(LW.C.words || []).length} ta</b> sehrli so‘zni tikla.</p>
        <p>Har bir so‘zning yashirin ma’nosi bor. Qiynalsang — <b>Maslahat</b> tugmasi yordam beradi.</p>`;
    },
    bestLabel: (b) => (b ? `${b} ta maslahat bilan` : 'maslahatsiz'),
    mount(stage, api) {
      const W = (LW.C.words || []).filter((w) => w && w.word && tokenize(w.word).length > 1);
      const S = { i: 0, hints: 0, pool: [], slots: [], answer: [], locked: [], busy: false, done: false };
      api.debug(S);
      api.stats([
        { id: 'w', icon: 'letters', label: 'So‘z', value: `1/${W.length}` },
        { id: 'h', icon: 'bulb', label: 'Maslahat', value: '0' }
      ]);
      stage.innerHTML = `
        <div class="ws">
          <div class="ws-dots">${W.map((_, k) => `<i data-k="${k}"></i>`).join('')}</div>
          <p class="ws-hint" id="wsHint"></p>
          <div class="ws-slots" id="wsSlots" aria-label="So‘z kataklari"></div>
          <div class="ws-pool" id="wsPool" aria-label="Harflar"></div>
          <div class="ws-tools">
            <button class="btn btn-ghost btn-sm" id="wsHintBtn">${LW.icon('bulb')}<span>Maslahat</span></button>
            <button class="btn btn-ghost btn-sm" id="wsMix">${LW.icon('refresh')}<span>Aralashtirish</span></button>
            <button class="btn btn-ghost btn-sm" id="wsClear">${LW.icon('close')}<span>Tozalash</span></button>
          </div>
        </div>`;
      const slotsEl = $('#wsSlots', stage), poolEl = $('#wsPool', stage);

      function load() {
        const w = W[S.i];
        S.answer = tokenize(w.word);
        let order;
        let guard = 0;
        do { order = shuffle(S.answer.map((t, k) => k)); guard++; } while (order.every((v, k) => S.answer[v] === S.answer[k]) && guard < 30);
        S.pool = order.map((k, id) => ({ id, t: S.answer[k], used: false }));
        S.slots = S.answer.map(() => null);
        S.locked = S.answer.map(() => false);
        $('#wsHint', stage).innerHTML = `${LW.icon('sparkle')} <span>${LW.tx(w.hint || '')}</span>`;
        $$('.ws-dots i', stage).forEach((d, k) => { d.classList.toggle('done', k < S.i); d.classList.toggle('now', k === S.i); });
        api.stat('w', `${S.i + 1}/${W.length}`);
        slotsEl.classList.remove('good', 'bad');
        render(true);
      }
      function render(fresh) {
        slotsEl.style.setProperty('--n', S.answer.length);
        slotsEl.innerHTML = S.slots.map((pid, k) => {
          const t = pid == null ? '' : S.pool[pid].t;
          return `<button class="ws-slot ${pid == null ? '' : 'filled'} ${S.locked[k] ? 'locked' : ''}" data-k="${k}" aria-label="${pid == null ? 'Bo‘sh katak' : 'Harf ' + esc(t)}">${esc(t)}</button>`;
        }).join('');
        poolEl.innerHTML = S.pool.map((p) => `<button class="ws-tile ${p.used ? 'used' : ''} ${fresh ? 'pop' : ''}" data-id="${p.id}" style="--i:${p.id}" ${p.used ? 'disabled aria-hidden="true"' : ''}>${esc(p.t)}</button>`).join('');
        $$('.ws-slot', slotsEl).forEach((b) => b.addEventListener('click', () => unplace(+b.dataset.k)));
        $$('.ws-tile', poolEl).forEach((b) => b.addEventListener('click', () => place(+b.dataset.id)));
      }
      function place(pid) {
        if (S.busy || S.done) return;
        const p = S.pool[pid];
        if (!p || p.used) return;
        const k = S.slots.indexOf(null);
        if (k < 0) return;
        p.used = true;
        S.slots[k] = pid;
        LW.audio.sfx('pop', k);
        render();
        if (!S.slots.includes(null)) check();
      }
      function unplace(k) {
        if (S.busy || S.done || S.slots[k] == null || S.locked[k]) return;
        S.pool[S.slots[k]].used = false;
        S.slots[k] = null;
        LW.audio.sfx('slide');
        render();
      }
      async function check() {
        const guess = S.slots.map((pid) => S.pool[pid].t);
        S.busy = true;
        if (guess.join('') === S.answer.join('')) {
          slotsEl.classList.add('good');
          LW.audio.sfx('correct');
          const r = slotsEl.getBoundingClientRect();
          LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 30, speed: 300 });
          await wait(LW.reduced() ? 500 : 1400);
          if (!api.alive()) return;
          S.busy = false;
          S.i++;
          if (S.i >= W.length) {
            S.done = true;
            $$('.ws-dots i', stage).forEach((d) => d.classList.add('done'));
            const nb = api.best(S.hints, true);
            api.win({ title: 'So‘z sehrgari!', text: `Barcha <b>${W.length}</b> sehrli so‘zni topding: ${W.map((w) => `<b>${esc(LW.t(w.word).toUpperCase())}</b>`).join(', ')}. Ularning hammasi sen haqingda.`, stars: S.hints === 0 ? 3 : S.hints <= 2 ? 2 : 1, newBest: nb });
          } else load();
        } else {
          slotsEl.classList.add('bad');
          LW.audio.sfx('wrong');
          await wait(750);
          slotsEl.classList.remove('bad');
          S.slots.forEach((pid, k) => { if (pid != null && !S.locked[k]) { S.pool[pid].used = false; S.slots[k] = null; } });
          S.busy = false;
          render();
        }
      }
      function hint() {
        if (S.busy || S.done) return;
        const k = S.answer.findIndex((t, j) => !S.locked[j] && (S.slots[j] == null || S.pool[S.slots[j]].t !== t));
        if (k < 0) return;
        // free slot k if occupied
        if (S.slots[k] != null) { S.pool[S.slots[k]].used = false; S.slots[k] = null; }
        // find an unused tile with the right letter (or steal it from a wrong slot)
        let p = S.pool.find((x) => !x.used && x.t === S.answer[k]);
        if (!p) {
          const j = S.slots.findIndex((pid, jj) => pid != null && !S.locked[jj] && S.pool[pid].t === S.answer[k]);
          if (j >= 0) { p = S.pool[S.slots[j]]; S.slots[j] = null; p.used = false; }
        }
        if (!p) return;
        p.used = true;
        S.slots[k] = p.id;
        S.locked[k] = true;
        S.hints++;
        api.stat('h', S.hints);
        LW.audio.sfx('magic');
        render();
        if (!S.slots.includes(null)) check();
      }
      $('#wsHintBtn', stage).addEventListener('click', hint);
      $('#wsMix', stage).addEventListener('click', () => {
        if (S.busy) return;
        const free = S.pool.filter((p) => !p.used);
        const sh = shuffle(free.map((p) => p.t));
        free.forEach((p, k) => (p.t = sh[k]));
        LW.audio.sfx('whoosh');
        render(true);
      });
      $('#wsClear', stage).addEventListener('click', () => {
        if (S.busy) return;
        S.slots.forEach((pid, k) => { if (pid != null && !S.locked[k]) { S.pool[pid].used = false; S.slots[k] = null; } });
        LW.audio.sfx('slide');
        render();
      });
      const onKey = (e) => {
        if (LW.modalOpen() || S.done || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Backspace') {
          for (let k = S.slots.length - 1; k >= 0; k--) if (S.slots[k] != null && !S.locked[k]) { e.preventDefault(); unplace(k); return; }
          return;
        }
        if (e.key.length !== 1) return;
        const ch = e.key.toUpperCase();
        const k = S.slots.indexOf(null);
        const want = k >= 0 ? S.answer[k] : '';
        const p = S.pool.find((x) => !x.used && x.t === ch) || S.pool.find((x) => !x.used && x.t.charAt(0) === ch && (want.charAt(0) !== ch || x.t === want));
        if (p) { e.preventDefault(); place(p.id); }
      };
      addEventListener('keydown', onKey);
      if (!W.length) { stage.innerHTML = '<p class="lead center">So‘zlar topilmadi.</p>'; api.win({ text: 'So‘zlar yo‘q, lekin kalit baribir seniki!' }); }
      else load();
      return { destroy() { removeEventListener('keydown', onKey); } };
    }
  });
})();
