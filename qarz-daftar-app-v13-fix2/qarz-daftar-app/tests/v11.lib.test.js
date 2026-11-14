'use strict';
// Qarzim v11 — hisob-kitob testlari (serversiz). Ombor o'rtacha tannarxi, teskari yozuv, proyeksiya, P&L, kassa, xlsx, AI.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const APP = process.env.QD_APP || (require('fs').existsSync(path.resolve(__dirname, '..', 'server.js')) ? path.resolve(__dirname, '..') : path.resolve(__dirname, '..', 'src', 'qarz-daftar-app'));
const O = require(path.join(APP, 'lib', 'ops.js'));
const X = require(path.join(APP, 'lib', 'xlsx.js'));
const AI = require(path.join(APP, 'lib', 'ai.js'));
const { planImport, periodOf } = require(path.join(APP, 'lib', 'ops-http.js'));
const H = O.helpers;

const NOW = Date.parse('2026-11-09T10:00:00+05:00');
const TODAY = H.dayOf(NOW);
const owner = (now = NOW, rates = { USD: 12000 }) => ({ actor: 'owner', byName: 'Egasi', role: 'owner', now, rates });
const staff = (role, now = NOW, rates = { USD: 12000 }) => ({ actor: role, byName: role, role, now, rates });
const run = (ops, clients, ctx) => { const r = O.projectBlob(ops, clients, ctx); if (r.ok) O.commitProjection(ops, r, ctx.now); return r; };
function freshShop(extraProducts = []) {
  const ops = O.newOps();
  const c = owner();
  const p = O.saveProduct(ops, { opId: 'pr-' + Math.random(), name: 'Un 50kg', cur: 'UZS', buyPrice: 100000, sellPrice: 150000, minQty: 5, initialQty: 10 }, c);
  assert.ok(p.ok, p.message);
  for (const x of extraProducts) O.saveProduct(ops, Object.assign({ opId: 'pr-' + Math.random() }, x), c);
  O.activate(ops, c);
  return { ops, pid: p.id, c };
}

describe('ombor: o‘rtacha tannarx va qoldiq', () => {
  test('o‘rtacha tannarx kirimlardan hisoblanadi', () => {
    const st = {};
    O.stockApply(st, 'a', 10000, 1000000);       // 10 dona, 100 000 dan
    O.stockApply(st, 'a', 10000, 2000000);       // 10 dona, 200 000 dan
    const cost = O.stockApply(st, 'a', -5000, null);   // 5 dona chiqdi
    assert.equal(cost, 750000);                  // 5 × 150 000
    assert.deepEqual([st.a.qty, st.a.value], [15000, 2250000]);
  });
  test('manfiy qoldiq faqat ruxsat bilan, o‘rtacha birlik tannarxida', () => {
    const st = {};
    O.stockApply(st, 'a', 5000, 500000);         // 5 dona, 100 000 dan
    const cost = O.stockApply(st, 'a', -8000, null);  // 5 dona bor, 3 dona manfiy
    assert.equal(cost, 500000 + 300000);
    assert.equal(st.a.qty, -3000);
  });
  test('sotuv va uning teskarisi (kirim) — qoldiq va qiymat aniq tiklanadi (tasodifiy ketma-ketliklar)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 200; trial++) {
      const st = {};
      for (let i = 0; i < 4; i++) O.stockApply(st, 'x', Math.round(rnd() * 9000) + 1000, Math.round(rnd() * 900000) + 1000);
      const before = JSON.stringify(st.x);
      const q = Math.round(rnd() * 3000) + 1;
      const cost = O.stockApply(st, 'x', -q, null);
      O.stockApply(st, 'x', q, cost);             // teskari yozuv: asl tannarx bilan
      assert.equal(JSON.stringify(st.x), before, 'trial ' + trial);
    }
  });
  test('stockReplay saqlangan tannarxni qayta hisoblash bilan solishtiradi (drift = 0)', () => {
    const { ops, pid } = freshShop();
    run(ops, [{ id: 'c', transactions: [{ id: 't', type: 'debt', amount: 300000, ts: NOW + 5000, items: [{ name: 'Un', qty: 2, price: 150000, productId: pid }] }] }], staff('owner'));
    assert.equal(O.stockReplay(ops.moves).drift, 0);
  });
});

describe('qarz daftaridan jurnal (proyeksiya)', () => {
  test('faollashtirilmagan — hech narsa yozilmaydi', () => {
    const ops = O.newOps();
    const r = O.projectBlob(ops, [{ id: 'c', transactions: [{ id: 't', type: 'debt', amount: 1000, ts: NOW }] }], owner());
    assert.equal(r.entries.length, 0);
  });
  test('qarzga sotuv: daromad bor, kassa yo‘q; to‘lov naqd — kassaga; otkazma — kutilmoqda', () => {
    const { ops, pid, c } = freshShop();
    const t0 = NOW + 1000;
    const clients = [{ id: 'c1', name: 'Aziz', cur: 'UZS', transactions: [
      { id: 't1', type: 'debt', amount: 300000, ts: t0, date: 'a', items: [{ name: 'Un 50kg', qty: 2, price: 150000, productId: pid }] },
      { id: 't2', type: 'payment', amount: 100000, ts: t0 + 1, method: 'naqd' },
      { id: 't3', type: 'payment', amount: 50000, ts: t0 + 2, method: 'otkazma' },
    ] }];
    run(ops, clients, staff('owner'));
    const day = TODAY;
    const p = O.pnl(ops, day, day);
    assert.equal(p.revenue, 300000);
    assert.equal(p.cogs, 200000);
    assert.equal(p.grossProfit, 100000);
    const cash = O.cashReport(ops, day, day, {});
    assert.equal(cash.byCurrency.UZS.inflow, 100000, 'faqat tasdiqlangan naqd kassaga');
    assert.equal(cash.byCurrency.UZS.pendingCount, 1);
    const pend = ops.entries.find((e) => e.status === 'pending');
    assert.ok(O.confirmPayment(ops, { opId: 'cf-' + pend.id, entryId: pend.id }, owner()).ok);
    assert.equal(O.cashReport(ops, day, day, {}).byCurrency.UZS.inflow, 150000, 'tasdiqlangandan keyin kassaga');
    void c;
  });
  test('usul ko‘rsatilmagan to‘lov — kutilmoqda (kassaga naqd sifatida tushmaydi)', () => {
    const { ops, pid } = freshShop();
    const t0 = NOW + 1000;
    run(ops, [{ id: 'c1', cur: 'UZS', transactions: [
      { id: 't1', type: 'debt', amount: 150000, ts: t0, items: [{ name: 'Un', qty: 1, price: 150000, productId: pid }] },
      { id: 't2', type: 'payment', amount: 40000, ts: t0 + 1 },
    ] }], staff('owner'));
    const pay = ops.entries.find((e) => e.type === 'payment');
    assert.equal(pay.method, O.UNKNOWN_METHOD); assert.equal(pay.status, 'pending'); assert.equal(pay.cashMinor, 0);
    assert.equal(O.cashReport(ops, TODAY, TODAY, {}).byCurrency.UZS.inflow, 0);
  });
  test('kalit bo‘yicha idempotent: qayta proyeksiya hech narsa qo‘shmaydi', () => {
    const { ops, pid } = freshShop();
    const clients = [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: 150000, ts: NOW + 1, items: [{ name: 'x', qty: 1, price: 150000, productId: pid }] }] }];
    run(ops, clients, staff('owner'));
    const n = ops.entries.length, m = ops.moves.length;
    const again = O.projectBlob(ops, clients, staff('owner'));
    assert.equal(again.entries.length + again.moves.length, 0);
    assert.equal(ops.entries.length, n); assert.equal(ops.moves.length, m);
  });
  test('tahrir = teskari yozuv + yangi yozuv; bekor qilish — zaxira va daromad tiklanadi', () => {
    const { ops, pid } = freshShop();
    const mk = (amt) => [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: amt, ts: NOW + 1, items: [{ name: 'Un', qty: 2, price: amt / 2, productId: pid }] }] }];
    run(ops, mk(300000), staff('owner'));
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, 8000);
    run(ops, mk(400000), staff('owner'));                   // tahrir: 2 dona, boshqa narx
    const active = ops.entries.filter((e) => e.type === 'sale' && !e.reversedBy);
    assert.equal(active.length, 1);
    assert.equal(active[0].amountMinor, 400000);
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, 8000, 'miqdor o‘zgarmagan');
    run(ops, [{ id: 'c', cur: 'UZS', transactions: [] }], staff('owner'));   // bekor (tombstone)
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, 10000);
    assert.equal(O.pnl(ops, TODAY, TODAY).revenue, 0);
    assert.equal(O.pnl(ops, TODAY, TODAY).cogs, 0);
  });
  test('zaxira yetmasa — butun yozuv rad etiladi, hech narsa o‘zgarmaydi', () => {
    const { ops, pid } = freshShop();
    const before = { e: ops.entries.length, m: ops.moves.length, k: Object.keys(ops.keys).length };
    const r = O.projectBlob(ops, [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: 9e6, ts: NOW + 1, items: [{ name: 'Un', qty: 99, price: 1, productId: pid }] }] }], staff('manager'));
    assert.equal(r.ok, false);
    assert.equal(r.errors[0].needOwner, true);
    assert.equal(ops.entries.length, before.e); assert.equal(ops.moves.length, before.m);
  });
  test('egasi manfiy qoldiqqa ruxsat bersa — sotuv o‘tadi va qoldiq manfiy bo‘ladi', () => {
    const { ops, pid } = freshShop();
    const r = run(ops, [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: 1e6, ts: NOW + 1, items: [{ name: 'Un', qty: 12, price: 83333, productId: pid, allowNegative: true }] }] }], staff('owner'));
    assert.equal(r.ok, true);
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, -2000);
    assert.equal(O.stockSummary(ops, {}).negative, 1);
  });
  test('faollashtirishdan oldingi yozuv — jurnalga kirmaydi (boshlang‘ich holat)', () => {
    const { ops, pid } = freshShop();
    const old = [{ id: 'c', cur: 'UZS', transactions: [{ id: 'old', type: 'debt', amount: 5000, ts: NOW - 86400e3 * 3, items: [{ name: 'Un', qty: 1, price: 5000, productId: pid }] }] }];
    assert.equal(O.projectBlob(ops, old, staff('owner')).entries.length, 0);
  });
  test('mahsulotsiz (erkin matnli) sotuv — "bog‘lanmagan" deb belgilanadi, tannarx hisobga kirmaydi', () => {
    const { ops } = freshShop();
    run(ops, [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: 70000, ts: NOW + 1, items: [{ name: 'Non', qty: 1, price: 70000 }] }] }], staff('owner'));
    const p = O.pnl(ops, TODAY, TODAY);
    assert.equal(p.revenue, 70000); assert.equal(p.cogs, 0); assert.equal(p.unlinkedSales, 1);
  });
  test('valyuta: USD sotuv UZS ga yozuv kursi bo‘yicha o‘tadi', () => {
    const ops = O.newOps();
    const sp = O.saveProduct(ops, { opId: 'x1-usd-1', name: 'Dollar tovar', cur: 'USD', buyPrice: 10, sellPrice: 20, initialQty: 5 }, owner());
    assert.ok(sp.ok, sp.message);
    O.activate(ops, owner());
    const pid = sp.id;
    const r = run(ops, [{ id: 'c', cur: 'USD', transactions: [{ id: 't', type: 'debt', amount: 20, ts: NOW + 1, cur: 'USD', items: [{ name: 'd', qty: 1, price: 20, productId: pid }] }] }], staff('owner', NOW, { USD: 12000 }));
    assert.equal(r.ok, true);
    const p = O.pnl(ops, TODAY, TODAY);
    assert.equal(p.revenue, 240000);   // 20 USD (2000 tiyin) × 12 000 so'm/USD = 240 000 so'm
    assert.equal(p.cogs, 120000);      // 1 dona × 10 USD tannarx (o‘rtacha) × 12 000
    assert.equal(p.grossProfit, 120000);
  });
});

describe('moliya: xarid, xarajat, kassa, P&L', () => {
  test('xarid — aktiv: foyda va xarajatga ta’sir qilmaydi, faqat to‘langan qism kassadan chiqadi', () => {
    const { ops, pid } = freshShop();
    const r = O.addPurchase(ops, { opId: 'pu-1-xx', cur: 'UZS', lines: [{ productId: pid, qty: 20, unitPrice: 100000 }], paid: 1000000, method: 'naqd' }, owner());
    assert.equal(r.total, 2000000); assert.equal(r.paid, 1000000);
    const p = O.pnl(ops, TODAY, TODAY);
    assert.equal(p.expenses, 0); assert.equal(p.netProfit, 0);
    const c = O.cashReport(ops, TODAY, TODAY, {});
    assert.equal(c.byCurrency.UZS.outflow, -1000000);
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, 30000);
  });
  test('xarid bekor qilinadi — zaxira va kassa asl holatiga qaytadi', () => {
    const { ops, pid } = freshShop();
    const pu = O.addPurchase(ops, { opId: 'pu-2-xx', cur: 'UZS', lines: [{ productId: pid, qty: 5, unitPrice: 100000 }], paid: 500000, method: 'naqd' }, owner());
    const rev = O.reverseManual(ops, { opId: 'rv-2-xx', entryId: pu.id, reason: 'Noto‘g‘ri kiritildi' }, owner());
    assert.ok(rev.ok, rev.message);
    assert.equal(O.stockSummary(ops, {}).rows[0].qtyMilli, 10000);
    assert.equal(O.cashReport(ops, TODAY, TODAY, {}).byCurrency.UZS.closing, 0);
  });
  test('xarid valyutasi mahsulot valyutasiga mos bo‘lmasa — rad etiladi', () => {
    const { ops, pid } = freshShop();
    const r = O.addPurchase(ops, { opId: 'pu-3-xx', cur: 'USD', lines: [{ productId: pid, qty: 1, unitPrice: 1 }] }, owner());
    assert.equal(r.error, 'cur_mismatch');
  });
  test('xarajat: kategoriya bo‘lishi shart; P&L ga bir marta kiradi; bekor qilinsa chiqadi', () => {
    const { ops } = freshShop();
    assert.equal(O.addExpense(ops, { opId: 'ex-bad-1', amount: 1000, category: 'Yo‘q' }, owner()).error, 'bad_category');
    const e = O.addExpense(ops, { opId: 'ex-ok-1', amount: 200000, category: 'Transport', method: 'naqd' }, owner());
    assert.equal(O.pnl(ops, TODAY, TODAY).expenses, 200000);
    O.reverseManual(ops, { opId: 'rv-ex-1', entryId: e.id, reason: 'Xato yozuv' }, owner());
    assert.equal(O.pnl(ops, TODAY, TODAY).expenses, 0);
  });
  test('ikki marta yuborilgan opId — bir marta yoziladi', () => {
    const { ops } = freshShop();
    const a = O.addExpense(ops, { opId: 'same-op-1', amount: 1000, category: 'Boshqa' }, owner());
    const b = O.addExpense(ops, { opId: 'same-op-1', amount: 1000, category: 'Boshqa' }, owner());
    assert.equal(b.replayed, true); assert.equal(b.id, a.id);
    assert.equal(ops.entries.filter((e) => e.type === 'expense').length, 1);
  });
  test('kassa: boshlang‘ich + tasdiqlangan kirim − chiqim; hisoblangan qoldiq haqiqiy sanaga tuzatiladi', () => {
    const { ops } = freshShop();
    O.setCashStart(ops, { opId: 'cs-1-xx', day: TODAY, amount: 1000000, cur: 'UZS' }, owner());
    O.addExpense(ops, { opId: 'ex-c-1', amount: 300000, category: 'Maosh', method: 'naqd' }, owner());
    assert.equal(O.cashNative(ops, 'UZS', TODAY), 700000);
    const adj = O.addCashAdjust(ops, { opId: 'ca-1-xx', cur: 'UZS', counted: 650000, reason: 'Inventarizatsiya' }, owner());
    assert.equal(adj.amountMinor, -50000);
    assert.equal(O.cashNative(ops, 'UZS', TODAY), 650000);
  });
  test('kassa tuzatishi sababsiz rad etiladi', () => {
    const { ops } = freshShop();
    O.setCashStart(ops, { opId: 'cs-2-xx', day: TODAY, amount: 0, cur: 'UZS' }, owner());
    assert.equal(O.addCashAdjust(ops, { opId: 'ca-2-xx', cur: 'UZS', amount: 1000, reason: '' }, owner()).error, 'reason_required');
  });
  test('ombor: yaroqsiz (writeoff) zarar sifatida, qoldiq kamayadi; manfiy taqiqlanadi', () => {
    const { ops, pid } = freshShop();
    const w = O.manualMove(ops, { opId: 'wo-1-xx', productId: pid, kind: 'writeoff', qty: 3, reason: 'Yaroqsiz bo‘ldi' }, owner());
    assert.ok(w.ok); assert.equal(w.costMinor, 300000);
    assert.equal(O.pnl(ops, TODAY, TODAY).losses, 300000);
    assert.equal(O.manualMove(ops, { opId: 'wo-2-xx', productId: pid, kind: 'writeoff', qty: 100, reason: 'Test' }, owner()).error, 'stock_insufficient');
    assert.equal(O.manualMove(ops, { opId: 'wo-3-xx', productId: pid, kind: 'writeoff', qty: 1, reason: 'a' }, staff('manager')).error, 'reason_required');
  });
  test('inventarizatsiya (counted): ortiqcha — kirim, kam — chiqim; P&L ta’siri qiymatga teng', () => {
    const { ops, pid } = freshShop();
    const a = O.manualMove(ops, { opId: 'inv-1-xx', productId: pid, kind: 'adjust', counted: 12, reason: 'Hisob-kitob' }, owner());
    assert.ok(a.ok); assert.equal(a.qtyMilli, 2000);
    assert.equal(O.pnl(ops, TODAY, TODAY).losses, -200000, 'ortiqcha — daromad sifatida');
  });
  test('reversal: asl sana bo‘yicha yoziladi', () => {
    const { ops } = freshShop();
    const e = O.addExpense(ops, { opId: 'ex-d-1', amount: 1000, category: 'Boshqa', day: '2026-11-01' }, owner());
    const rv = O.reverseManual(ops, { opId: 'rv-d-1', entryId: e.id, reason: 'Xato' }, owner());
    assert.ok(rv.ok);
    assert.equal(ops.entries.find((x) => x.id === rv.id).day, '2026-11-01');
  });
});

describe('tekshiruv va validatsiya', () => {
  test('reconcile: proyeksiya to‘liq — kutilayotgan yozuv yo‘q', () => {
    const { ops, pid } = freshShop();
    const clients = [{ id: 'c', cur: 'UZS', transactions: [{ id: 't', type: 'debt', amount: 150000, ts: NOW + 1, items: [{ name: 'x', qty: 1, price: 150000, productId: pid }] }] }];
    run(ops, clients, staff('owner'));
    const rec = O.reconcile(ops, clients, {}, NOW);
    assert.equal(rec.pendingPostings, 0); assert.equal(rec.pendingReversals, 0); assert.equal(rec.stockDrift, 0);
  });
  test('mahsulot tahriri qisman: yuborilmagan maydonlar (narx, minimal, yetkazuvchi) o‘zgarmaydi', () => {
    // tannarxni ko‘rmaydigan rol arxivlasa yoki faqat id/archived yuborsa, narx 0 ga tushmasligi kerak
    const ops = O.newOps();
    const c = owner();
    const p = O.saveProduct(ops, { opId: 'pe-1-aa', name: 'Un 50kg', cur: 'UZS', buyPrice: 100000, sellPrice: 150000, minQty: 5, supplier: 'Un zavodi', description: 'premium' }, c);
    assert.ok(p.ok, p.message);
    const arc = O.saveProduct(ops, { opId: 'pe-2-aa', id: p.id, archived: true }, c);
    assert.ok(arc.ok, arc.message);
    const r = ops.products[p.id];
    assert.equal(r.archived, true);
    assert.equal(r.buyMinor, 100000);
    assert.equal(r.sellMinor, 150000);
    assert.equal(r.minMilli, 5000);
    assert.equal(r.supplier, 'Un zavodi');
    assert.equal(r.description, 'premium');
    assert.equal(r.cur, 'UZS');
    // nomini o‘zgartirish ham narxni saqlaydi
    const ren = O.saveProduct(ops, { opId: 'pe-3-aa', id: p.id, name: 'Un 50 kg premium' }, c);
    assert.ok(ren.ok, ren.message);
    assert.equal(ops.products[p.id].buyMinor, 100000);
    assert.equal(ops.products[p.id].name, 'Un 50 kg premium');
    // valyuta o‘zgarganda narx yuborilmasa — rad etiladi (eski narx boshqa valyutada bo‘lib qoladi)
    const bad = O.saveProduct(ops, { opId: 'pe-4-aa', id: p.id, cur: 'USD' }, c);
    assert.equal(bad.error, 'bad_price');
  });
  test('mahsulot: SKU, shtrix-kod va nom takrorlanmaydi; valyuta qoldiq bo‘lsa o‘zgarmaydi', () => {
    const { ops, pid, c } = freshShop();
    assert.equal(O.saveProduct(ops, { opId: 'v-1-xx', name: 'Un 50kg', cur: 'UZS', buyPrice: 1, sellPrice: 2 }, c).error, 'dup_name');
    O.saveProduct(ops, { opId: 'v-2-xx', name: 'Shakar', cur: 'UZS', sku: 'SH-1', barcode: '4780001112223', buyPrice: 1, sellPrice: 2 }, c);
    assert.equal(O.saveProduct(ops, { opId: 'v-3-xx', name: 'Boshqa', cur: 'UZS', sku: 'sh-1', buyPrice: 1, sellPrice: 2 }, c).error, 'dup_sku');
    assert.equal(O.saveProduct(ops, { opId: 'v-4-xx', name: 'Boshqa2', cur: 'UZS', barcode: '4780001112223', buyPrice: 1, sellPrice: 2 }, c).error, 'dup_barcode');
    assert.equal(O.saveProduct(ops, { opId: 'v-5-xx', id: pid, name: 'Un 50kg', cur: 'USD', buyPrice: 1, sellPrice: 2 }, c).error, 'cur_locked');
    assert.equal(O.saveProduct(ops, { opId: 'v-6-xx', name: 'Yomon', cur: 'UZS', sku: 'a b', buyPrice: 1, sellPrice: 2 }, c).error, 'bad_sku');
    assert.equal(O.saveProduct(ops, { opId: 'v-7-xx', name: 'Narxsiz', cur: 'UZS', buyPrice: -5, sellPrice: 2 }, c).error, 'bad_price');
  });
  test('operatsiya opId siz — rad etiladi', () => {
    const { ops } = freshShop();
    assert.equal(O.addExpense(ops, { amount: 1, category: 'Boshqa' }, owner()).error, 'bad_request');
  });
  test('davr: sana formati va chegaralar', () => {
    const sp = (o) => new URLSearchParams(o);
    assert.equal(periodOf(sp({ period: 'month' }), '2026-11-09').from, '2026-11-01');
    assert.equal(periodOf(sp({ period: 'week' }), '2026-11-09').from, '2026-11-09');   // Dushanba
    assert.equal(periodOf(sp({ period: 'custom', from: '2026-13-01', to: '2026-11-01' }), '2026-11-09').error !== undefined, true);
    assert.equal(periodOf(sp({ period: 'custom', from: '2026-11-05', to: '2026-11-01' }), '2026-11-09').error !== undefined, true);
    assert.ok(periodOf(sp({ period: 'custom', from: '2000-01-01', to: '2026-11-01' }), '2026-11-09').error);
  });
});

describe('xlsx: yozish, o‘qish, xavfsizlik', () => {
  test('yozilgan fayl qayta o‘qiladi (o‘zbekcha belgilar, sonlar, maxsus belgilar)', () => {
    const rows = [['Nomi', 'Narx', 'Izoh'], ['Un ʻoʻ ‘g‘ & <x>', 12345, 'a "b"'], ['Shakar', 0.5, '']];
    const buf = X.writeXlsx([{ name: 'Tovarlar', rows }]);
    const back = X.readXlsx(buf);
    assert.deepEqual(back[0], ['Nomi', 'Narx', 'Izoh']);
    assert.equal(back[1][0], 'Un ʻoʻ ‘g‘ & <x>');
    assert.equal(back[1][1], 12345);
    assert.equal(back[1][2], 'a "b"');
    assert.equal(back[2][1], 0.5);
  });
  test('formula in‘ektsiyasi: = + - @ bilan boshlangan matn qochiriladi', () => {
    const buf = X.writeXlsx([{ name: 'S', rows: [['Nomi'], ['=HYPERLINK("x")'], ['+1+1'], ['-cmd'], ['@SUM']] }]);
    const back = X.readXlsx(buf);
    assert.equal(back[1][0], '\'=HYPERLINK("x")');
    assert.equal(back[3][0], "'-cmd");
  });
  test('ZIP bo‘lmagan fayl rad etiladi', () => {
    assert.throws(() => X.readXlsx(Buffer.from('bu excel emas')), /ZIP|hajm/);
  });
  test('DOCTYPE/ENTITY bor XML rad etiladi (XXE); toza fayl esa o‘qiladi (nazorat)', () => {
    const files = X.readZip(X.writeXlsx([{ name: 'S', rows: [['Nomi'], ['a']] }]));
    const pack = (f) => X.zipStore(Object.entries(f).map(([name, s]) => ({ name, data: Buffer.from(s, 'utf8') })));
    assert.equal(X.readXlsx(pack(files))[1][0], 'a', 'nazorat: toza fayl o‘qilishi kerak');
    const evil = Object.assign({}, files, {
      'xl/worksheets/sheet1.xml': files['xl/worksheets/sheet1.xml'].replace('<sheetData>', '<!DOCTYPE x [<!ENTITY e "boom">]><sheetData>'),
    });
    assert.throws(() => X.readXlsx(pack(evil)), /XML xavfsizlik/);
  });
  test('katta fayl (2 MB dan ortiq) rad etiladi', () => {
    assert.throws(() => X.readXlsx(Buffer.alloc(X.MAX_FILE + 1)), /hajm/);
  });
  test('import rejasi: sarlavha, takror SKU, bo‘sh nom', () => {
    const { ops } = freshShop();
    const rows = [['Nomi', 'Artikul', 'Kirish narxi', 'Sotish narxi', 'Miqdor'], ['Yangi A', 'A-1', 1000, 2000, 5], ['', 'A-2', 1, 2, 1], ['Yangi B', 'a-1', 1, 2, 1]];
    const plan = planImport(rows, ops);
    assert.ok(plan.errors.some((e) => /bo‘sh/.test(e.message)));
    assert.ok(plan.errors.some((e) => /takror|Artikul/.test(e.message)));
    const none = planImport([['Boshqa', 'x']], ops);
    assert.ok(none.errors.length);
  });
});

describe('AI yordamchi: haqiqiy ma’lumot, belgilash, faqat o‘qish', () => {
  const day = (ms) => H.dayOf(ms);
  function sample() {
    const { ops, pid } = freshShop([{ name: 'Shakar', cur: 'UZS', buyPrice: 50000, sellPrice: 80000, minQty: 3, initialQty: 2 }]);
    const ctx = staff('owner');
    run(ops, [
      { id: 'c1', name: 'Aziz', cur: 'UZS', dueDate: '2026-10-01', transactions: [{ id: 't1', type: 'debt', amount: 300000, ts: NOW + 1, items: [{ name: 'Un 50kg', qty: 2, price: 150000, productId: pid }] }] },
    ], ctx);
    O.addExpense(ops, { opId: 'ai-ex-1', amount: 200000, category: 'Transport', method: 'naqd' }, owner());
    return { ops, pid };
  }
  test('savollar: sof foyda, top mahsulot, kechikkan qarz, omborda tugayotgan, xarajat', () => {
    const { ops } = sample();
    const clients = [{ id: 'c1', name: 'Aziz', cur: 'UZS', dueDate: '2026-10-01', transactions: [{ id: 't1', type: 'debt', amount: 300000, ts: NOW + 1 }] }];
    const ctx = { now: NOW, rates: {}, clients };
    const a1 = AI.answer(ops, 'Bugun qancha sof foyda qildim?', ctx);
    assert.equal(a1.intent, 'profit_today');
    assert.match(a1.text, /sof foyda/);
    assert.equal(AI.answer(ops, 'Qaysi mahsulotim eng ko‘p foyda keltiryapti?', ctx).intent, 'top_products');
    assert.equal(AI.answer(ops, 'Qaysi mijozlarning qarzi kechikmoqda?', ctx).intent, 'overdue');
    assert.match(AI.answer(ops, 'Qaysi mijozlarning qarzi kechikmoqda?', ctx).text, /1 ta mijoz/);
    assert.equal(AI.answer(ops, 'Omborda qaysi mahsulotlar tugayapti?', ctx).intent, 'low_stock');
    const ex = AI.answer(ops, 'Bu oy xarajatlarim qancha bo‘ldi?', ctx);
    assert.equal(ex.intent, 'expenses'); assert.match(ex.text, /200 000 so‘m/);
    assert.equal(AI.answer(ops, 'Qaysi mahsulotni ko‘proq sotib olishim kerak?', ctx).estimate, true);
    assert.equal(AI.answer(ops, 'Bu oy o‘tgan oy bilan solishtirganda qanday?', ctx).intent, 'compare');
  });
  test('faollashtirilmagan hisobda raqam aytilmaydi', () => {
    const ops = O.newOps();
    const a = AI.answer(ops, 'Bugun qancha sof foyda qildim?', { now: NOW, rates: {}, clients: [] });
    assert.match(a.text, /faollashtir/);
    assert.ok(!/so‘m/.test(a.text));
  });
  test('tushunilmagan savol — misollar ro‘yxati, hech narsa o‘ylab topilmaydi', () => {
    const { ops } = sample();
    const a = AI.answer(ops, 'ob-havo qanday?', { now: NOW, rates: {}, clients: [] });
    assert.equal(a.intent, 'unknown');
    assert.ok(a.bullets.length >= 5);
  });
  test('AI yozish operatsiyasi yo‘q: javob obyekti faqat matn va ro‘yxat', () => {
    const { ops } = sample();
    const before = JSON.stringify({ e: ops.entries, m: ops.moves, p: ops.products });
    AI.answer(ops, 'Kassada qancha pul bor?', { now: NOW, rates: {}, clients: [] });
    AI.answer(ops, 'Qarzlar o‘sib bormoqdami?', { now: NOW, rates: {}, clients: [] });
    assert.equal(JSON.stringify({ e: ops.entries, m: ops.moves, p: ops.products }), before);
  });
});
