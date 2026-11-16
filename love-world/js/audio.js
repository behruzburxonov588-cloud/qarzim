/* LOVE WORLD — audio: generative music box (or custom file) + synthesized SFX */
(function () {
  'use strict';
  const LW = window.LW;
  let ctx = null, master, musicBus, sfxBus, reverb, delayIn;
  let timer = null, nextTime = 0, step = 0, fileEl = null, fileFailed = false;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 1.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    reverb.connect(wet); wet.connect(master);
    // shimmer delay for music
    delayIn = ctx.createGain(); delayIn.gain.value = 0.22;
    const dl = ctx.createDelay(1.5); dl.delayTime.value = 0.4545 * 1.5;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    delayIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(reverb); lp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    musicBus.connect(master); musicBus.connect(reverb); musicBus.connect(delayIn);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    const sfxRev = ctx.createGain(); sfxRev.gain.value = 0.35;
    sfxBus.connect(sfxRev); sfxRev.connect(reverb);
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ── Instruments ── */
  function bell(t, midi, vel, dur, dest) {
    const f = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    [[1, 1], [2.0, 0.28], [3.01, 0.09], [4.2, 0.04]].forEach(([mul, amp], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      if (i > 1) { og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.35); }
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function pad(t, midis, dur, vel) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 780; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vel * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    lp.connect(g); g.connect(musicBus);
    midis.forEach((m) => {
      [-6, 6].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 1);
      });
    });
  }
  function tone(t, f0, f1, dur, vel, type = 'sine', dest = sfxBus) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(t, dur, vel, type, f0, f1, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + Math.min(0.05, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  /* ── Generative score: I – vi – IV – V in D, music box over warm pad ── */
  const EIGHTH = 60 / 66 / 2;
  const CHORDS = [
    { arp: [62, 66, 69, 73, 74, 78], pad: [50, 57, 61, 66] }, // Dmaj7
    { arp: [59, 62, 66, 69, 71, 74], pad: [47, 54, 57, 62] }, // Bm7
    { arp: [55, 59, 62, 66, 67, 71], pad: [43, 50, 54, 59] }, // Gmaj7
    { arp: [57, 61, 64, 66, 69, 73], pad: [45, 52, 57, 61] }  // A6
  ];
  const ARP = [0, 2, 1, 3, 4, 3, 2, 5];
  const MELODY = [
    [[0, 81, 2.4], [4, 78, 1.6], [6, 76, 1.2]],
    [[0, 74, 2.4], [4, 78, 2]],
    [[0, 79, 1.6], [2, 78, 1.2], [4, 74, 2.4]],
    [[0, 76, 2], [4, 73, 1.4], [6, 76, 1.4]],
    [[0, 78, 1.4], [2, 81, 1.4], [4, 85, 2], [6, 83, 1.2]],
    [[0, 81, 2.6], [4, 78, 2]],
    [[0, 79, 1.6], [4, 83, 1.6], [6, 81, 1.2]],
    [[0, 81, 2.4], [4, 76, 1.4], [7, 73, 1.4]]
  ];
  function scheduleStep(t, s) {
    const bar = Math.floor(s / 8), pos = s % 8, chord = CHORDS[bar % 4];
    if (pos === 0) pad(t, chord.pad, EIGHTH * 8, 0.035);
    const humanize = (Math.random() - 0.5) * 0.012;
    bell(t + humanize, chord.arp[ARP[pos]], pos === 0 ? 0.075 : 0.05, 1.6, musicBus);
    const mel = MELODY[bar % 8];
    for (const [p, m, d] of mel) if (p === pos) bell(t + 0.004, m + 12 * 0, 0.11, d * 1.4, musicBus);
  }
  function scheduler() {
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(nextTime, step);
      nextTime += EIGHTH;
      step = (step + 1) % 64;
    }
  }

  /* ── Public API ── */
  const audio = {
    get ctx() { return ctx; },
    unlock() { ensure(); },
    setMusic(on) {
      const s = LW.store.d.settings;
      s.music = !!on;
      LW.store.save();
      const src = LW.C.music && LW.C.music.src;
      const vol = LW.clamp(+(LW.C.music && LW.C.music.volume) || 0.55, 0, 1);
      if (src && !fileFailed) {
        if (!fileEl) {
          fileEl = new Audio(src);
          fileEl.loop = true;
          fileEl.preload = 'auto';
          fileEl.addEventListener('error', () => {
            fileFailed = true;
            fileEl = null;
            if (LW.store.d.settings.music) { LW.toast('Qo‘shiq fayli topilmadi — sehrli kuy chalinadi', 'music'); audio.setMusic(true); }
          });
        }
        if (on) {
          fileEl.volume = 0;
          const p = fileEl.play();
          if (p && p.catch) p.catch(() => {});
          fadeEl(vol);
        } else fadeEl(0, () => fileEl && fileEl.pause());
        LW.hud && LW.hud.update();
        return;
      }
      if (!ensure()) return;
      const g = musicBus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      if (on) {
        if (!timer) {
          nextTime = ctx.currentTime + 0.1;
          timer = setInterval(scheduler, 40);
        }
        g.linearRampToValueAtTime(vol * 1.1, ctx.currentTime + 1.6);
      } else {
        g.linearRampToValueAtTime(0, ctx.currentTime + 0.9);
        const tm = timer;
        setTimeout(() => { if (!LW.store.d.settings.music && timer === tm) { clearInterval(timer); timer = null; } }, 1000);
      }
      LW.hud && LW.hud.update();
    },
    toggleMusic() { this.setMusic(!LW.store.d.settings.music); },
    /** Temporarily lift/duck music (finale). */
    swell(mult = 1.4) {
      if (fileEl) { fadeEl(LW.clamp((LW.C.music.volume || 0.55) * mult, 0, 1)); return; }
      if (!ctx || !LW.store.d.settings.music) return;
      const vol = LW.clamp(+(LW.C.music && LW.C.music.volume) || 0.55, 0, 1);
      musicBus.gain.linearRampToValueAtTime(vol * 1.1 * mult, ctx.currentTime + 2);
    },
    sfx(name, arg) {
      if (!LW.store.d.settings.sfx) return;
      if (!ensure()) return;
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'tap': tone(t, 920, 640, 0.07, 0.07); break;
        case 'hover': tone(t, 1400, 1300, 0.04, 0.02); break;
        case 'correct': [76, 81, 88].forEach((m, i) => bell(t + i * 0.08, m, 0.16, 1.2, sfxBus)); break;
        case 'wrong': tone(t, 300, 240, 0.18, 0.12, 'triangle'); tone(t + 0.12, 240, 190, 0.26, 0.1, 'triangle'); break;
        case 'pop': tone(t, 520, 1250, 0.09, 0.14); bell(t + 0.02, 88 + (arg || 0), 0.06, 0.5, sfxBus); break;
        case 'gold': [84, 88, 91, 96].forEach((m, i) => bell(t + i * 0.05, m, 0.09, 0.9, sfxBus)); break;
        case 'bad': tone(t, 220, 110, 0.35, 0.16, 'triangle'); hiss(t, 0.2, 0.05, 'lowpass', 900, 200); break;
        case 'note': bell(t, [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98, 100][(arg || 0) % 12], 0.14, 1.4, sfxBus); break;
        case 'flip': hiss(t, 0.12, 0.08, 'highpass', 1800, 5000); tone(t, 660, 880, 0.08, 0.04); break;
        case 'slide': hiss(t, 0.09, 0.06, 'bandpass', 900, 1600, 2); break;
        case 'type': hiss(t, 0.025, 0.03, 'highpass', 3000, 4000); break;
        case 'whoosh': hiss(t, 0.7, 0.16, 'bandpass', 300, 2600, 1.4); break;
        case 'shoot': hiss(t, 0.25, 0.09, 'bandpass', 2400, 700, 2); tone(t, 330, 160, 0.18, 0.08, 'triangle'); break;
        case 'key': [72, 76, 79, 84, 88, 91].forEach((m, i) => bell(t + i * 0.07, m, 0.13, 1.6, sfxBus)); hiss(t, 1.2, 0.03, 'highpass', 5000, 9000); break;
        case 'win': [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [88, 0.62], [84, 0.62], [79, 0.62]].forEach(([m, d]) => bell(t + d, m, 0.14, 2.2, sfxBus)); break;
        case 'lose': [69, 65, 62].forEach((m, i) => bell(t + i * 0.18, m, 0.1, 1.2, sfxBus)); break;
        case 'unlock': tone(t, 1800, 1500, 0.05, 0.08, 'square'); tone(t + 0.09, 1200, 900, 0.06, 0.06, 'square'); [79, 86, 91].forEach((m, i) => bell(t + 0.2 + i * 0.09, m, 0.12, 1.8, sfxBus)); break;
        case 'door': hiss(t, 1.8, 0.12, 'lowpass', 180, 900, 0.7); tone(t, 55, 70, 1.6, 0.12, 'sine'); [62, 69, 74, 81].forEach((m, i) => bell(t + 0.6 + i * 0.12, m, 0.1, 2.5, sfxBus)); break;
        case 'candle': hiss(t, 0.45, 0.12, 'lowpass', 300, 2400, 0.8); bell(t + 0.1, 84 + (arg || 0), 0.05, 1.2, sfxBus); break;
        case 'firework': hiss(t, 0.06, 0.22, 'lowpass', 2000, 600); hiss(t + 0.04, 1.4, 0.07, 'highpass', 3000, 6000, 0.6); break;
        case 'launch': hiss(t, 0.7, 0.05, 'bandpass', 400, 3000, 3); break;
        case 'heartbeat': tone(t, 70, 50, 0.16, 0.35); tone(t + 0.2, 66, 48, 0.2, 0.28); break;
        case 'magic': [74, 78, 81, 85, 86, 90, 93].forEach((m, i) => bell(t + i * 0.045, m, 0.07, 1.3, sfxBus)); break;
      }
    }
  };
  function fadeEl(target, done) {
    if (!fileEl) return;
    const el = fileEl, start = el.volume, t0 = performance.now(), dur = 1200;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.volume = start + (target - start) * k;
      if (k < 1) requestAnimationFrame(tick);
      else done && done();
    };
    requestAnimationFrame(tick);
  }
  LW.audio = audio;
})();
