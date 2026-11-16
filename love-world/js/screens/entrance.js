/* LOVE WORLD — magical entrance + door transition */
(function () {
  'use strict';
  const LW = window.LW;
  const { $, esc, wait } = LW;

  /** Cinematic double-door transition; `mid` runs while doors are shut. */
  LW.doorTransition = async (mid) => {
    const d = LW.h(`<div class="doors" aria-hidden="true">
      <div class="door door-l"><i class="door-orn"></i></div>
      <div class="door door-r"><i class="door-orn"></i></div>
      <div class="door-seal">${LW.icon('heart')}</div>
      <div class="door-light"></div>
    </div>`);
    document.body.appendChild(d);
    LW.audio.sfx('whoosh');
    await wait(30);
    d.classList.add('closing');
    await wait(LW.reduced() ? 250 : 900);
    LW.audio.sfx('door');
    d.classList.add('sealed');
    await wait(LW.reduced() ? 150 : 650);
    mid && mid();
    await wait(120);
    d.classList.add('opening');
    await wait(LW.reduced() ? 400 : 1500);
    d.remove();
  };

  LW.route('', {
    title: 'Kirish',
    hud: false,
    sky: 'calm',
    enter(el) {
      const C = LW.C, d = LW.store.d;
      const title = (C.siteTitle || 'LOVE WORLD').split('');
      const returning = d.unlocked;
      el.innerHTML = `
        <div class="entrance">
          <div class="ent-moon" aria-hidden="true"></div>
          <div class="ent-orb" aria-hidden="true">
            <i class="ring r1"></i><i class="ring r2"></i><i class="ring r3"></i>
            <span class="orb-core">${LW.icon('heart')}</span>
            ${Array.from({ length: 8 }, (_, i) => `<i class="orbit" style="--i:${i}"><b></b></i>`).join('')}
          </div>
          <p class="eyebrow ent-eyebrow">${returning ? 'Qaytganingdan xursandman' : 'Sehrli sarguzasht boshlanmoqda'}</p>
          <h1 class="ent-title" aria-label="${esc(C.siteTitle || 'LOVE WORLD')}">
            ${title.map((ch, i) => (ch === ' ' ? '<span class="sp"></span>' : `<span class="ch" style="--d:${i * 0.07 + 0.4}s">${esc(ch)}</span>`)).join('')}
          </h1>
          <p class="lead ent-sub">${LW.tx(C.entranceSubtitle || '')}</p>
          <div class="ent-actions">
            <button class="btn btn-primary btn-lg" data-music="1">${LW.icon('music')}<span>${returning ? 'Musiqa bilan qaytish' : 'Musiqa bilan kirish'}</span></button>
            <button class="btn btn-ghost" data-music="0">${LW.icon('door')}<span>Jimjitlikda kirish</span></button>
          </div>
          <p class="ent-note">${returning ? `Kalitlar: <b>${LW.keyCount()}/7</b> · olaming seni kutmoqda` : 'Quloqchin taqsang, sehr yanada kuchliroq bo‘ladi'}</p>
        </div>`;
      el.querySelectorAll('[data-music]').forEach((b) =>
        b.addEventListener('click', async () => {
          if (this.busy) return;
          this.busy = true;
          LW.audio.unlock();
          LW.audio.setMusic(b.dataset.music === '1');
          const r = b.getBoundingClientRect();
          LW.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 30 });
          await LW.doorTransition(() => LW.go(LW.store.d.unlocked ? 'olam' : 'sarguzasht'));
          this.busy = false;
        })
      );
      this.busy = false;
    },
    leave() {}
  });
})();
