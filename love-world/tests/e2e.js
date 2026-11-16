/*
 * LOVE WORLD — end-to-end test.
 * Plays the whole experience in a real browser: entrance, password adventure,
 * all seven games (with simulated mouse/touch play), reasons, memory book,
 * love letter, secret room, finale, settings, the content editor, and a phone pass.
 *
 *   node tests/e2e.js              (needs the `playwright` package + Chromium)
 *   SHOTS=dir node tests/e2e.js    (also saves screenshots to dir)
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const URL_INDEX = 'file://' + path.join(ROOT, 'index.html');
const URL_EDITOR = 'file://' + path.join(ROOT, 'editor.html');
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); passed++; console.log('  ✓ ' + msg); };

function watch(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const hash = (page) => page.evaluate(() => location.hash);
const keyCount = (page) => page.evaluate(() => LW.keyCount());

async function startGame(page, id) {
  await page.evaluate((g) => (location.hash = '#/oyin/' + g), id);
  await page.waitForSelector('#gStart');
  await sleep(700);
  await page.click('#gStart');
  await sleep(600);
}
async function collectKey(page, id) {
  await page.waitForSelector('.win-modal.in', { timeout: 120000 });
  await sleep(500);
  ok(await page.evaluate((g) => !!LW.store.d.keys[g], id), `${id}: won, key stored`);
  await shot(page, `game-${id}-win`);
  await page.click('.win-modal .btn-gold');
  await page.waitForFunction(() => location.hash === '#/olam', null, { timeout: 15000 });
  await sleep(900);
}

/* ── game players ── */
async function playCatcher(page) {
  await startGame(page, 'yurak-ovchisi');
  await shot(page, 'game-catcher-play');
  await catcherLoop(page);
}
async function catcherLoop(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 110000) {
    const st = await page.evaluate(() => {
      const S = LW._dbg; const c = document.querySelector('.gcanvas');
      if (!S || !c) return null;
      const r = c.getBoundingClientRect();
      return { over: S.over, by: S.by, bw: S.bw, items: S.items.map((i) => ({ t: i.type, x: i.x, y: i.y, vy: i.vy })), left: r.left, top: r.top, w: r.width };
    });
    if (!st || st.over) break;
    const good = st.items.filter((i) => i.t !== 'broken' && i.y < st.by).sort((a, b) => (st.by - a.y) / a.vy - (st.by - b.y) / b.vy);
    let tx = good.length ? good[0].x : st.w / 2;
    for (const d of st.items.filter((i) => i.t === 'broken' && i.y > st.by - 170 && i.y < st.by + 12)) {
      if (Math.abs(d.x - tx) < st.bw * 0.8) tx = d.x + (tx >= d.x ? 1 : -1) * st.bw * 0.95;
    }
    tx = Math.max(st.bw / 2, Math.min(st.w - st.bw / 2, tx));
    await page.mouse.move(st.left + tx, st.top + st.by);
    await sleep(25);
  }
  await sleep(1200);
  if (await page.$('.lose-modal')) { // the bot lost — use the in-game retry
    console.log('    (catcher bot lost a round, retrying)');
    await page.click('.lose-modal .btn-primary');
    await sleep(900);
    return catcherLoop(page);
  }
  await collectKey(page, 'yurak-ovchisi');
}

async function playMemory(page) {
  await startGame(page, 'juftliklar');
  const pairs = await page.$$eval('.mm-card', (els) => els.map((e) => +e.dataset.pair));
  ok(pairs.length === 16, 'memory: 16 cards dealt');
  // one deliberate mismatch
  const other = pairs.findIndex((p) => p !== pairs[0]);
  await page.click(`.mm-card[data-i="0"]`);
  await page.click(`.mm-card[data-i="${other}"]`);
  await sleep(1300);
  ok((await page.$$('.mm-card.open')).length === 0, 'memory: mismatched cards flip back');
  const byPair = {};
  pairs.forEach((p, i) => (byPair[p] = (byPair[p] || []).concat(i)));
  for (const [a, b] of Object.values(byPair)) {
    await page.click(`.mm-card[data-i="${a}"]`);
    await page.click(`.mm-card[data-i="${b}"]`);
    await sleep(380);
  }
  ok((await page.$$('.mm-card.matched')).length === 16, 'memory: all pairs matched');
  await collectKey(page, 'juftliklar');
}

async function playQuiz(page) {
  await startGame(page, 'viktorina');
  const qs = await page.evaluate(() => LW.C.quiz.questions.map((q) => ({ n: q.options.length, c: [].concat(q.correct) })));
  for (let i = 0; i < qs.length; i++) {
    let pick = qs[i].c[0];
    if (i === 1) pick = [...Array(qs[i].n).keys()].find((k) => !qs[i].c.includes(k)); // one wrong answer
    await page.waitForSelector(`.quiz-card.in .quiz-opt[data-k="${pick}"]`);
    await sleep(350);
    await page.click(`.quiz-opt[data-k="${pick}"]`);
    if (i === 1) ok(!!(await page.$('.quiz-opt.wrong')), 'quiz: wrong answer is marked');
    await page.click('.quiz-next');
    await sleep(350);
  }
  await collectKey(page, 'viktorina');
}

async function playStars(page) {
  await startGame(page, 'yulduzlar');
  for (let lvl = 0; lvl < 3; lvl++) {
    await page.waitForFunction((l) => LW._dbg && LW._dbg.level === l && !LW._dbg.busy, lvl);
    const n = await page.$$eval('.cs', (e) => e.length);
    if (lvl === 0) {
      await page.click('.cs[data-n="3"]');
      ok((await page.evaluate(() => LW._dbg.mistakes)) === 1, 'stars: out-of-order star counts as a mistake');
    }
    for (let k = 1; k <= n; k++) { await page.click(`.cs[data-n="${k}"]`); await sleep(120); }
    if (lvl === 0) { await sleep(900); await shot(page, 'game-stars-heart'); }
  }
  await collectKey(page, 'yulduzlar');
}

function solvePuzzle(board) {
  const N = 3, goal = '012345678', start = board.join('');
  const prev = new Map([[start, null]]);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const s = q[h];
    if (s === goal) break;
    const e = s.indexOf('8'), r = Math.floor(e / N), c = e % N;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const t = nr * N + nc, a = s.split('');
      [a[e], a[t]] = [a[t], a[e]];
      const ns = a.join('');
      if (!prev.has(ns)) { prev.set(ns, [s, t]); q.push(ns); }
    }
  }
  const moves = [];
  for (let s = goal; prev.get(s); s = prev.get(s)[0]) moves.unshift({ from: prev.get(s)[0], pos: prev.get(s)[1] });
  return moves.map((m) => +m.from[m.pos]); // tile value to click
}
async function playPuzzle(page) {
  await startGame(page, 'jumboq');
  await page.waitForFunction(() => LW._dbg && LW._dbg.ready);
  await page.click('#pzPeek'); await sleep(400); await shot(page, 'game-puzzle-peek'); await sleep(1600);
  const board = await page.evaluate(() => LW._dbg.board.slice());
  const tiles = solvePuzzle(board);
  ok(tiles.length > 0, `puzzle: solvable in ${tiles.length} moves`);
  for (const v of tiles) { await page.click(`.pz-tile[data-v="${v}"]`); await sleep(40); }
  await collectKey(page, 'jumboq');
}

async function playWords(page) {
  await startGame(page, 'soz-sehri');
  const total = await page.evaluate(() => LW.C.words.length);
  for (let w = 0; w < total; w++) {
    await page.waitForFunction((i) => LW._dbg && LW._dbg.i === i && !LW._dbg.busy, w);
    await sleep(500);
    if (w === 0) { await page.click('#wsHintBtn'); ok((await page.evaluate(() => LW._dbg.hints)) === 1, 'words: hint places a letter'); }
    if (w === 1) { // wrong order first
      const ids = await page.evaluate(() => LW._dbg.pool.filter((p) => !p.used).map((p) => p.id));
      const ans = await page.evaluate(() => LW._dbg.answer.join(''));
      const order = ids.slice();
      const guess = await page.evaluate((o) => o.map((id) => LW._dbg.pool[id].t).join(''), order);
      if (guess !== ans) {
        for (const id of order) await page.click(`.ws-tile[data-id="${id}"]`);
        await sleep(200);
        ok(await page.$('.ws-slots.bad') !== null, 'words: wrong word shakes');
        await sleep(900);
      }
    }
    const plan = await page.evaluate(() => {
      const S = LW._dbg, used = new Set(S.pool.filter((p) => p.used).map((p) => p.id)), out = [];
      S.answer.forEach((t, k) => { if (S.slots[k] != null) return; const p = S.pool.find((x) => !used.has(x.id) && x.t === t); used.add(p.id); out.push(p.id); });
      return out;
    });
    for (const id of plan) await page.click(`.ws-tile[data-id="${id}"]`);
    await sleep(300);
  }
  await collectKey(page, 'soz-sehri');
}

async function playCupid(page) {
  await startGame(page, 'kupidon');
  await cupidLoop(page);
}
async function cupidLoop(page) {
  const t0 = Date.now();
  let shotTaken = false;
  while (Date.now() - t0 < 60000) {
    const st = await page.evaluate(() => {
      const S = LW._dbg; const c = document.querySelector('.gcanvas');
      if (!S || !c) return null;
      const r = c.getBoundingClientRect();
      return { over: S.over, cd: S.cd, bx: S.bx, by: S.by, hearts: S.hearts.map((h) => ({ x: h.x, y: h.y, vx: h.vx })), left: r.left, top: r.top, w: r.width, h: r.height };
    });
    if (!st || st.over) break;
    const V = Math.max(720, Math.min(1150, st.h * 1.55)), G = 320;
    const vis = st.hearts.filter((h) => h.x > 30 && h.x < st.w - 30);
    if (!vis.length || st.cd > 0) { await sleep(40); continue; }
    vis.sort((a, b) => Math.hypot(a.x - st.bx, a.y - st.by) - Math.hypot(b.x - st.bx, b.y - st.by));
    const h = vis[0];
    let best = null;
    for (let t = 0.05; t < 1.4; t += 0.005) {
      const dx = h.x + h.vx * (t + 0.06) - st.bx, dy = h.y - st.by;
      const vx = dx / t, vy = (dy - 0.5 * G * t * t) / t;
      const err = Math.abs(Math.hypot(vx, vy) - V);
      if (!best || err < best.err) best = { err, a: Math.atan2(vy, vx) };
    }
    const a = Math.max(-Math.PI + 0.13, Math.min(-0.13, best.a));
    await page.mouse.click(st.left + st.bx + Math.cos(a) * 140, st.top + st.by + Math.sin(a) * 140);
    if (!shotTaken && Date.now() - t0 > 3000) { shotTaken = true; await shot(page, 'game-cupid-play'); }
    await sleep(60);
  }
  await sleep(1200);
  if (await page.$('.lose-modal')) { console.log('    (cupid bot lost a round, retrying)'); await page.click('.lose-modal .btn-primary'); await sleep(900); return cupidLoop(page); }
  await collectKey(page, 'kupidon');
}

/* ── main desktop journey ── */
async function desktop(browser) {
  console.log('\n▶ Desktop journey (1280×800)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  watch(page, errors);
  await page.goto(URL_INDEX);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await sleep(2600);
  await shot(page, 'd01-entrance');
  ok((await page.textContent('.ent-sub')).includes(await page.evaluate(() => LW.C.herName)), 'entrance shows her name');
  // guard: deep link while locked goes back to the entrance
  await page.evaluate(() => (location.hash = '#/olam'));
  await sleep(700);
  ok((await hash(page)) === '#/', 'locked world redirects to entrance');
  await page.click('[data-music="1"]');
  await sleep(1300);
  await shot(page, 'd02-doors');
  await page.waitForFunction(() => location.hash === '#/sarguzasht');
  await sleep(1800);
  ok(await page.evaluate(() => LW.store.d.settings.music), 'music turned on from entrance');

  // adventure gates
  const gates = await page.evaluate(() => LW.C.adventure.gates.map((g) => LW.t(g.answers[0])));
  await page.fill('.tablet input', 'notogri');
  await page.press('.tablet input', 'Enter');
  await sleep(400);
  await page.fill('.tablet input', 'yana');
  await page.press('.tablet input', 'Enter');
  await sleep(400);
  ok(await page.isVisible('.hint-text'), 'gate: hint appears after two wrong answers');
  await shot(page, 'd03-gate-hint');
  for (let i = 0; i < gates.length; i++) {
    await page.waitForFunction((s) => LW.store.d.adv.step === s && document.querySelector('.tablet input:not([disabled])'), i);
    await sleep(450);
    if (i === 1) { await page.click('.hint-btn'); await sleep(200); }
    await page.fill('.tablet input', (i === 0 ? '  ' + gates[i].toUpperCase() + ' ' : gates[i]));
    await page.click('.tablet button[type=submit]');
    await sleep(700);
    if (i === 0) await shot(page, 'd04-gate-solved');
    await page.waitForFunction((s) => LW.store.d.adv.step === s + 1, i, { timeout: 8000 });
  }
  ok(true, 'all riddle gates solved (case/space-insensitive)');
  await page.waitForSelector('.lantern-stage');
  await sleep(600);
  const st = await page.$('.lantern-stage');
  const sb = await st.boundingBox();
  for (let k = 0; k < 6; k++) { await page.mouse.move(sb.x + sb.width * (0.1 + k * 0.16), sb.y + sb.height * 0.5, { steps: 4 }); await sleep(60); }
  await shot(page, 'd05-lantern');
  const kb = await (await page.$('.hidden-key')).boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2, { steps: 6 });
  await sleep(300);
  await shot(page, 'd06-lantern-key');
  await page.click('.hidden-key', { force: true });
  await page.waitForSelector('#padlock');
  await sleep(700);
  await page.fill('.lock-wrap input', 'parol');
  await page.press('.lock-wrap input', 'Enter');
  await sleep(500);
  ok(await page.isVisible('.lock-wrap .hint-text'), 'padlock: wrong password rejected');
  const pw = await page.evaluate(() => LW.C.adventure.password);
  await page.fill('.lock-wrap input', pw.toUpperCase().replace(/ /g, '  '));
  await page.press('.lock-wrap input', 'Enter');
  await page.waitForSelector('.unlocked-msg.in', { timeout: 8000 });
  await sleep(600);
  await shot(page, 'd07-unlocked');
  ok(await page.evaluate(() => LW.store.d.unlocked), 'world unlocked with the password');
  await page.click('#toHub');
  await page.waitForFunction(() => location.hash === '#/olam');
  await sleep(2200);
  await shot(page, 'd08-hub');
  ok((await page.$$('.gcard')).length === 7, 'hub lists 7 games');
  const s1 = await page.textContent('#tgS');
  await sleep(1300);
  ok((await page.textContent('#tgS')) !== s1, 'together counter ticks live');
  // locked secret room / finale
  await page.click('#secretCard');
  await sleep(400);
  ok((await hash(page)) === '#/olam' && (await page.isVisible('.toast')), 'secret room is locked without keys');
  await page.evaluate(() => (location.hash = '#/final'));
  await sleep(800);
  ok((await hash(page)) === '#/olam', 'finale guard redirects while locked');

  // HUD & settings
  await page.click('#hudMusic');
  ok(!(await page.evaluate(() => LW.store.d.settings.music)), 'HUD toggles music off');
  await page.click('#hudSettings');
  await page.waitForSelector('.modal-wrap.in');
  await shot(page, 'd09-settings');
  await page.click('label:has(#setReduce)');
  ok(await page.evaluate(() => document.body.classList.contains('reduce')), 'settings: light animation mode on');
  await page.click('label:has(#setReduce)');
  await page.click('label:has(#setMusic)');
  ok(await page.evaluate(() => LW.store.d.settings.music), 'settings: music toggle works');
  await page.click('label:has(#setMusic)');
  await page.click('.modal-actions .btn-primary');
  await sleep(500);

  // games
  console.log('  … playing 7 games');
  await playMemory(page);
  ok((await keyCount(page)) === 1, 'HUD key count = 1');
  await shot(page, 'd10-hub-1key');
  await playQuiz(page);
  await playStars(page);
  await playPuzzle(page);
  await playWords(page);
  await playCatcher(page);
  await playCupid(page);
  ok((await keyCount(page)) === 7, 'all 7 keys collected');
  await sleep(1500);
  await shot(page, 'd11-hub-all-keys');

  // reasons
  await page.evaluate(() => (location.hash = '#/sabablar'));
  await page.waitForSelector('.seal');
  await sleep(1200);
  await shot(page, 'd12-reasons');
  await page.click('.seal[data-i="0"]');
  await page.waitForSelector('.reader.open');
  await sleep(1300);
  await shot(page, 'd13-reason-reader');
  const nR = await page.evaluate(() => LW.C.reasons.length);
  for (let i = 1; i < nR; i++) { await page.keyboard.press('ArrowRight'); await sleep(90); }
  await page.keyboard.press('Escape');
  await sleep(600);
  ok((await page.textContent('#rmCount')) === String(nR), `all ${nR} reasons opened`);
  ok(await page.isVisible('#rOutro'), 'reasons outro revealed');
  await shot(page, 'd14-reasons-done');

  // memory book
  await page.evaluate(() => (location.hash = '#/xotiralar'));
  await page.waitForSelector('.book.spread');
  await sleep(1000);
  await shot(page, 'd15-book-cover');
  await page.click('#bkNext'); await sleep(1200);
  await shot(page, 'd16-book-spread');
  while (!(await page.$eval('#bkNext', (b) => b.disabled))) { await page.click('#bkNext'); await sleep(250); }
  await sleep(1100);
  ok(await page.evaluate(() => LW.store.d.memoriesSeen), 'memory book read to the end');
  await page.click('#bkPrev'); await sleep(1100);
  await page.keyboard.press('ArrowLeft'); await sleep(1100);
  await shot(page, 'd17-book-back');

  // love letter
  await page.evaluate(() => (location.hash = '#/maktub'));
  await page.waitForSelector('#envSeal');
  await sleep(1200);
  await shot(page, 'd18-envelope');
  await page.click('#envSeal', { force: true });
  await sleep(1500);
  await shot(page, 'd19-envelope-open');
  await page.waitForSelector('.letter-read.open', { timeout: 6000 });
  await sleep(4000);
  await shot(page, 'd20-letter-typing');
  await page.click('#lrSkip');
  await sleep(800);
  ok((await page.textContent('.lt-sign')).length > 0, 'letter fully revealed after skip');
  ok(await page.evaluate(() => LW.store.d.letterRead), 'letter marked as read');
  await shot(page, 'd21-letter-done');
  await page.click('#lrReplay'); await sleep(1500); await page.click('#lrSkip'); await sleep(300);
  await page.click('#lrClose');
  await page.waitForFunction(() => location.hash === '#/olam');
  await sleep(800);

  // secret room
  await page.evaluate(() => (location.hash = '#/sirli-xona'));
  await page.waitForSelector('#useKeys');
  await sleep(900);
  await shot(page, 'd22-secret-door');
  await page.click('#useKeys');
  await sleep(1700);
  await shot(page, 'd23-secret-door-open');
  await page.waitForSelector('.candle', { timeout: 10000 });
  await sleep(900);
  await shot(page, 'd24-room-dark');
  for (let i = 0; i < 7; i++) { await page.click(`.candle[data-i="${i}"]`); await sleep(220); }
  await page.waitForSelector('#giftArea.show', { timeout: 15000 });
  ok(await page.evaluate(() => LW.store.d.secret.candles), 'all candles lit → finale unlocked');
  await sleep(800);
  await shot(page, 'd25-room-lit');
  await page.click('#gift', { force: true });
  await page.waitForSelector('#coupons.show', { timeout: 8000 });
  await sleep(1200);
  await shot(page, 'd26-coupons');
  await page.click('.cp-use[data-i="0"]');
  await page.waitForSelector('.modal-wrap.in');
  await page.click('.modal-wrap.in .btn-primary');
  await sleep(700);
  ok(!!(await page.$('.coupon.used')), 'coupon redeemed and stamped');
  await page.fill('#wishText', 'Birga dengiz bo‘yida tong kutib olish');
  await page.click('#jarForm button');
  await sleep(1300);
  ok((await page.$$('.jar-star')).length === 1, 'wish dropped into the jar');
  await page.click('.jar-star', { force: true });
  await sleep(300);
  await page.$eval('#jarWrap', (e) => e.scrollIntoView());
  await sleep(500);
  await shot(page, 'd27-wish-jar');

  // finale
  await page.click('#srFinal a');
  await page.waitForSelector('#fnStart');
  await sleep(1000);
  await shot(page, 'd28-finale-start');
  await page.click('#fnGo');
  await sleep(6500);
  await shot(page, 'd29-finale-lines');
  await page.click('#fnSkip');
  await page.waitForSelector('#fnQ.show');
  await sleep(2600);
  await shot(page, 'd30-finale-question');
  for (let i = 0; i < 3; i++) {
    const b = await (await page.$('#fnNo')).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
    await sleep(450);
  }
  ok(await page.evaluate(() => document.querySelector('#fnNo').classList.contains('flying')), '"No" button runs away');
  await shot(page, 'd31-finale-no-dodge');
  await page.click('#fnYes');
  await page.waitForSelector('#fnEnd.show', { timeout: 8000 });
  await sleep(2600);
  await shot(page, 'd32-finale-end');
  ok(await page.evaluate(() => LW.store.d.finaleSeen && LW.store.d.said === 'ha'), 'finale answered "Ha"');
  await page.click('#fnReplay');
  await sleep(1500);
  await page.click('#fnSkip');
  await page.waitForSelector('#fnQ.show');
  // keyboard path: "No" via keyboard keeps dodging, then turns into yes
  for (let i = 0; i < 6; i++) { await page.focus('#fnNo'); await page.keyboard.press('Enter'); await sleep(200); }
  ok(await page.evaluate(() => document.querySelector('#fnNo').dataset.yes === '1'), '"No" finally turns into "Yes"');
  await page.click('#fnNo');
  await page.waitForSelector('#fnEnd.show');
  await sleep(1000);
  await page.click('#fnHome');
  await page.waitForFunction(() => location.hash === '#/olam');
  await sleep(1500);
  await shot(page, 'd33-hub-complete');

  // returning visitor (opens the plain address again)
  await page.evaluate(() => history.replaceState(null, '', location.pathname));
  await page.reload();
  await sleep(2400);
  ok((await page.textContent('.ent-eyebrow')).includes('Qaytganingdan'), 'returning visitor greeting');
  await page.click('[data-music="0"]');
  await page.waitForFunction(() => location.hash === '#/olam', null, { timeout: 6000 });
  ok(true, 'returning visitor goes straight to the world map');

  // reset progress through settings
  await sleep(1200);
  await page.click('#hudSettings');
  await page.waitForSelector('#setReset');
  await page.click('#setReset');
  await page.waitForSelector('.modal-wrap.in .btn-primary');
  await sleep(400);
  await page.click('.modal-wrap.in .btn-primary');
  await sleep(1200);
  ok((await hash(page)) === '#/' && (await keyCount(page)) === 0, 'progress reset returns to the entrance');

  ok(errors.length === 0, 'no console errors on desktop' + (errors.length ? ':\n' + errors.join('\n') : ''));
  await ctx.close();
}

/* ── phone pass ── */
async function phone(browser, devName, prefix) {
  console.log(`\n▶ Phone pass (${devName})`);
  const ctx = await browser.newContext({ ...devices[devName] });
  const page = await ctx.newPage();
  const errors = [];
  watch(page, errors);
  await page.goto(URL_INDEX);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(2600);
  await shot(page, prefix + '01-entrance');
  await page.tap('[data-music="0"]');
  await page.waitForFunction(() => location.hash === '#/sarguzasht');
  await sleep(1800);
  await shot(page, prefix + '02-adventure');
  const gates = await page.evaluate(() => LW.C.adventure.gates.map((g) => LW.t(g.answers[0])));
  for (let i = 0; i < gates.length; i++) {
    await page.waitForFunction((s) => LW.store.d.adv.step === s && document.querySelector('.tablet input:not([disabled])'), i);
    await sleep(400);
    await page.fill('.tablet input', gates[i]);
    await page.tap('.tablet button[type=submit]');
    await page.waitForFunction((s) => LW.store.d.adv.step === s + 1, i, { timeout: 8000 });
  }
  await page.waitForSelector('.lantern-stage');
  await sleep(700);
  await shot(page, prefix + '03-lantern');
  await page.locator('.hidden-key').tap({ force: true });
  await page.waitForSelector('#padlock');
  await sleep(600);
  await shot(page, prefix + '04-padlock');
  await page.fill('.lock-wrap input', await page.evaluate(() => LW.C.adventure.password));
  await page.tap('.lock-wrap button');
  await page.waitForSelector('#toHub', { timeout: 8000 });
  await sleep(800);
  await page.tap('#toHub');
  await page.waitForFunction(() => location.hash === '#/olam');
  await sleep(2400);
  await shot(page, prefix + '05-hub');
  ok(await page.evaluate(() => document.querySelector('.screen').scrollWidth <= innerWidth), 'hub has no horizontal scroll');
  await page.$eval('.game-grid', (e) => e.scrollIntoView());
  await sleep(500);
  await shot(page, prefix + '06-hub-games');
  // memory game by taps
  await page.evaluate(() => (location.hash = '#/oyin/juftliklar'));
  await page.waitForSelector('#gStart');
  await sleep(700);
  await shot(page, prefix + '07-game-intro');
  await page.tap('#gStart');
  await sleep(700);
  const pairs = await page.$$eval('.mm-card', (els) => els.map((e) => +e.dataset.pair));
  const byPair = {};
  pairs.forEach((p, i) => (byPair[p] = (byPair[p] || []).concat(i)));
  const groups = Object.values(byPair);
  for (let g = 0; g < groups.length; g++) {
    await page.tap(`.mm-card[data-i="${groups[g][0]}"]`);
    await page.tap(`.mm-card[data-i="${groups[g][1]}"]`);
    await sleep(380);
    if (g === 3) await shot(page, prefix + '08-memory');
  }
  await page.waitForSelector('.win-modal.in', { timeout: 10000 });
  await sleep(1400);
  await shot(page, prefix + '09-win');
  await page.tap('.win-modal .btn-gold');
  await page.waitForFunction(() => location.hash === '#/olam');
  // canvas games render on phone + touch drag
  for (const id of ['yurak-ovchisi', 'kupidon', 'yulduzlar', 'jumboq', 'soz-sehri', 'viktorina']) {
    await page.evaluate((g) => (location.hash = '#/oyin/' + g), id);
    await page.waitForSelector('#gStart');
    await sleep(600);
    await page.tap('#gStart');
    await sleep(1800);
    if (id === 'yurak-ovchisi' || id === 'kupidon') {
      const c = await (await page.$('.gcanvas')).boundingBox();
      await page.touchscreen.tap(c.x + c.width * 0.3, c.y + c.height * 0.5);
      await sleep(600);
    }
    await shot(page, prefix + '10-game-' + id);
    ok(await page.evaluate(() => document.querySelector('.screen').scrollWidth <= innerWidth), `${id}: fits the phone width`);
  }
  // unlock everything to preview the rest on phone
  await page.evaluate(() => {
    LW.GAME_IDS.forEach((g) => (LW.store.d.keys[g] = true));
    LW.store.save();
    location.hash = '#/xotiralar';
  });
  await page.waitForSelector('.book.single');
  await sleep(1000);
  await shot(page, prefix + '11-book-cover');
  await page.tap('#bkNext'); await sleep(1200);
  await page.tap('#bkNext'); await sleep(1200);
  await shot(page, prefix + '12-book-page');
  // swipe
  const bb = await (await page.$('#book')).boundingBox();
  await page.evaluate(({ x, y }) => {
    const s = document.querySelector('#bookStage');
    s.dispatchEvent(new PointerEvent('pointerdown', { clientX: x + 200, clientY: y, bubbles: true }));
    s.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
  }, { x: bb.x + 40, y: bb.y + bb.height / 2 });
  await sleep(1200);
  ok((await page.evaluate(() => document.querySelectorAll('.leaf.flipped').length)) === 3, 'book: swipe turns the page');
  await page.evaluate(() => (location.hash = '#/sabablar'));
  await page.waitForSelector('.seal');
  await sleep(1000);
  await shot(page, prefix + '13-reasons');
  await page.tap('.seal[data-i="4"]');
  await sleep(1400);
  await shot(page, prefix + '14-reason-reader');
  await page.tap('.reader-x');
  await sleep(500);
  await page.evaluate(() => (location.hash = '#/maktub'));
  await page.waitForSelector('#envSeal');
  await sleep(1000);
  await shot(page, prefix + '15-envelope');
  await page.locator('#envSeal').tap({ force: true });
  await page.waitForSelector('.letter-read.open', { timeout: 6000 });
  await sleep(3000);
  await shot(page, prefix + '16-letter');
  await page.tap('#lrSkip');
  await sleep(400);
  await page.tap('#lrClose');
  await page.waitForFunction(() => location.hash === '#/olam');
  await page.evaluate(() => (location.hash = '#/sirli-xona'));
  await page.waitForSelector('#useKeys');
  await sleep(900);
  await shot(page, prefix + '17-secret-door');
  await page.tap('#useKeys');
  await page.waitForSelector('.candle', { timeout: 10000 });
  await sleep(800);
  for (let i = 0; i < 7; i++) { await page.tap(`.candle[data-i="${i}"]`); await sleep(150); }
  await page.waitForSelector('#giftArea.show', { timeout: 15000 });
  await sleep(600);
  await shot(page, prefix + '18-room-lit');
  await page.locator('#gift').tap({ force: true });
  await page.waitForSelector('#coupons.show');
  await sleep(1300);
  await shot(page, prefix + '19-coupons');
  await page.evaluate(() => (location.hash = '#/final'));
  await page.waitForSelector('#fnGo');
  await sleep(900);
  await shot(page, prefix + '20-finale-start');
  await page.tap('#fnGo');
  await sleep(5200);
  await shot(page, prefix + '21-finale-line');
  await page.tap('#fnSkip');
  await page.waitForSelector('#fnQ.show');
  await sleep(2200);
  await shot(page, prefix + '22-finale-question');
  const nb = await (await page.$('#fnNo')).boundingBox();
  await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await sleep(500);
  ok(await page.evaluate(() => document.querySelector('#fnNo').classList.contains('flying') && !LW.store.d.finaleSeen), 'phone: tapping "No" makes it flee, nothing is answered');
  await shot(page, prefix + '23-finale-dodge');
  await page.tap('#fnYes');
  await page.waitForSelector('#fnEnd.show');
  await sleep(2600);
  await shot(page, prefix + '24-finale-end');
  ok(errors.length === 0, `no console errors on ${devName}` + (errors.length ? ':\n' + errors.join('\n') : ''));
  await ctx.close();
}

/* ── editor ── */
async function editor(browser) {
  console.log('\n▶ Content editor');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  watch(page, errors);
  page.on('dialog', (d) => d.accept());
  await page.goto(URL_EDITOR);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#f_herName');
  await sleep(600);
  await shot(page, 'e01-editor');
  await page.fill('#f_herName', 'Dilnoza');
  ok((await page.textContent('#edStatus')).includes('Saqlanmagan'), 'editor tracks unsaved changes');
  const nReasons = await page.$$eval('[data-list="reasons"] .ed-li', (e) => e.length);
  await page.click('[data-add="reasons"]');
  ok((await page.$$eval('[data-list="reasons"] .ed-li', (e) => e.length)) === nReasons + 1, 'editor adds a reason');
  await page.fill(`[data-path="reasons.${nReasons}"]`, 'Yangi sabab: sen bilan har kun bayram.');
  await page.click(`[data-move="reasons|${nReasons}|-1"]`);
  ok((await page.inputValue(`[data-path="reasons.${nReasons - 1}"]`)).startsWith('Yangi sabab'), 'editor reorders items');
  await page.click('[data-add="memories"]');
  // image upload (1×1 PNG)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('[data-upload="memories.0.photo"]', { name: 'p.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#sec-xotiralar .ed-thumb img');
  ok(true, 'editor uploads and embeds a photo');
  await page.fill('#f_adventure_password', 'boshqa parol');
  ok(await page.isVisible('.ed-check.warn'), 'editor warns when password and magic words differ');
  await page.fill('#f_adventure_password', 'sen va men');
  await page.click('#edSave');
  await sleep(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#edDownload')]);
  const file = await dl.path();
  const text = fs.readFileSync(file, 'utf8');
  ok(text.includes('window.LOVE_CONTENT') && text.includes('Dilnoza') && text.includes('data:image/jpeg'), 'downloaded content.js contains edits and photo');
  // the exported file must be valid JS producing the object
  const sandbox = {}; new Function('window', text)(sandbox);
  ok(sandbox.LOVE_CONTENT.herName === 'Dilnoza' && sandbox.LOVE_CONTENT.reasons.length === nReasons + 1, 'exported content.js is valid and complete');
  await page.click('#edUnlock');
  await sleep(200);
  const site = await ctx.newPage();
  watch(site, errors);
  await site.goto(URL_INDEX + '#/xotiralar');
  await site.waitForSelector('.book');
  await sleep(1200);
  ok((await site.textContent('.cover-names')).includes('Dilnoza'), 'site uses saved editor content');
  await site.click('#bkNext'); await sleep(1200);
  await site.click('#bkNext'); await sleep(1200);
  await shot(site, 'e02-site-with-edits');
  await site.close();
  await page.click('#edRevert');
  await sleep(300);
  ok((await page.inputValue('#f_herName')) !== 'Dilnoza', 'revert restores original content');
  await page.click('#edReset');
  await sleep(200);
  ok(await page.evaluate(() => localStorage.getItem('loveworld.progress.v1') === null), 'editor resets game progress');
  // mobile layout of the editor
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(400);
  await shot(page, 'e03-editor-mobile');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'editor fits the phone width');
  ok(errors.length === 0, 'no console errors in editor' + (errors.length ? ':\n' + errors.join('\n') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    const only = process.argv[2];
    if (!only || only === 'desktop') await desktop(browser);
    if (!only || only === 'phone') { await phone(browser, 'iPhone 13', 'm'); await phone(browser, 'Galaxy S9+', 's'); }
    if (!only || only === 'editor') await editor(browser);
    console.log(`\n✔ ${passed} checks passed in ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    console.error('\n✘ ' + e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
