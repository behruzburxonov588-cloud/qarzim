'use strict';
/* Qarzim v11 — /api/cloud/ops/* marshrutlari. Autentifikatsiya server.js dagi bulut tekshiruvidan keladi
 * (X-Qd-User + X-Qd-Auth). Har marshrut o'z ruxsatini tekshiradi; mutatsiyalar do'kon bo'yicha qulf ostida.
 */
const O = require('./ops');
const X = require('./xlsx');
const AI = require('./ai');
const H = O.helpers;

const P = { inv_view: 'inv_view', inv_edit: 'inv_edit', inv_move: 'inv_move', inv_adjust: 'inv_adjust',
  cash_view: 'cash_view', expense: 'expense', fin_reports: 'fin_reports', ai: 'ai' };
const ERR_STATUS = { stock_insufficient: 409, dup_name: 409, dup_sku: 409, dup_barcode: 409, in_use: 409, reversed: 409, already: 409,
  not_found: 404, bad_period: 400 };
const MUTATIONS = ['/product', '/category', '/category/delete', '/move', '/purchase', '/expense', '/cash-adjust', '/cash-start', '/payment/confirm', '/reverse', '/activate', '/ai'];

function createOpsHttp(deps) {
  const { store, acct, send, readBody, readRaw, withShopLock, rates: ratesFn, hasPerm, ROLES, save } = deps;

  const canFin = (role) => hasPerm(role, P.fin_reports) || hasPerm(role, P.cash_view);
  const canEmployee = (role) => hasPerm(role, P.fin_reports);
  const canSeeCost = (role) => hasPerm(role, P.inv_edit) || hasPerm(role, P.fin_reports);

  async function blobOf(shop) {
    try { return (await store.get('data', shop)) || { clients: [], lenders: [] }; } catch (e) { return null; }
  }
  const ctxOf = (c) => ({ actor: c.user, byName: c.me.username, role: c.role, now: Date.now(), rates: ratesFn() });

  function productsView(ops, role) {
    const st = O.stockSummary(ops, ratesFn());
    const costOk = canSeeCost(role);
    return st.rows.map((r) => {
      const p = ops.products[r.id] || {};
      const out = { id: r.id, name: r.name, sku: r.sku, barcode: r.barcode, category: r.category, supplier: r.supplier, cur: r.cur,
        sellMinor: r.sellMinor, minMilli: r.minMilli, qtyMilli: r.qtyMilli, archived: r.archived, status: r.status, description: p.description || null, updatedAt: p.updatedAt || null };
      if (costOk) { out.buyMinor = r.buyMinor; out.valueMinor = r.valueMinor; out.valueUzs = r.valueUzs; }
      return out;
    });
  }

  /** Mutatsiya marshrutining kerakli ruxsati. null — noma'lum marshrut. */
  function permFor(sub, b, ops) {
    const ok = (perm) => ({ ok: true, perm });
    switch (sub) {
      case '/product': return ok(P.inv_edit);
      case '/category': case '/category/delete': return ok(b.kind === 'expense' ? P.expense : P.inv_edit);
      case '/move': return ok(b.kind === 'adjust' ? P.inv_adjust : P.inv_move);
      case '/purchase': return ok(P.inv_move);
      case '/expense': return ok(P.expense);
      case '/cash-adjust': case '/cash-start': case '/payment/confirm': return ok(P.cash_view);
      case '/activate': return ok(P.fin_reports);
      case '/ai': return ok(P.ai);
      case '/reverse': {
        if (b.moveId) {
          const m = ops.moves.find((x) => x.id === b.moveId);
          return ok(m && m.kind === 'adjust' ? P.inv_adjust : P.inv_move);
        }
        const e = ops.entries.find((x) => x.id === b.entryId);
        if (!e) return ok(P.cash_view);
        return ok(e.type === 'purchase' ? P.inv_move : e.type === 'expense' ? P.expense : P.cash_view);
      }
      default: return null;
    }
  }
  function dispatchMutation(sub, b, ops, ctx) {
    switch (sub) {
      case '/product': return O.saveProduct(ops, b, ctx);
      case '/category': return O.addCategory(ops, b, ctx);
      case '/category/delete': return O.deleteCategory(ops, b, ctx);
      case '/move': return O.manualMove(ops, b, ctx);
      case '/purchase': return O.addPurchase(ops, b, ctx);
      case '/expense': return O.addExpense(ops, b, ctx);
      case '/cash-adjust': return O.addCashAdjust(ops, b, ctx);
      case '/cash-start': return O.setCashStart(ops, b, ctx);
      case '/payment/confirm': return O.confirmPayment(ops, b, ctx);
      case '/reverse': return O.reverseManual(ops, b, ctx);
      case '/activate': return O.activate(ops, ctx);
      default: return null;
    }
  }

  /** Marshrutni boshqaradi. true — javob yuborildi; false — bu marshrut emas. */
  async function handle(req, res, p, c) {
    const sub = p.replace(/^\/api\/cloud\/ops/, '') || '/';
    const role = c.role, shop = c.shop, method = req.method;
    const ops = O.ensureOps(acct(shop));
    const url = new URL(req.url, 'http://x');

    if (sub === '/me' && method === 'GET') {
      send(res, 200, { role, perms: ROLES[role] || [], activated: !!ops.activeFrom, activeFrom: ops.activeFrom, lastSync: ops.lastSync,
        expenseCats: ops.expenseCats, productCats: ops.productCats, currencies: O.CURS, methods: O.METHODS });
      return true;
    }
    if (sub === '/ai/examples' && method === 'GET') {
      if (!hasPerm(role, P.ai)) { send(res, 403, { error: 'forbidden', need: 'ai' }); return true; }
      send(res, 200, { examples: AI.EXAMPLES });
      return true;
    }
    if (sub === '/state' && method === 'GET') {
      if (!hasPerm(role, P.inv_view)) { send(res, 403, { error: 'forbidden', need: 'inv_view' }); return true; }
      const products = productsView(ops, role);
      send(res, 200, { activated: !!ops.activeFrom, activeFrom: ops.activeFrom, lastSync: ops.lastSync, products,
        productCats: ops.productCats, expenseCats: ops.expenseCats, cashStart: canFin(role) ? ops.cashStart : null,
        canCost: canSeeCost(role), low: products.filter((x) => x.status === 'low').length, out: products.filter((x) => x.status === 'out').length });
      return true;
    }
    if (sub === '/summary' && method === 'GET') {
      if (!hasPerm(role, P.fin_reports)) { send(res, 403, { error: 'forbidden', need: 'fin_reports' }); return true; }
      const today = H.dayOf(Date.now());
      const range = periodOf(url.searchParams, today);
      if (range.error) { send(res, 400, { error: 'bad_period', message: range.error }); return true; }
      const blob = (await blobOf(shop)) || { clients: [] };
      const gb = ['day', 'week', 'month'].includes(url.searchParams.get('group')) ? url.searchParams.get('group') : (range.days <= 62 ? 'day' : range.days <= 370 ? 'week' : 'month');
      const rm = ratesFn();
      const sum = O.summaryFor(ops, range.from, range.to, rm);
      send(res, 200, {
        activated: !!ops.activeFrom, activeFrom: ops.activeFrom, lastSync: ops.lastSync, period: range, group: gb,
        pnl: sum.pnl, prevPnl: sum.prevPnl, prevPeriod: sum.prevPeriod, cash: sum.cash,
        series: O.periodRows(ops, range.from, range.to, gb),
        topProducts: sum.topProducts.slice(0, 10),
        byEmployee: canEmployee(role) ? sum.byEmployee : null,
        stock: O.stockSummary(ops, rm), debts: O.debtSummary(blob.clients || [], rm, today),
        reconcile: role === 'owner' || role === 'manager' ? O.reconcile(ops, blob.clients || [], rm, Date.now()) : null,
        rates: rm,
      });
      return true;
    }
    if (sub === '/journal' && method === 'GET') {
      if (!hasPerm(role, P.fin_reports)) { send(res, 403, { error: 'forbidden', need: 'fin_reports' }); return true; }
      const range = periodOf(url.searchParams, H.dayOf(Date.now()));
      if (range.error) { send(res, 400, { error: 'bad_period', message: range.error }); return true; }
      const rows = O.journalRows(ops, range.from, range.to);
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 200));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
      send(res, 200, { total: rows.length, rows: rows.slice(offset, offset + limit), period: range });
      return true;
    }
    if (sub === '/export' && method === 'GET') {
      const sheet = url.searchParams.get('sheet') || 'products';
      if (sheet === 'products' ? !hasPerm(role, P.inv_edit) : !hasPerm(role, P.fin_reports)) {
        send(res, 403, { error: 'forbidden', need: sheet === 'products' ? P.inv_edit : P.fin_reports }); return true;
      }
      const range = periodOf(url.searchParams, H.dayOf(Date.now()));
      if (range.error) { send(res, 400, { error: 'bad_period', message: range.error }); return true; }
      const buf = buildExport(ops, sheet, range, ratesFn());
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="qarzim-${sheet}-${range.from}_${range.to}.xlsx"`, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
      res.end(buf);
      return true;
    }
    if (sub === '/import' && method === 'POST') {
      if (!hasPerm(role, P.inv_edit)) { send(res, 403, { error: 'forbidden', need: P.inv_edit }); return true; }
      let buf, rows;
      try { buf = await readRaw(req, X.MAX_FILE); rows = X.readXlsx(buf); }
      catch (e) { send(res, 400, { error: 'bad_file', message: e.message || 'Faylni o‘qib bo‘lmadi' }); return true; }
      const plan = planImport(rows, ops);
      if (url.searchParams.get('dry') === '1' || plan.errors.length) {
        send(res, 200, { dry: true, ok: plan.errors.length === 0, rows: plan.preview, errors: plan.errors.slice(0, 200), total: plan.items.length, creates: plan.creates, updates: plan.updates });
        return true;
      }
      const opId = String(url.searchParams.get('opId') || '');
      if (opId.length < 4 || opId.length > 80) { send(res, 400, { error: 'bad_request', message: 'opId kerak' }); return true; }
      await withShopLock(shop, async () => {
        const snap = JSON.parse(JSON.stringify({ products: ops.products, moves: ops.moves, productCats: ops.productCats, audit: ops.audit.length }));
        const seenBefore = new Set(Object.keys(ops.opSeen));
        const ctx = ctxOf(c);
        let done = 0, fail = null;
        for (const it of plan.items) {
          const r = O.saveProduct(ops, Object.assign({}, it.input, { opId: opId + ':' + it.row }), ctx);
          if (!r.ok) { fail = { row: it.row, message: r.message }; break; }
          done++;
        }
        if (fail) {
          // qisman yozilgan qatorlarning opId lari ham olib tashlanadi — aks holda tuzatilgan fayl qayta yuklanganda
          // bu qatorlar "takrorlangan" deb o‘tkazib yuboriladi va ma’lumot yo‘qoladi
          for (const k of Object.keys(ops.opSeen)) if (!seenBefore.has(k)) delete ops.opSeen[k];
          ops.products = snap.products; ops.moves = snap.moves; ops.productCats = snap.productCats; ops.audit.length = snap.audit;
          send(res, 400, { error: 'import_failed', message: 'Import bekor qilindi: ' + fail.message, row: fail.row });
          return;
        }
        O.audit(ops, ctx, 'import', 'xlsx', `${done} qator (${plan.creates} yangi, ${plan.updates} yangilangan)`);
        save();
        send(res, 200, { ok: true, imported: done, creates: plan.creates, updates: plan.updates });
      });
      return true;
    }

    // ---- mutatsiyalar (POST) ----
    if (method !== 'POST' || !MUTATIONS.includes(sub)) return false;
    const body = await readBody(req, 2e5).catch(() => null);
    if (!body || typeof body !== 'object') { send(res, 400, { error: 'bad_request' }); return true; }
    const need = permFor(sub, body, ops);
    if (!need) return false;
    if (!hasPerm(role, need.perm)) { send(res, 403, { error: 'forbidden', need: need.perm }); return true; }
    if (sub === '/ai') {
      const q = String(body.question || '').slice(0, 300).trim();
      if (q.length < 2) { send(res, 400, { error: 'bad_request', message: 'Savol yozing' }); return true; }
      const blob = (await blobOf(shop)) || { clients: [] };
      send(res, 200, AI.answer(ops, q, { now: Date.now(), rates: ratesFn(), clients: blob.clients || [] }));
      return true;
    }
    await withShopLock(shop, async () => {
      const r = dispatchMutation(sub, body, ops, ctxOf(c));
      if (r && r.ok) save();
      if (!r) return send(res, 404, { error: 'not_found' });
      if (!r.ok) return send(res, ERR_STATUS[r.error] || 400, r);
      return send(res, 200, r);
    });
    return true;
  }

  /** Qarz daftaridan jurnalni yangilash (ishga tushganda va soatlik). Xatolik — issues ga yoziladi. */
  async function projectShop(owner) {
    const ops = O.ensureOps(acct(owner));
    if (!ops.activeFrom) return { ok: true, skipped: true };
    return withShopLock(owner, async () => {
      const blob = await blobOf(owner);
      if (!blob) return { ok: false };
      const res = O.projectBlob(ops, blob.clients || [], { actor: 'tizim', byName: 'tizim', role: 'system', now: Date.now(), rates: ratesFn() });
      if (!res.ok) {
        ops.issues.push({ at: new Date().toISOString(), code: 'stock_insufficient', lines: res.errors.slice(0, 20) });
        if (ops.issues.length > 200) ops.issues.splice(0, ops.issues.length - 200);
        save();
        return { ok: false, errors: res.errors.length };
      }
      if (res.entries.length || res.moves.length || res.keyDels.length) { O.commitProjection(ops, res, Date.now()); save(); }
      return { ok: true, posted: res.entries.length };
    });
  }

  return { handle, projectShop, dispatchMutation };
}

/** Davr parametrlari: period (today|week|month|year|custom), from, to. */
function periodOf(sp, today) {
  const preset = sp.get('period') || 'month';
  let from = today, to = today;
  if (preset === 'today') from = today;
  else if (preset === 'week') { const dow = (new Date(Date.parse(today + 'T00:00:00Z')).getUTCDay() + 6) % 7; from = H.addDays(today, -dow); }
  else if (preset === 'year') from = today.slice(0, 4) + '-01-01';
  else if (preset === 'custom') {
    from = sp.get('from') || today; to = sp.get('to') || today;
    if (!H.isDay(from) || !H.isDay(to)) return { error: 'Sana formati YYYY-MM-DD bo‘lsin' };
    if (from > to) return { error: 'Boshlanish sanasi tugashidan katta bo‘lmasin' };
  } else from = today.slice(0, 8) + '01';
  const days = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1;
  if (days > 800) return { error: 'Davr 800 kundan oshmasin' };
  return { preset, from, to, days };
}

/** Excel import rejasi: sarlavha qatorini topadi, har qatorni tekshiradi. Asl ma'lumotga tegmaydi. */
function planImport(rows, ops) {
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[‘’ʻʼ'`\s]/g, '');
  const aliases = {
    name: ['nomi', 'name', 'tovar', 'mahsulot'], sku: ['artikul', 'sku', 'kod'], barcode: ['shtrixkod', 'barcode', 'shtrix', 'ean'],
    category: ['kategoriya', 'category', 'turi'], buyPrice: ['kirishnarxi', 'xaridnarxi', 'tannarx', 'buyprice'],
    sellPrice: ['sotishnarxi', 'sotuvnarxi', 'sellprice', 'narx'], cur: ['valyuta', 'currency', 'cur'],
    initialQty: ['miqdor', 'qoldiq', 'quantity', 'qty'], minQty: ['minimalqoldiq', 'minqoldiq', 'minimal'],
    supplier: ['yetkazibberuvchi', 'supplier', 'taminotchi'], description: ['tavsif', 'izoh', 'description'],
  };
  const hdrIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'nomi' || norm(c) === 'name'));
  if (hdrIdx < 0) return { items: [], errors: [{ row: 0, message: 'Sarlavha topilmadi: birinchi qatorda «Nomi» ustuni bo‘lishi kerak' }], preview: [], creates: 0, updates: 0 };
  const header = rows[hdrIdx];
  const map = {};
  for (const [field, names] of Object.entries(aliases)) {
    const i = header.findIndex((h) => names.includes(norm(h)));
    if (i >= 0) map[field] = i;
  }
  const items = [], errors = [], preview = [];
  let creates = 0, updates = 0;
  const seenNames = new Set(), seenSku = new Set(), seenBar = new Set();
  rows.slice(hdrIdx + 1).forEach((r, k) => {
    const rowNo = hdrIdx + 2 + k;
    if (!r.some((c) => String(c == null ? '' : c).trim() !== '')) return;
    const input = {};
    for (const f of Object.keys(map)) {
      const v = r[map[f]];
      if (v === undefined || v === '') continue;
      input[f] = typeof v === 'number' ? v : String(v).trim();
    }
    if (!input.name) { errors.push({ row: rowNo, message: 'Nomi bo‘sh' }); return; }
    const sku = input.sku ? String(input.sku) : '';
    const existing = sku ? Object.values(ops.products).find((p) => p.sku && p.sku.toLowerCase() === sku.toLowerCase()) : null;
    if (existing) { input.id = existing.id; delete input.initialQty; updates++; } else creates++;
    const nm = String(input.name).toLowerCase();
    if (seenNames.has(nm)) errors.push({ row: rowNo, message: `«${input.name}» fayl ichida takrorlangan` });
    seenNames.add(nm);
    if (sku) { if (seenSku.has(sku.toLowerCase())) errors.push({ row: rowNo, message: `Artikul ${sku} takrorlangan` }); seenSku.add(sku.toLowerCase()); }
    if (input.barcode) { const bc = String(input.barcode); if (seenBar.has(bc)) errors.push({ row: rowNo, message: `Shtrix-kod ${bc} takrorlangan` }); seenBar.add(bc); }
    // sinov: nusxa ustida
    const trial = Object.assign({}, ops, { products: Object.assign({}, ops.products), moves: [], productCats: ops.productCats.slice(), opSeen: {}, audit: [] });
    const r2 = O.saveProduct(trial, Object.assign({ opId: 'sinov-' + rowNo }, input), { actor: 'sinov', byName: 'sinov', role: 'owner', now: Date.now(), rates: {} });
    if (!r2.ok) errors.push({ row: rowNo, message: r2.message });
    items.push({ row: rowNo, input });
    if (preview.length < 50) preview.push({ row: rowNo, name: input.name, sku: sku, action: existing ? 'yangilash' : 'yangi', initialQty: input.initialQty || '' });
  });
  return { items, errors, preview, creates, updates };
}

/** Eksport: xlsx bayt massivi. */
function buildExport(ops, sheet, range, rates) {
  if (sheet === 'products') {
    const st = O.stockSummary(ops, rates);
    const rows = [['Nomi', 'Artikul', 'Shtrix-kod', 'Kategoriya', 'Kirish narxi', 'Sotish narxi', 'Valyuta', 'Qoldiq', 'Minimal qoldiq', 'Yetkazib beruvchi', 'Holat', 'Qiymat (UZS)']];
    for (const r of st.rows) {
      const sc = r.cur === 'UZS' ? 1 : 100;
      rows.push([r.name, r.sku || '', r.barcode || '', r.category || '', r.buyMinor / sc, r.sellMinor / sc, r.cur, r.qtyMilli / 1000, r.minMilli / 1000,
        r.supplier || '', r.archived ? 'arxiv' : r.status === 'out' ? 'tugagan' : r.status === 'low' ? 'kam' : 'yetarli', r.valueUzs == null ? '' : Math.round(r.valueUzs)]);
    }
    return X.writeXlsx([{ name: 'Tovarlar', rows, widths: [32, 14, 16, 18, 14, 14, 9, 12, 14, 22, 12, 16] }]);
  }
  if (sheet === 'journal') {
    const rows = [['Sana', 'Vaqt', 'Tur', 'Summa (asl)', 'Valyuta', 'Summa (UZS)', 'Kassa ta’siri', 'Usul', 'Holat', 'Kim', 'Izoh']];
    for (const r of O.journalRows(ops, range.from, range.to).filter((x) => x.kind === 'entry').reverse()) {
      const cur = r.cur || 'UZS', sc = cur === 'UZS' ? 1 : 100;
      rows.push([r.day, (r.at || '').replace('T', ' ').slice(0, 16), r.reversedKind ? 'bekor: ' + r.reversedKind : r.type, r.amountMinor / sc, cur,
        r.uzsMinor == null ? '' : r.uzsMinor, r.cashMinor / sc, r.method || '', r.status || '', r.by || '', r.category || r.supplier || '']);
    }
    return X.writeXlsx([{ name: 'Jurnal', rows, widths: [12, 18, 16, 16, 9, 16, 16, 12, 12, 16, 22] }]);
  }
  const pnl = O.pnl(ops, range.from, range.to);
  const prev = O.prevRange(range.from, range.to);
  const pp = O.pnl(ops, prev.from, prev.to);
  const cash = O.cashReport(ops, range.from, range.to, rates);
  const series = O.periodRows(ops, range.from, range.to, range.days <= 62 ? 'day' : range.days <= 370 ? 'week' : 'month');
  const sum = [['Ko‘rsatkich', 'Joriy davr (UZS)', 'Oldingi davr (UZS)'],
    ['Daromad (sotuv)', pnl.revenue, pp.revenue], ['Tannarx (COGS)', pnl.cogs, pp.cogs], ['Yalpi foyda', pnl.grossProfit, pp.grossProfit],
    ['Yo‘qotish (yaroqsiz/inventarizatsiya)', pnl.losses, pp.losses], ['Xarajatlar', pnl.expenses, pp.expenses], ['Sof foyda', pnl.netProfit, pp.netProfit],
    ['Sotuvlar soni', pnl.sales, pp.sales], ['Tovarga bog‘lanmagan sotuvlar', pnl.unlinkedSales, pp.unlinkedSales]];
  const cashRows = [['Valyuta', 'Boshlang‘ich', 'Kirim', 'Chiqim', 'Yakuniy', 'Kutilayotgan to‘lov']];
  for (const [c, v] of Object.entries(cash.byCurrency)) cashRows.push([c, v.opening, v.inflow, v.outflow, v.closing, v.pending]);
  const serRows = [['Davr', 'Daromad', 'Tannarx', 'Yalpi foyda', 'Xarajat', 'Sof foyda', 'Kassa kirimi', 'Kassa chiqimi']];
  for (const r of series) serRows.push([r.key, r.revenue, r.cogs, r.grossProfit, r.expenses, r.netProfit, r.cashIn, r.cashOut]);
  return X.writeXlsx([
    { name: 'Moliya', rows: sum, widths: [36, 20, 20] },
    { name: 'Kassa', rows: cashRows, widths: [12, 16, 16, 16, 16, 18] },
    { name: 'Davrlar', rows: serRows, widths: [14, 16, 16, 16, 16, 16, 16, 16] },
  ]);
}

module.exports = { createOpsHttp, periodOf, planImport };
