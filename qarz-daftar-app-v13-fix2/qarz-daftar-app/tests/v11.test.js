'use strict';
// Qarzim v11 — HTTP darajasi: /api/cloud/ops marshrutlari, rollar matritsasi, 409, qulf, qayta ishga tushirish.
// Har server haqiqiy jarayon sifatida, vaqtinchalik papkada ishlaydi. Haqiqiy data.json ga tegilmaydi.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const { spawn } = require('child_process');

const APP = process.env.QD_APP || (fs.existsSync(path.resolve(__dirname, '..', 'server.js')) ? path.resolve(__dirname, '..') : path.resolve(__dirname, '..', 'src', 'qarz-daftar-app'));
const X = require(path.join(APP, 'lib', 'xlsx.js'));
const ADMIN_KEY = 'admin-test-key-' + 'x'.repeat(24);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400e3;

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
function tempDir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), `qd-${tag}-`)); }
function requireTemp(p) {
  const r = path.resolve(p), t = path.resolve(os.tmpdir()) + path.sep;
  if (!r.startsWith(t)) throw new Error('REFUSING to touch a non-temporary path: ' + r);
  return r;
}
async function startServer(dataDir, extraEnv = {}) {
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), DATA_FILE: requireTemp(path.join(dataDir, 'data.json')), ADMIN_KEY, ESKIZ_TEST_MODE: '1', ...extraEnv };
  const child = spawn(process.execPath, ['server.js'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 150 && !up; i++) { try { up = (await fetch(base + '/api/app-version?v=1.0.0')).ok; } catch (e) { await sleep(100); } }
  if (!up) throw new Error('server did not start:\n' + out);
  return { base, out: () => out, stop: async () => { const ex = new Promise((r) => child.once('exit', r)); child.kill('SIGTERM'); await ex; } };
}
const who = (u, ph) => ({ 'X-Qd-User': u, 'X-Qd-Auth': ph });
const J = (method, url, body, hdr = {}) => fetch(url, { method, headers: { 'Content-Type': 'application/json', ...hdr }, body: body === undefined ? undefined : JSON.stringify(body) });
const bin = (method, url, buf, hdr = {}) => fetch(url, { method, headers: { 'Content-Type': 'application/octet-stream', ...hdr }, body: buf });

// Egasi va xodimlar: owner, manager (Mgr), cashier (Kassir), employee (Xodim)
const PH = { owner: 'OWNER-PH-0001', mgr: 'MGR-PH-00001', kassir: 'KASS-PH-00001', xodim: 'XODIM-PH-0001' };
async function registerShop(base) {
  const r = await J('PUT', `${base}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: PH.owner, owner: 'owner' });
  assert.equal(r.status, 200, 'owner registration');
  const O = who('owner', PH.owner);
  for (const [k, u, role] of [['mgr', 'Mgr', 'manager'], ['kassir', 'Kassir', 'cashier'], ['xodim', 'Xodim', 'employee']]) {
    const s = await J('PUT', `${base}/api/cloud/qd_idx/${k}.json`, { username: u, ph: PH[k], owner: 'owner', role }, O);
    assert.equal(s.status, 200, 'owner creates ' + role);
  }
  return {
    O, M: who('mgr', PH.mgr), K: who('kassir', PH.kassir), X: who('xodim', PH.xodim),
  };
}
const api = (base, p, h, method = 'GET', body) => J(method, base + p, body, h);
const getBlob = async (base, h) => (await J('GET', `${base}/api/cloud/qd/owner.json`, undefined, h)).json();
const putBlob = (base, h, clients) => J('PUT', `${base}/api/cloud/qd/owner.json`, { clients, lenders: [], del: [] }, h);
const sale = (id, productId, qty, price, ts = Date.now()) => ({ id, type: 'debt', amount: qty * price, ts, items: [{ name: 'Un 50kg', qty, price, productId }] });
const UN = { name: 'Un 50kg', cur: 'UZS', buyPrice: 100000, sellPrice: 150000 };

// ---------------------------------------------------------------- rollar, ruxsatlar, /me
describe('rollar va ruxsatlar (matritsa)', () => {
  let srv, B, H, pid;
  before(async () => { srv = await startServer(tempDir('v11roles')); B = srv.base; H = await registerShop(B); });
  after(async () => { await srv.stop(); });

  test('autentifikatsiyasiz ombor marshrutlari — 401', async () => {
    assert.equal((await api(B, '/api/cloud/ops/me')).status, 401);
    assert.equal((await api(B, '/api/cloud/ops/state')).status, 401);
  });
  test('/me — har rol o‘z ruxsatlarini oladi', async () => {
    const perms = async (h) => (await (await api(B, '/api/cloud/ops/me', h)).json()).perms;
    const owner = await perms(H.O), mgr = await perms(H.M), kas = await perms(H.K), emp = await perms(H.X);
    for (const k of ['inv_override', 'fin_reports', 'ai', 'cash_view', 'expense']) assert.ok(owner.includes(k), 'owner: ' + k);
    assert.ok(mgr.includes('inv_adjust') && mgr.includes('fin_reports') && !mgr.includes('inv_override'), 'manager matritsasi');
    assert.ok(kas.includes('inv_view') && !kas.includes('cash_view') && !kas.includes('expense') && !kas.includes('inv_edit'), 'cashier matritsasi');
    assert.deepEqual(emp.filter((p) => p.startsWith('inv_') || ['view', 'write'].includes(p)).sort(), ['inv_view', 'view', 'write']);
    assert.ok(!emp.includes('fin_reports') && !emp.includes('ai'), 'employee: moliya va AI yo‘q');
  });
  test('mahsulot yaratish: xodim va kassir — 403, menejer va egasi — 200', async () => {
    const body = (opId) => Object.assign({ opId }, UN, { name: 'Tovar ' + opId });
    const e = await api(B, '/api/cloud/ops/product', H.X, 'POST', body('p-emp-0001'));
    assert.equal(e.status, 403); assert.equal((await e.json()).need, 'inv_edit');
    assert.equal((await api(B, '/api/cloud/ops/product', H.K, 'POST', body('p-kas-0001'))).status, 403);
    const m = await api(B, '/api/cloud/ops/product', H.M, 'POST', Object.assign({ opId: 'p-mgr-0001' }, UN));
    assert.equal(m.status, 200); pid = (await m.json()).id;
    assert.ok(pid);
  });
  test('faollashtirish: egasi — 200; ikkinchi chaqiruv — allaqachon', async () => {
    const a = await api(B, '/api/cloud/ops/activate', H.O, 'POST', {});
    assert.equal(a.status, 200); assert.equal((await a.json()).ok, true);
    const b = await (await api(B, '/api/cloud/ops/activate', H.O, 'POST', {})).json();
    assert.equal(b.already, true);
  });
  test('/state — kassir tovarlarni ko‘radi, lekin tannarx va kassa ko‘rmaydi', async () => {
    const k = await (await api(B, '/api/cloud/ops/state', H.K)).json();
    assert.equal(k.canCost, false); assert.equal(k.cashStart, null);
    assert.equal(k.products[0].buyMinor, undefined); assert.equal(k.products[0].valueUzs, undefined);
    const o = await (await api(B, '/api/cloud/ops/state', H.O)).json();
    assert.equal(o.canCost, true); assert.equal(o.products[0].buyMinor, 100000);
    assert.equal(o.products[0].qtyMilli, 0, 'boshlang‘ich qoldiq yo‘q');
  });
  test('moliya hisobotlari: xodim va kassir — 403; menejer va egasi — 200 (xodimlar bo‘yicha ham)', async () => {
    assert.equal((await api(B, '/api/cloud/ops/summary', H.X)).status, 403);
    assert.equal((await api(B, '/api/cloud/ops/summary', H.K)).status, 403);
    for (const h of [H.M, H.O]) {
      const r = await api(B, '/api/cloud/ops/summary?period=month', h);
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.ok(Array.isArray(j.byEmployee), 'byEmployee massiv');
      assert.ok(j.reconcile !== null, 'tekshiruv (egasi/menejer)');
    }
  });
  test('xarajat: kassir va xodim — 403; menejer — 200; takroriy opId — bir marta yoziladi', async () => {
    const body = { opId: 'exp-role-0001', amount: 50000, category: 'Transport', method: 'naqd' };
    assert.equal((await api(B, '/api/cloud/ops/expense', H.K, 'POST', body)).status, 403);
    assert.equal((await api(B, '/api/cloud/ops/expense', H.X, 'POST', body)).status, 403);
    const a = await (await api(B, '/api/cloud/ops/expense', H.M, 'POST', body)).json();
    const b = await (await api(B, '/api/cloud/ops/expense', H.M, 'POST', body)).json();
    assert.equal(a.ok, true); assert.equal(b.replayed, true); assert.equal(b.id, a.id);
    const j = await (await api(B, '/api/cloud/ops/journal?period=month', H.O)).json();
    assert.equal(j.rows.filter((r) => r.type === 'expense').length, 1, 'jurnalda bitta xarajat');
  });
  test('AI yordamchi — xodim 403; menejer — javob (faqat o‘qish)', async () => {
    assert.equal((await api(B, '/api/cloud/ops/ai', H.X, 'POST', { question: 'Bugun qancha sof foyda qildim?' })).status, 403);
    const r = await api(B, '/api/cloud/ops/ai', H.M, 'POST', { question: 'Bugun qancha sof foyda qildim?' });
    assert.equal(r.status, 200); assert.ok((await r.json()).text);
  });
  test('eksport: xodim mahsulotlarni yuklay olmaydi; egasi xlsx oladi (haqiqiy .xlsx)', async () => {
    assert.equal((await api(B, '/api/cloud/ops/export?sheet=products', H.X)).status, 403);
    assert.equal((await api(B, '/api/cloud/ops/export?sheet=report', H.K)).status, 403);
    const r = await api(B, '/api/cloud/ops/export?sheet=report&period=month', H.O);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /spreadsheetml/);
    const rows = X.readXlsx(Buffer.from(await r.arrayBuffer()));
    assert.equal(rows[1][0], 'Daromad (sotuv)');
    const p = await api(B, '/api/cloud/ops/export?sheet=products', H.O);
    assert.equal(X.readXlsx(Buffer.from(await p.arrayBuffer()))[0][0], 'Nomi');
  });
  test('import: xodim — 403; buzuq fayl — 400; quruq (dry) tekshiruv — xato ro‘yxati', async () => {
    const rows = [['Nomi', 'Artikul', 'Kirish narxi', 'Sotish narxi'], ['A tovar', 'X-1', 1, 2], ['B tovar', 'x-1', 1, 2]];
    const buf = X.writeXlsx([{ name: 'Tovarlar', rows }]);
    assert.equal((await bin('POST', `${B}/api/cloud/ops/import?dry=1`, buf, H.X)).status, 403);
    const bad = await bin('POST', `${B}/api/cloud/ops/import?dry=1`, Buffer.from('bu xlsx emas'), H.O);
    assert.equal(bad.status, 400); assert.equal((await bad.json()).error, 'bad_file');
    const dry = await (await bin('POST', `${B}/api/cloud/ops/import?dry=1`, buf, H.O)).json();
    assert.equal(dry.ok, false);
    assert.ok(dry.errors.some((e) => /takrorlangan/.test(e.message)), 'artikul takrori');
  });
  test('import: to‘g‘ri fayl — egasi yuklaydi; tovarlar paydo bo‘ladi', async () => {
    const before = (await (await api(B, '/api/cloud/ops/state', H.O)).json()).products.length;
    const rows = [['Nomi', 'Artikul', 'Kirish narxi', 'Sotish narxi', 'Miqdor', 'Valyuta'],
      ['Shakar 1kg', 'SH-1', 9000, 12000, 50, 'UZS'], ['Yog‘ 1L', 'YOG-1', 15000, 19000, 20, 'UZS']];
    const r = await bin('POST', `${B}/api/cloud/ops/import?opId=imp-test-0001`, X.writeXlsx([{ name: 'Tovarlar', rows }]), H.O);
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.equal(j.imported, 2); assert.equal(j.creates, 2);
    const after = (await (await api(B, '/api/cloud/ops/state', H.O)).json()).products;
    assert.equal(after.length, before + 2);
    assert.ok(after.some((p) => p.name === 'Shakar 1kg' && p.sku === 'SH-1'));
  });
});

// ---------------------------------------------------------------- sotuv, zaxira, 409, manfiy qoldiq
describe('sotuv: zaxira tekshiruvi, 409 va egasi ruxsati', () => {
  let srv, B, H, pid;
  before(async () => {
    srv = await startServer(tempDir('v11sale')); B = srv.base; H = await registerShop(B);
    const m = await (await api(B, '/api/cloud/ops/product', H.O, 'POST', Object.assign({ opId: 'p-un-0001', initialQty: 10 }, UN))).json();
    pid = m.id;
    assert.equal((await api(B, '/api/cloud/ops/activate', H.O, 'POST', {})).status, 200);
  });
  after(async () => { await srv.stop(); });

  test('sotuv (qarzga) — posted=1, qoldiq kamayadi, daromad va tannarx to‘g‘ri', async () => {
    const r = await putBlob(B, H.O, [{ id: 'c1', name: 'Aziz', transactions: [sale('t1', pid, 2, 150000)] }]);
    assert.equal(r.status, 200); assert.equal((await r.json()).posted, 1);
    const st = await (await api(B, '/api/cloud/ops/state', H.O)).json();
    assert.equal(st.products[0].qtyMilli, 8000);
    const sum = await (await api(B, '/api/cloud/ops/summary?period=month', H.O)).json();
    assert.equal(sum.pnl.revenue, 300000);
    assert.equal(sum.pnl.cogs, 200000);
    assert.equal(sum.pnl.grossProfit, 100000);
  });
  test('kassir ham sotadi (yozish huquqi bor, tovar bog‘lanadi)', async () => {
    const d = await getBlob(B, H.O);
    d.clients[0].transactions.push(sale('t-kas', pid, 1, 150000));
    const r = await putBlob(B, H.K, d.clients);
    assert.equal(r.status, 200); assert.equal((await r.json()).posted, 1);
  });
  test('zaxira yetmasa — xodim uchun 409, butun yozuv saqlanmaydi, qoldiq o‘zgarmaydi', async () => {
    const d = await getBlob(B, H.X);
    d.clients[0].transactions.push(sale('t-big', pid, 20, 150000));
    const r = await putBlob(B, H.X, d.clients);
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.equal(j.error, 'stock_insufficient');
    assert.equal(j.lines[0].needOwner, true, 'xodim egasidan so‘rashi kerak');
    assert.equal(j.lines[0].need, 20000); assert.equal(j.lines[0].have, 7000);
    const after = await getBlob(B, H.O);
    assert.ok(!after.clients[0].transactions.some((t) => t.id === 't-big'), 'rad etilgan yozuv saqlanmadi');
    assert.equal((await (await api(B, '/api/cloud/ops/state', H.O)).json()).products[0].qtyMilli, 7000);
  });
  test('egasi allowNegative bilan — o‘tadi, qoldiq manfiy, /state da ko‘rinadi', async () => {
    const d = await getBlob(B, H.O);
    const t = sale('t-own', pid, 20, 150000); t.items[0].allowNegative = true;
    d.clients[0].transactions.push(t);
    const r = await putBlob(B, H.O, d.clients);
    assert.equal(r.status, 200);
    const st = await (await api(B, '/api/cloud/ops/state', H.O)).json();
    assert.equal(st.products[0].qtyMilli, -13000);
    assert.equal(st.products[0].status, 'out');
  });
  test('xodim allowNegative yuborsa ham — serverda rad etiladi (faqat egasi)', async () => {
    const d = await getBlob(B, H.X);
    const t = sale('t-xodim-neg', pid, 1, 150000); t.items[0].allowNegative = true;
    d.clients[0].transactions.push(t);
    const r = await putBlob(B, H.X, d.clients);
    assert.equal(r.status, 409);
  });
});

// ---------------------------------------------------------------- bir vaqtdagi so‘rovlar (qulf)
describe('bir vaqtda kelgan yozuvlar: do‘kon qulfi', () => {
  let srv, B, H, pid;
  before(async () => {
    srv = await startServer(tempDir('v11race')); B = srv.base; H = await registerShop(B);
    pid = (await (await api(B, '/api/cloud/ops/product', H.O, 'POST', Object.assign({ opId: 'p-race-0001', initialQty: 10 }, UN))).json()).id;
    await api(B, '/api/cloud/ops/activate', H.O, 'POST', {});
  });
  after(async () => { await srv.stop(); });

  test('5 ta bir vaqtdagi PUT (har biri o‘z mijozi bilan) — hammasi saqlanadi; qulfsiz yo‘qolar edi', async () => {
    // Har so‘rov blobni o‘qiydi, kutadi, keyin yozadi. Qulf bo‘lmasa, oxirgi yozuv boshqalarni o‘chirib yuboradi.
    const reqs = [1, 2, 3, 4, 5].map((n) => putBlob(B, H.O, [{ id: 'cc' + n, name: 'Mijoz ' + n, transactions: [sale('tc' + n, pid, 1, 150000)] }]));
    const res = await Promise.all(reqs);
    assert.deepEqual(res.map((r) => r.status), [200, 200, 200, 200, 200]);
    const blob = await getBlob(B, H.O);
    assert.deepEqual(blob.clients.map((c) => c.id).sort(), ['cc1', 'cc2', 'cc3', 'cc4', 'cc5'], 'hech bir mijoz yo‘qolmadi');
    const st = await (await api(B, '/api/cloud/ops/state', H.O)).json();
    assert.equal(st.products[0].qtyMilli, 5000);
    const j = await (await api(B, '/api/cloud/ops/journal?period=month', H.O)).json();
    assert.equal(j.rows.filter((r) => r.type === 'sale' && r.kind === 'entry').length, 5);
  });
  test('bir vaqtdagi oversell urinishi: zaxira 5 ta qoldi, 3 + 3 — bittasi 200, ikkinchisi 409', async () => {
    const a = putBlob(B, H.O, [{ id: 'oa', name: 'A', transactions: [sale('oa1', pid, 3, 150000)] }]);
    const b = putBlob(B, H.O, [{ id: 'ob', name: 'B', transactions: [sale('ob1', pid, 3, 150000)] }]);
    const [ra, rb] = await Promise.all([a, b]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
    const st = await (await api(B, '/api/cloud/ops/state', H.O)).json();
    assert.equal(st.products[0].qtyMilli, 2000, 'oversell bo‘lmadi');
  });
});

// Supabase rejimi: har get/put — haqiqiy asinxron so‘rov. Qulf aynan shu oynani yopadi (mahalliy rejimda oyna yo‘q).
// Fake PostgREST — server.test.js dagi bilan bir xil shartnoma (qd_cloud jadvali, kind/key filtrlari).
function fakeSupabase() {
  const rows = new Map();
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/rest/v1/qd_cloud')) { res.statusCode = 404; return res.end(); }
    if (req.headers.apikey !== 'svc-test-key') { res.statusCode = 401; return res.end('{}'); }
    const body = await new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
    const filters = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (k === 'kind' || k === 'key') { const m = /^eq\.(.*)$/.exec(v); if (m) filters.push((r) => String(r[k]) === m[1]); }
    }
    const matching = () => [...rows.values()].filter((r) => filters.every((f) => f(r)));
    // sun’iy kechikish: haqiqiy tarmoq/DB kechikishi (bu yerda qulf nima uchun kerakligini ko‘rsatadi)
    await sleep(15);
    if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(matching())); }
    if (req.method === 'POST') {
      for (const r of JSON.parse(body || '[]')) rows.set(r.kind + '|' + r.key, { kind: r.kind, key: r.key, value: r.value, updated_at: r.updated_at });
      res.statusCode = 201; return res.end();
    }
    res.statusCode = 405; return res.end();
  });
  return { srv, rows };
}
describe('bir vaqtda kelgan yozuvlar: Supabase rejimi (asinxron saqlash)', () => {
  let fk, srv, B, H, pid;
  before(async () => {
    fk = fakeSupabase();
    await new Promise((r) => fk.srv.listen(0, '127.0.0.1', r));
    const fakeBase = `http://127.0.0.1:${fk.srv.address().port}`;
    srv = await startServer(tempDir('v11sb'), { SUPABASE_URL: fakeBase, SUPABASE_SERVICE_KEY: 'svc-test-key' });
    B = srv.base; H = await registerShop(B);
    pid = (await (await api(B, '/api/cloud/ops/product', H.O, 'POST', Object.assign({ opId: 'p-sb-0001', initialQty: 10 }, UN))).json()).id;
    await api(B, '/api/cloud/ops/activate', H.O, 'POST', {});
  });
  after(async () => { await srv.stop(); await new Promise((r) => fk.srv.close(r)); });

  test('5 ta bir vaqtdagi PUT — hech bir mijoz yo‘qolmaydi (qulf real I/O bilan)', async () => {
    const reqs = [1, 2, 3, 4, 5].map((n) => putBlob(B, H.O, [{ id: 'sb' + n, name: 'Mijoz ' + n, transactions: [sale('tsb' + n, pid, 1, 150000)] }]));
    const res = await Promise.all(reqs);
    assert.deepEqual(res.map((r) => r.status), [200, 200, 200, 200, 200]);
    const blob = await getBlob(B, H.O);
    assert.deepEqual(blob.clients.map((c) => c.id).sort(), ['sb1', 'sb2', 'sb3', 'sb4', 'sb5'], 'yozuvlar yo‘qolmadi');
    assert.equal((await (await api(B, '/api/cloud/ops/state', H.O)).json()).products[0].qtyMilli, 5000);
  });
});

// ---------------------------------------------------------------- qayta ishga tushirish, saqlash, aktivlashtirish bazasi
describe('saqlash: qayta ishga tushirish va aktivlashtirishdan oldingi yozuvlar', () => {
  test('qayta ishga tushirilgandan keyin ham qoldiq, kalitlar va jurnal saqlanadi (ikki marta yozilmaydi)', async () => {
    const dir = tempDir('v11persist');
    let srv = await startServer(dir); let B = srv.base; let H = await registerShop(B);
    const pid = (await (await api(B, '/api/cloud/ops/product', H.O, 'POST', Object.assign({ opId: 'p-per-0001', initialQty: 10 }, UN))).json()).id;
    await api(B, '/api/cloud/ops/activate', H.O, 'POST', {});
    const body = [{ id: 'c1', name: 'Aziz', transactions: [sale('tp1', pid, 3, 150000)] }];
    assert.equal((await putBlob(B, H.O, body)).status, 200);
    await srv.stop();

    srv = await startServer(dir); B = srv.base;
    try {
      const st = await (await api(B, '/api/cloud/ops/state', H.O)).json();
      assert.equal(st.products[0].qtyMilli, 7000, 'qoldiq qayta yuklangandan keyin saqlangan');
      const r = await putBlob(B, H.O, body);
      assert.equal(r.status, 200); assert.equal((await r.json()).posted, 0, 'kalit saqlangan — qayta yozilmadi');
      const st2 = await (await api(B, '/api/cloud/ops/state', H.O)).json();
      assert.equal(st2.products[0].qtyMilli, 7000);
    } finally { await srv.stop(); }
  });

  test('aktivlashtirishdan oldingi sotuv jurnalga tushmaydi; keyingisi tushadi', async () => {
    const srv = await startServer(tempDir('v11base')); const B = srv.base; const H = await registerShop(B);
    try {
      const pid = (await (await api(B, '/api/cloud/ops/product', H.O, 'POST', Object.assign({ opId: 'p-base-0001', initialQty: 10 }, UN))).json()).id;
      const old = [{ id: 'c1', name: 'Aziz', transactions: [sale('told', pid, 4, 150000, Date.now() - 3 * DAY)] }];
      assert.equal((await putBlob(B, H.O, old)).status, 200);
      await api(B, '/api/cloud/ops/activate', H.O, 'POST', {});
      const r1 = await putBlob(B, H.O, old);
      assert.equal((await r1.json()).posted, 0, 'boshlang‘ich holat — jurnalga kirmaydi');
      assert.equal((await (await api(B, '/api/cloud/ops/state', H.O)).json()).products[0].qtyMilli, 10000, 'zaxira o‘zgarmadi');
      old[0].transactions.push(sale('tnew', pid, 1, 150000));
      const r2 = await putBlob(B, H.O, old);
      assert.equal((await r2.json()).posted, 1);
      assert.equal((await (await api(B, '/api/cloud/ops/state', H.O)).json()).products[0].qtyMilli, 9000);
    } finally { await srv.stop(); }
  });
});
