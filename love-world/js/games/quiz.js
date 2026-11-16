/* Game 3 — Sevgi viktorinasi: how well do you know us? */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, $$, esc, wait } = LW;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  LW.registerGame({
    id: 'viktorina',
    title: 'Sevgi viktorinasi',
    short: 'Bizning hikoyamizni qanchalik yaxshi bilasan?',
    icon: 'question',
    colors: ['#ffd27a', '#ff8f6b'],
    kind: 'dom',
    get rules() {
      const q = (LW.C.quiz && LW.C.quiz.questions) || [];
      return `<p>Senga <b>${q.length} ta</b> savol beriladi. Yuragingga quloq solib javob ber.</p>
        <p>Kamida <b>${(LW.C.quiz && LW.C.quiz.passPercent) || 60}%</b> to‘g‘ri javob — va kalit seniki.</p>`;
    },
    bestLabel: (b) => `${b}% to‘g‘ri`,
    mount(stage, api) {
      const QZ = LW.C.quiz || {};
      const Q = (QZ.questions || []).filter((q) => q && q.q && (q.options || []).length);
      const pass = QZ.passPercent || 60;
      const S = { i: 0, correct: 0, answered: false, done: false };
      api.debug(S);
      stage.innerHTML = `<div class="quiz">
          <div class="quiz-progress" aria-hidden="true"><i></i></div>
          <div class="quiz-card glass" id="qCard"></div>
        </div>`;
      const card = $('#qCard', stage), bar = $('.quiz-progress i', stage);
      api.stats([
        { id: 'q', icon: 'question', label: 'Savol', value: `1/${Q.length}` },
        { id: 'ok', icon: 'check', label: 'To‘g‘ri', value: '0' }
      ]);
      const correctOf = (q) => (Array.isArray(q.correct) ? q.correct : [q.correct]).map(Number);

      function render() {
        const q = Q[S.i];
        S.answered = false;
        bar.style.width = (S.i / Q.length) * 100 + '%';
        api.stat('q', `${S.i + 1}/${Q.length}`);
        card.classList.remove('in');
        card.innerHTML = `
          <p class="eyebrow">Savol ${S.i + 1} / ${Q.length}</p>
          <h2 class="quiz-q">${LW.tx(q.q)}</h2>
          <div class="quiz-opts">${q.options.map((o, k) => `<button class="quiz-opt" data-k="${k}" style="--i:${k}"><span class="qo-l">${LETTERS[k]}</span><span class="qo-t">${LW.tx(o)}</span></button>`).join('')}</div>
          <p class="quiz-note" role="status" hidden></p>
          <button class="btn btn-primary quiz-next" hidden>${S.i + 1 < Q.length ? 'Keyingi savol' : 'Natijani ko‘rish'}${LW.icon('right')}</button>`;
        requestAnimationFrame(() => card.classList.add('in'));
        $$('.quiz-opt', card).forEach((b) => b.addEventListener('click', () => choose(+b.dataset.k)));
        $('.quiz-next', card).addEventListener('click', next);
      }
      function choose(k) {
        if (S.answered || S.done) return;
        S.answered = true;
        const q = Q[S.i], ok = correctOf(q);
        const right = ok.includes(k);
        const btns = $$('.quiz-opt', card);
        btns.forEach((b, j) => {
          b.disabled = true;
          if (ok.includes(j)) b.classList.add('right');
          else if (j === k) b.classList.add('wrong');
          else b.classList.add('dim');
        });
        const note = $('.quiz-note', card);
        note.hidden = false;
        if (right) {
          S.correct++;
          api.stat('ok', S.correct);
          LW.audio.sfx('correct');
          const r = btns[k].getBoundingClientRect();
          LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 18, speed: 240 });
          note.className = 'quiz-note good';
          note.innerHTML = `${LW.icon('heart')} ${LW.tx(q.note || 'To‘g‘ri!')}`;
        } else {
          LW.audio.sfx('wrong');
          btns[k].classList.add('shake');
          note.className = 'quiz-note bad';
          note.innerHTML = `${LW.icon('sparkle')} To‘g‘ri javob: <b>${ok.map((j) => LW.tx(q.options[j])).join(' / ')}</b>`;
        }
        const nb = $('.quiz-next', card);
        nb.hidden = false;
        setTimeout(() => nb.focus({ preventScroll: true }), 50);
      }
      async function next() {
        if (!S.answered || S.done) return;
        LW.audio.sfx('tap');
        if (S.i + 1 < Q.length) { S.i++; card.classList.add('out'); await wait(220); card.classList.remove('out'); render(); return; }
        S.done = true;
        bar.style.width = '100%';
        const pct = Q.length ? Math.round((S.correct / Q.length) * 100) : 100;
        if (pct >= pass) {
          const nb = api.best(pct);
          api.win({ title: pct === 100 ? 'Sen meni to‘liq bilasan!' : 'Zo‘r natija!', text: `<b>${Q.length}</b> savoldan <b>${S.correct}</b> tasiga to‘g‘ri javob berding (${pct}%).`, stars: pct === 100 ? 3 : pct >= 80 ? 2 : 1, newBest: nb });
        } else {
          api.lose({ title: 'Deyarli!', text: `${Q.length} savoldan ${S.correct} tasi to‘g‘ri (${pct}%). Kalit uchun kamida ${pass}% kerak. Yuragingga quloq solib, yana bir bor urinib ko‘r 💕` });
        }
      }
      const onKey = (e) => {
        if (LW.modalOpen()) return;
        const k = LETTERS.indexOf(e.key.toUpperCase());
        const n = parseInt(e.key, 10);
        if (!S.answered && k >= 0 && k < Q[S.i].options.length) choose(k);
        else if (!S.answered && n >= 1 && n <= Q[S.i].options.length) choose(n - 1);
      };
      addEventListener('keydown', onKey);
      if (!Q.length) { stage.innerHTML = '<p class="lead center">Savollar topilmadi.</p>'; api.win({ text: 'Savollar yo‘q, lekin kalit baribir seniki!' }); }
      else render();
      return { destroy() { removeEventListener('keydown', onKey); } };
    }
  });
})();
