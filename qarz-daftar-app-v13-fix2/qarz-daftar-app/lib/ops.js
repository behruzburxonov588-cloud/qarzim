'use strict';
/* Qarzim v11 — ombor, kassa va moliya yadrosi. Faqat Node.js, paketlarsiz.
 *
 * Qoidalar:
 *  - Pul butun "minor" birlikda (UZS = so'm, boshqa valyutalar = tiyin/sent). Miqdor 1/1000 birlikda ("milli").
 *    Float bilan hisoblanmaydi.
 *  - Sotuv (qarzga yoki to'lov bilan) — daromad (accrual). Qarz naqd pul emas.
 *  - To'lov faqat tasdiqlangan bo'lsa kassaga qo'shiladi. Otkazma/boshqa — tasdiqlanguncha "kutilmoqda".
 *  - Xarid — aktiv (kirim), xarajat emas. Sotilganda tannarx (COGS) sifatida foydaga o'tadi.
 *  - Yozuvlar o'chirilmaydi: tuzatish = teskari yozuv (reversal). Bekor qilish asl sana bo'yicha yoziladi.
 *  - Qarz daftari (blob) → jurnal proyeksiyasi: har sotuv/to'lov uchun kalit (txId + hash). Kalit bo'yicha idempotent.
 *  - Manfiy qoldiq faqat egasi aniq ruxsat bergan operatsiyada.
 */
const crypto = require('crypto');

const CURS = ['UZS', 'USD', 'EUR', 'RUB', 'KZT'];
const METHODS = ['naqd', 'karta', 'otkazma', 'boshqa'];
const UNKNOWN_METHOD = 'noma’lum';
const PENDING_METHODS = ['otkazma', 'boshqa'];
const DEFAULT_EXPENSE_CATS = ['Ijara', 'Maosh', 'Transport', 'Kommunal xizmatlar', 'Soliq', 'Boshqa'];
const OPSEEN_KEEP = 2000, AUDIT_KEEP = 20000, ISSUES_KEEP = 200, LINES_MAX = 200;
const STOCK_KINDS = ['sale', 'sale_rev', 'writeoff', 'writeoff_rev', 'adjust', 'adjust_rev'];

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' });
const rid = () => crypto.randomBytes(8).toString('hex');
const isCur = (c) => CURS.includes(c);
const isNum = (x) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isFinite(Number(x));
const scaleOf = (cur) => (cur === 'UZS' ? 1 : 100);
const dayOf = (ms) => dayFmt.format(new Date(ms));                                  // Asia/Tashkent, YYYY-MM-DD
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const startOfDayIso = (day) => new Date(Date.parse(day + 'T00:00:00+05:00')).toISOString();   // Toshkent: UTC+5, yozgi vaqt yo'q
const minorOf = (amount, cur) => (isNum(amount) ? Math.round(Number(Number(amount).toFixed(6)) * scaleOf(cur)) : null);
const milliOf = (q) => (isNum(q) ? Math.round(Number(Number(q).toFixed(6)) * 1000) : null);
const rateOf = (cur, rates) => (cur === 'UZS' ? 1 : (rates && Number(rates[cur]) > 0 ? Number(rates[cur]) : null));
/** Valyuta minoridan UZS minoriga (berilgan kurs bo'yicha). Kurs yo'q bo'lsa null. */
function uzsOf(minor, cur, rate) {
  if (minor == null) return null;
  if (cur === 'UZS') return minor;
  if (rate == null) return null;
  return Math.round(minor * rate / scaleOf(cur));
}
/** Qarz tranzaksiyasining kuni (Toshkent). ts bo'lmasa — sana matni. */
const txDay = (t) => (Number(t.ts) > 0 ? dayOf(Number(t.ts)) : String(t.date || '').slice(0, 10));
const weekKey = (day) => {
  const d = Date.parse(day + 'T00:00:00Z'), dow = (new Date(d).getUTCDay() + 6) % 7;
  return new Date(d - dow * 864e5).toISOString().slice(0, 10);
};
const monthKey = (day) => day.slice(0, 7);
const yearKey = (day) => day.slice(0, 4);
const cleanStr = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const SKU_RE = /^[A-Za-z0-9._\-/]{1,40}$/;
const BAR_RE = /^\d{4,32}$/;
const err = (code, message, extra) => Object.assign({ ok: false, error: code, message }, extra || {});

// ---------- holat ----------
function newOps() {
  return {
    activeFrom: null, activatedAt: null, cashStart: null,
    expenseCats: DEFAULT_EXPENSE_CATS.slice(), productCats: [],
    products: {}, moves: [], entries: [], keys: {}, opSeen: {}, audit: [], issues: [], lastSync: null,
  };
}
/** acct.ops ni to'ldiradi (eski ma'lumotda ham xavfsiz). */
function ensureOps(a) {
  if (!a.ops) a.ops = newOps();
  const d = newOps();
  for (const k of Object.keys(d)) if (a.ops[k] === undefined) a.ops[k] = d[k];
  return a.ops;
}

// ---------- ombor: o'rtacha tannarx ----------
/**
 * Bitta harakatni st (mahsulot holati: qty, value, unit) ga qo'llaydi.
 * qty > 0 — kirim (inCost, minor). qty < 0 — chiqim: hisoblangan tannarxni qaytaradi.
 * Qoldiq yetmasa, yetmagan qism oxirgi o'rtacha birlik tannarxida olinadi (faqat ruxsat bilan).
 * s.unit — musbat qoldiqda har doim value/qty (o'rtacha). Shu sababli sotuv va uning teskari yozuvi
 * holatni aynan tiklaydi (value va qty butun sonlar), va keyingi manfiy chiqim bir xil narxda hisoblanadi.
 */
function stockApply(st, pid, qty, inCost) {
  let s = st[pid];
  if (!s) s = st[pid] = { qty: 0, value: 0, unit: 0 };
  if (qty > 0) {
    const c = Math.round(inCost || 0);
    s.value += c; s.qty += qty;
    if (s.qty > 0) s.unit = s.value / s.qty;
    return c;
  }
  const q = -qty;
  const avail = Math.max(0, s.qty);
  const fromStock = Math.min(q, avail);
  let cost = 0;
  if (fromStock > 0) cost += fromStock === avail ? s.value : Math.round(fromStock * s.value / avail);
  if (q > fromStock) cost += Math.round((q - fromStock) * s.unit);
  s.value -= cost; s.qty -= q;
  if (s.qty === 0) s.value = 0;
  if (s.qty > 0) s.unit = s.value / s.qty;
  return cost;
}
/** Barcha harakatlardan joriy holat. drift — saqlangan tannarx qayta hisoblanganidan farq qilgan chiqimlar soni (0 bo'lishi kerak). */
function stockReplay(moves) {
  const st = {}; let drift = 0;
  for (const m of moves) {
    const c = stockApply(st, m.productId, m.qtyMilli, m.costMinor);
    if (m.qtyMilli < 0 && c !== m.costMinor) drift++;
  }
  return { st, drift };
}
const onHandOf = (st, pid) => (st[pid] ? st[pid].qty : 0);
const unitNow = (st, p) => {
  const s = st[p.id];
  return s && s.qty > 0 ? s.value / s.qty : (p.buyMinor || 0) / 1000;      // milli birlik uchun minor narx
};

// ---------- qarz daftari → jurnal proyeksiyasi ----------
function projectionKey(kind, t) {
  const body = kind === 'sale'
    ? { a: t.amount, c: t.cur || null, d: t.date || null, i: (Array.isArray(t.items) ? t.items.slice(0, LINES_MAX) : []).map((x) => [x && x.name, x && x.qty, x && x.price, x && x.productId, !!(x && x.allowNegative)]) }
    : { a: t.amount, c: t.cur || null, d: t.date || null, m: METHODS.includes(t.method) ? t.method : UNKNOWN_METHOD };
  const h = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return (kind === 'sale' ? 'sale:' : 'pay:') + t.id + ':' + h;
}
/**
 * Birlashtirilgan qarz daftaridan (clients) jurnal o'zgarishlarini rejalashtiradi. Hech narsani yozmaydi.
 * ok=false bo'lsa, errors bilan qaytadi va hech narsa o'zgartirilmaydi.
 * ctx: { actor, byName, role, now, rates }
 */
function projectBlob(ops, clients, ctx) {
  const res = { ok: true, errors: [], entries: [], moves: [], reversed: [], keyAdds: {}, keyDels: [] };
  if (!ops.activeFrom) return res;                                                // faollashtirilmagan: hech narsa yozilmaydi
  const from = Date.parse(ops.activeFrom);
  const now = ctx.now, iso = new Date(now).toISOString(), today = dayOf(now);
  const byId = new Map(ops.entries.map((e) => [e.id, e]));
  const movesByEntry = new Map();
  for (const m of ops.moves) {
    const k = m.ref && m.ref.entry;
    if (k) { if (!movesByEntry.has(k)) movesByEntry.set(k, []); movesByEntry.get(k).push(m); }
  }
  // 1) Blobdagi kutilayotgan yozuvlar
  const desired = new Map();
  for (const c of Array.isArray(clients) ? clients : []) {
    if (!c || c.kind === 'lender') continue;
    for (const t of Array.isArray(c.transactions) ? c.transactions : []) {
      if (!t || typeof t.id !== 'string' || (t.type !== 'debt' && t.type !== 'payment')) continue;
      const amount = Number(t.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const ts = Number(t.ts) || 0;
      if (ts < from) continue;                                                    // faollashtirishdan oldingi yozuv — boshlang'ich holat
      const kind = t.type === 'debt' ? 'sale' : 'pay';
      const cur = isCur(t.cur) ? t.cur : (isCur(c.cur) ? c.cur : 'UZS');
      desired.set(projectionKey(kind, t), { kind, t, c, cur, ts });
    }
  }
  // 2) Stok holati (nusxa — faqat rejalashtirish uchun)
  const { st } = stockReplay(ops.moves);
  const newEntries = [], newMoves = [];
  // 3) Bekor qilingan yoki tahrirlangan yozuvlar → teskari yozuv (asl sana bo'yicha)
  for (const [k, entryId] of Object.entries(ops.keys)) {
    if (desired.has(k)) continue;
    const e = byId.get(entryId);
    if (!e) { res.keyDels.push(k); continue; }                                    // yetim kalit
    const revId = rid();
    newEntries.push({
      id: revId, type: 'reversal', reverses: e.id, reversedKind: e.type,
      amountMinor: -e.amountMinor, amountUzsMinor: e.amountUzsMinor == null ? null : -e.amountUzsMinor,
      cashMinor: 0 - (e.cashMinor || 0), cur: e.cur, rate: e.rate, method: e.method || null, status: 'confirmed',
      refTx: e.refTx, refClient: e.refClient, day: e.day, txTs: e.txTs || null, at: iso,
      by: e.by, byName: e.byName, role: ctx.role, cause: 'blob',
    });
    if (e.type === 'sale') {
      for (const m of movesByEntry.get(e.id) || []) {
        if (m.kind !== 'sale') continue;
        stockApply(st, m.productId, -m.qtyMilli, m.costMinor);
        newMoves.push({ id: rid(), productId: m.productId, qtyMilli: -m.qtyMilli, costMinor: m.costMinor, costUzsMinor: m.costUzsMinor,
          kind: 'sale_rev', ref: { entry: revId, reverses: m.id, tx: e.refTx }, day: e.day, at: iso, by: e.by, byName: e.byName, role: ctx.role });
      }
    }
    res.reversed.push(e.id);
    res.keyDels.push(k);
  }
  // 4) Yangi yozuvlar — vaqt tartibida. Stok yetmasa — hammasi rad etiladi.
  const todo = [...desired.entries()].filter(([k]) => !ops.keys[k]).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => a.ts - b.ts);
  for (const d of todo) {
    const entryId = rid();
    const rate = rateOf(d.cur, ctx.rates);
    const amountMinor = minorOf(d.t.amount, d.cur);
    const day = txDay(d.t) || today;
    if (d.kind === 'pay') {
      const method = METHODS.includes(d.t.method) ? d.t.method : UNKNOWN_METHOD;
      // Noma’lum usul — kassaga qo‘shilmaydi: tasdiqlanmaguncha "kutilmoqda" (naqd deb hisoblanmaydi)
      const status = PENDING_METHODS.includes(method) || method === UNKNOWN_METHOD ? 'pending' : 'confirmed';
      newEntries.push({
        id: entryId, type: 'payment', amountMinor, cur: d.cur, rate, amountUzsMinor: uzsOf(amountMinor, d.cur, rate),
        method, status, cashMinor: status === 'confirmed' ? amountMinor : 0,
        refTx: d.t.id, refClient: d.c.id, projKey: d.k, day, txTs: d.ts, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role,
      });
      res.keyAdds[d.k] = entryId;
      continue;
    }
    // sotuv: qatorlar va stok
    const lines = [];
    let unlinked = 0;
    const items = Array.isArray(d.t.items) ? d.t.items.slice(0, LINES_MAX) : [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const qty = milliOf(it.qty != null && it.qty !== '' ? it.qty : 1);
      if (!(qty > 0)) continue;
      const priceMinor = minorOf(it.price, d.cur) || 0;
      const p = it.productId ? ops.products[it.productId] : null;
      if (!p || p.archived) {
        unlinked++;
        lines.push({ productId: null, name: cleanStr(it.name, 120) || 'Tovar', qtyMilli: qty, priceMinor });
        continue;
      }
      lines.push({ productId: p.id, name: p.name, qtyMilli: qty, priceMinor, pcur: p.cur, allowNeg: !!it.allowNegative && ctx.role === 'owner' });
    }
    let bad = false;
    for (const ln of lines) {
      if (!ln.productId) continue;
      const have = onHandOf(st, ln.productId);
      if (have < ln.qtyMilli && !ln.allowNeg) {
        bad = true;
        res.errors.push({ tx: d.t.id, productId: ln.productId, name: ln.name, need: ln.qtyMilli, have: Math.max(0, have), needOwner: ctx.role !== 'owner' });
        continue;
      }
      ln.cost = stockApply(st, ln.productId, -ln.qtyMilli, null);
    }
    if (bad) continue;
    newEntries.push({
      id: entryId, type: 'sale', amountMinor, cur: d.cur, rate, amountUzsMinor: uzsOf(amountMinor, d.cur, rate),
      lines: lines.map((l) => ({ productId: l.productId, name: l.name, qtyMilli: l.qtyMilli, priceMinor: l.priceMinor })),
      unlinked, cashMinor: 0, refTx: d.t.id, refClient: d.c.id, projKey: d.k, day, txTs: d.ts, at: iso,
      by: ctx.actor, byName: ctx.byName, role: ctx.role,
    });
    res.keyAdds[d.k] = entryId;
    for (const ln of lines) {
      if (!ln.productId) continue;
      const p = ops.products[ln.productId];
      newMoves.push({ id: rid(), productId: ln.productId, qtyMilli: -ln.qtyMilli, costMinor: ln.cost, costUzsMinor: uzsOf(ln.cost, p.cur, rateOf(p.cur, ctx.rates)),
        kind: 'sale', ref: { entry: entryId, tx: d.t.id }, day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
    }
  }
  if (res.errors.length) return { ok: false, errors: res.errors, entries: [], moves: [], reversed: [], keyAdds: {}, keyDels: [] };
  res.entries = newEntries;
  res.moves = newMoves;
  return res;
}
/** Rejalashtirilgan o'zgarishlarni haqiqiy holatga yozadi (faqat ok bo'lganda chaqiriladi). */
function commitProjection(ops, res, now) {
  const byId = new Map(ops.entries.map((e) => [e.id, e]));
  for (const e of res.entries) if (e.reverses) { const o = byId.get(e.reverses); if (o) o.reversedBy = e.id; }
  for (const k of res.keyDels) delete ops.keys[k];
  for (const [k, id] of Object.entries(res.keyAdds)) ops.keys[k] = id;
  ops.entries.push(...res.entries);
  ops.moves.push(...res.moves);
  ops.lastSync = new Date(now).toISOString();
  return res.entries.length + res.moves.length;
}

// ---------- audit va idempotentlik ----------
function audit(ops, ctx, action, ref, text, extra) {
  ops.audit.push(Object.assign({ at: new Date(ctx.now).toISOString(), by: ctx.byName || ctx.actor || '', role: ctx.role || '', action, ref: ref || null, text: String(text || '').slice(0, 300) }, extra || {}));
  if (ops.audit.length > AUDIT_KEEP) ops.audit.splice(0, ops.audit.length - AUDIT_KEEP);
}
/** Bir xil opId ikkinchi marta kelsa — avvalgi natija qaytadi, hech narsa qayta yozilmaydi. */
function idem(ops, opId, fn) {
  const key = opId ? 'o:' + String(opId).slice(0, 80) : null;
  if (key && ops.opSeen[key]) return Object.assign({}, ops.opSeen[key], { replayed: true });
  const r = fn();
  if (r.ok && key) {
    ops.opSeen[key] = Object.assign({}, r);
    const ks = Object.keys(ops.opSeen);
    if (ks.length > OPSEEN_KEEP) for (const k of ks.slice(0, ks.length - OPSEEN_KEEP)) delete ops.opSeen[k];
  }
  return r;
}
const needOp = (inp) => (inp && typeof inp.opId === 'string' && inp.opId.length >= 4 && inp.opId.length <= 80 ? null : err('bad_request', 'opId kerak'));

// ---------- tovarlar va kategoriyalar ----------
function saveProduct(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const isNew = !inp.id;
    const p = isNew ? null : ops.products[inp.id];
    if (!isNew && !p) return err('not_found', 'Tovar topilmadi');
    // Tahrirda yuborilmagan maydon o‘zgarmaydi: tannarxni ko‘ra olmaydigan rol arxivlasa yoki faqat nomini tahrirlasa,
    // narx, minimal qoldiq, yetkazib beruvchi yo‘qolmasin
    const keep = (k) => !isNew && inp[k] === undefined;
    const name = cleanStr(keep('name') ? p.name : inp.name, 120);
    if (name.length < 2) return err('bad_name', "Tovar nomini kiriting (kamida 2 belgi)");
    const cur = keep('cur') ? p.cur : (inp.cur == null || inp.cur === '' ? 'UZS' : inp.cur);
    if (!isCur(cur)) return err('bad_cur', "Valyuta noto‘g‘ri");
    const sku = cleanStr(keep('sku') ? p.sku : inp.sku, 40), barcode = cleanStr(keep('barcode') ? p.barcode : inp.barcode, 32);
    const category = cleanStr(keep('category') ? p.category : inp.category, 40);
    if (sku && !SKU_RE.test(sku)) return err('bad_sku', "Artikul faqat lotin harf, raqam va . _ - / belgilaridan iborat bo‘lsin");
    if (barcode && !BAR_RE.test(barcode)) return err('bad_barcode', "Shtrix-kod 4–32 ta raqamdan iborat bo‘lsin");
    if (category && !ops.productCats.includes(category)) return err('bad_category', "Bunday kategoriya yo‘q. Avval kategoriya qo‘shing");
    if (p && cur !== p.cur && (keep('buyPrice') || keep('sellPrice'))) return err('bad_price', 'Valyuta o‘zgarganda narxlarni qayta kiriting');
    const buy = keep('buyPrice') ? (p.buyMinor || 0) : minorOf(inp.buyPrice == null || inp.buyPrice === '' ? 0 : inp.buyPrice, cur);
    const sell = keep('sellPrice') ? (p.sellMinor || 0) : minorOf(inp.sellPrice == null || inp.sellPrice === '' ? 0 : inp.sellPrice, cur);
    if (buy == null || buy < 0 || sell == null || sell < 0) return err('bad_price', "Narxlar 0 yoki undan katta raqam bo‘lishi kerak");
    const minQ = keep('minQty') ? (p.minMilli || 0) : (inp.minQty == null || inp.minQty === '' ? 0 : milliOf(inp.minQty));
    if (minQ == null || minQ < 0) return err('bad_min', "Minimal qoldiq noto‘g‘ri");
    const all = Object.values(ops.products), self = p ? p.id : null;
    if (all.some((x) => x.id !== self && !x.archived && x.name.toLowerCase() === name.toLowerCase())) return err('dup_name', 'Bu nomli tovar allaqachon bor');
    if (sku && all.some((x) => x.id !== self && x.sku && x.sku.toLowerCase() === sku.toLowerCase())) return err('dup_sku', 'Bu artikul allaqachon band');
    if (barcode && all.some((x) => x.id !== self && x.barcode === barcode)) return err('dup_barcode', 'Bu shtrix-kod allaqachon band');
    let initQ = 0;
    if (isNew && inp.initialQty != null && inp.initialQty !== '') {
      initQ = milliOf(inp.initialQty);
      if (initQ == null || initQ < 0) return err('bad_qty', "Boshlang‘ich miqdor noto‘g‘ri");
    }
    if (p && p.cur !== cur && ops.moves.some((m) => m.productId === p.id)) return err('cur_locked', "Stok harakati bor tovarning valyutasini o‘zgartirib bo‘lmaydi");
    const iso = new Date(ctx.now).toISOString();
    const rec = Object.assign({}, p || { id: rid(), createdAt: iso, archived: false }, {
      name, sku: sku || null, barcode: barcode || null, category: category || null,
      supplier: keep('supplier') ? (p.supplier || null) : (cleanStr(inp.supplier, 120) || null),
      description: keep('description') ? (p.description || null) : (cleanStr(inp.description, 500) || null),
      buyMinor: buy, sellMinor: sell, cur, minMilli: minQ, updatedAt: iso, by: ctx.byName || ctx.actor, role: ctx.role,
    });
    if (!isNew && inp.archived !== undefined) rec.archived = !!inp.archived;
    const moves = [];
    if (isNew && initQ > 0) {
      const cost = Math.round(initQ * buy / 1000);
      moves.push({ id: rid(), productId: rec.id, qtyMilli: initQ, costMinor: cost, costUzsMinor: uzsOf(cost, cur, rateOf(cur, ctx.rates)),
        kind: 'opening', ref: null, reason: 'Boshlang‘ich qoldiq', day: dayOf(ctx.now), at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
    }
    ops.products[rec.id] = rec;
    ops.moves.push(...moves);
    audit(ops, ctx, isNew ? 'product_add' : (rec.archived && (!p || !p.archived) ? 'product_archive' : 'product_edit'), rec.id, rec.name);
    return { ok: true, id: rec.id };
  });
}
function addCategory(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const kind = inp.kind === 'expense' ? 'expense' : 'product';
    const name = cleanStr(inp.name, 40);
    if (name.length < 2) return err('bad_name', 'Kategoriya nomi kamida 2 belgi bo‘lsin');
    const list = kind === 'expense' ? ops.expenseCats : ops.productCats;
    if (list.some((x) => x.toLowerCase() === name.toLowerCase())) return err('dup_name', 'Bunday kategoriya allaqachon bor');
    list.push(name);
    audit(ops, ctx, 'category_add', kind, name);
    return { ok: true };
  });
}
function deleteCategory(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const kind = inp.kind === 'expense' ? 'expense' : 'product';
    const name = cleanStr(inp.name, 40);
    if (kind === 'product') {
      if (Object.values(ops.products).some((p) => p.category === name)) return err('in_use', "Bu kategoriyada tovarlar bor — avval ularni boshqa kategoriyaga o‘tkazing");
      ops.productCats = ops.productCats.filter((x) => x !== name);
    } else {
      if (ops.entries.some((e) => e.type === 'expense' && e.category === name)) return err('in_use', "Bu xarajat turi ishlatilgan — o‘chirib bo‘lmaydi");
      ops.expenseCats = ops.expenseCats.filter((x) => x !== name);
    }
    audit(ops, ctx, 'category_delete', kind, name);
    return { ok: true };
  });
}

// ---------- kirim (xarid) ----------
function addPurchase(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const cur = inp.cur || 'UZS';
    if (!isCur(cur)) return err('bad_cur', "Valyuta noto‘g‘ri");
    const lines = Array.isArray(inp.lines) ? inp.lines.slice(0, LINES_MAX) : [];
    if (!lines.length) return err('no_lines', 'Kamida bitta tovar qo‘shing');
    const plines = [];
    let total = 0;
    for (const ln of lines) {
      const p = ln && ops.products[ln.productId];
      if (!p || p.archived) return err('bad_product', 'Tovar topilmadi yoki arxivda');
      if (p.cur !== cur) return err('cur_mismatch', `${p.name} ${p.cur} valyutasida. Xarid valyutasi ham shunday bo‘lishi kerak`);
      const qty = milliOf(ln.qty);
      if (!(qty > 0)) return err('bad_qty', `${p.name}: miqdor 0 dan katta bo‘lsin`);
      const unit = minorOf(ln.unitPrice, cur);
      if (unit == null || unit < 0) return err('bad_price', `${p.name}: narx noto‘g‘ri`);
      const cost = Math.round(qty * unit / 1000);
      total += cost;
      plines.push({ p, qty, unit, cost });
    }
    const paid = inp.paid == null || inp.paid === '' ? total : minorOf(inp.paid, cur);
    if (paid == null || paid < 0 || paid > total) return err('bad_paid', "To‘langan summa 0 dan jami summagacha bo‘lishi kerak");
    const method = METHODS.includes(inp.method) ? inp.method : 'naqd';
    const rate = rateOf(cur, ctx.rates);
    const day = isDay(inp.day) && inp.day <= dayOf(ctx.now) ? inp.day : dayOf(ctx.now);
    const iso = new Date(ctx.now).toISOString(), id = rid();
    const entry = {
      id, type: 'purchase', amountMinor: total, cur, rate, amountUzsMinor: uzsOf(total, cur, rate),
      paidMinor: paid, payableMinor: total - paid, cashMinor: 0 - paid, method: paid > 0 ? method : null, status: 'confirmed',
      supplier: cleanStr(inp.supplier, 120) || null, note: cleanStr(inp.note, 200) || null,
      lines: plines.map((l) => ({ productId: l.p.id, name: l.p.name, qtyMilli: l.qty, unitMinor: l.unit, costMinor: l.cost })),
      day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role,
    };
    const moves = plines.map((l) => ({ id: rid(), productId: l.p.id, qtyMilli: l.qty, costMinor: l.cost, costUzsMinor: uzsOf(l.cost, cur, rate),
      kind: 'purchase', ref: { entry: id }, day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role }));
    ops.entries.push(entry);
    ops.moves.push(...moves);
    for (const l of plines) l.p.buyMinor = l.unit;                                  // so'nggi xarid narxi
    audit(ops, ctx, 'purchase', id, `${plines.length} ta tovar, jami ${total}`, { amountMinor: total, cur });
    return { ok: true, id, total, paid };
  });
}

// ---------- xarajat va kassa ----------
function addExpense(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const cur = inp.cur || 'UZS';
    if (!isCur(cur)) return err('bad_cur', "Valyuta noto‘g‘ri");
    const amount = minorOf(inp.amount, cur);
    if (!(amount > 0)) return err('bad_amount', 'Summa 0 dan katta bo‘lsin');
    const category = cleanStr(inp.category, 40);
    if (!ops.expenseCats.includes(category)) return err('bad_category', 'Xarajat turini tanlang');
    const today = dayOf(ctx.now);
    const day = inp.day == null || inp.day === '' ? today : inp.day;
    if (!isDay(day) || day > today) return err('bad_day', "Sana noto‘g‘ri yoki kelajakda");
    const method = METHODS.includes(inp.method) ? inp.method : 'naqd';
    const rate = rateOf(cur, ctx.rates);
    const id = rid(), iso = new Date(ctx.now).toISOString();
    ops.entries.push({ id, type: 'expense', amountMinor: amount, cur, rate, amountUzsMinor: uzsOf(amount, cur, rate), cashMinor: 0 - amount,
      method, status: 'confirmed', category, note: cleanStr(inp.note, 200) || null, day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
    audit(ops, ctx, 'expense', id, category, { amountMinor: amount, cur });
    return { ok: true, id };
  });
}
/** Kassada joriy qoldiq (valyuta bo'yicha, minor). */
function cashNative(ops, cur, untilDay) {
  const cs = ops.cashStart;
  if (!cs) return 0;
  let sum = cs.cur === cur ? cs.amountMinor : 0;
  for (const e of ops.entries) {
    if (e.cur !== cur || !e.cashMinor || e.day < cs.day || e.day > untilDay) continue;
    sum += e.cashMinor;
  }
  return sum;
}
function addCashAdjust(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const cur = inp.cur || 'UZS';
    if (!isCur(cur)) return err('bad_cur', "Valyuta noto‘g‘ri");
    const reason = cleanStr(inp.reason, 200);
    if (reason.length < 3) return err('reason_required', 'Sabab yozing (kamida 3 belgi)');
    if (!ops.cashStart) return err('no_cash_start', "Avval kassa boshlang‘ich qoldig‘ini kiriting");
    let amount;
    if (inp.counted != null && inp.counted !== '') {
      const counted = minorOf(inp.counted, cur);
      if (counted == null || counted < 0) return err('bad_amount', 'Haqiqiy qoldiq noto‘g‘ri');
      amount = counted - cashNative(ops, cur, dayOf(ctx.now));
    } else {
      amount = minorOf(inp.amount, cur);
    }
    if (amount == null || amount === 0) return err('no_change', 'Tuzatish nolga teng');
    const rate = rateOf(cur, ctx.rates), id = rid(), iso = new Date(ctx.now).toISOString();
    ops.entries.push({ id, type: 'cash_adjust', amountMinor: amount, cur, rate, amountUzsMinor: uzsOf(amount, cur, rate), cashMinor: amount,
      method: null, status: 'confirmed', note: reason, day: dayOf(ctx.now), at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
    audit(ops, ctx, 'cash_adjust', id, reason, { amountMinor: amount, cur });
    return { ok: true, id, amountMinor: amount };
  });
}
function confirmPayment(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const e = ops.entries.find((x) => x.id === inp.entryId);
    if (!e || e.type !== 'payment') return err('not_found', "To‘lov topilmadi");
    if (e.reversedBy) return err('reversed', 'Bu to‘lov bekor qilingan');
    if (e.status === 'confirmed') return err('already', 'Allaqachon tasdiqlangan');
    e.status = 'confirmed';
    e.cashMinor = e.amountMinor;
    e.confirmedAt = new Date(ctx.now).toISOString();
    e.confirmedBy = ctx.byName || ctx.actor;
    audit(ops, ctx, 'payment_confirm', e.id, e.method || '', { amountMinor: e.amountMinor, cur: e.cur });
    return { ok: true, id: e.id };
  });
}
function setCashStart(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const cur = inp.cur || 'UZS';
    if (!isCur(cur)) return err('bad_cur', "Valyuta noto‘g‘ri");
    const day = inp.day;
    if (!isDay(day) || day > dayOf(ctx.now)) return err('bad_day', 'Sana noto‘g‘ri yoki kelajakda');
    const amount = inp.amount == null || inp.amount === '' ? 0 : minorOf(inp.amount, cur);
    if (amount == null || amount < 0) return err('bad_amount', 'Boshlang‘ich qoldiq manfiy bo‘lmasin');
    ops.cashStart = { day, amountMinor: amount, cur, rate: rateOf(cur, ctx.rates), at: new Date(ctx.now).toISOString(), by: ctx.byName || ctx.actor };
    audit(ops, ctx, 'cash_start', day, `${amount} ${cur}`, { amountMinor: amount, cur });
    return { ok: true };
  });
}
/** Moliya hisobini faollashtirish: faollashtirish kunining boshidan. Qayta chaqirilsa — o'zgarmaydi. */
function activate(ops, ctx) {
  if (ops.activeFrom) return { ok: true, already: true, activeFrom: ops.activeFrom };
  const today = dayOf(ctx.now);
  ops.activeFrom = startOfDayIso(today);
  ops.activatedAt = new Date(ctx.now).toISOString();
  if (!ops.cashStart) ops.cashStart = { day: today, amountMinor: 0, cur: 'UZS', rate: 1, at: ops.activatedAt, by: ctx.byName || ctx.actor };
  audit(ops, ctx, 'activate', today, 'Moliya hisobi faollashtirildi');
  return { ok: true, activeFrom: ops.activeFrom };
}

// ---------- ombor harakatlari: chiqim va tuzatish ----------
function manualMove(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const kind = inp.kind === 'adjust' ? 'adjust' : 'writeoff';
    const p = ops.products[inp.productId];
    if (!p || p.archived) return err('not_found', 'Tovar topilmadi yoki arxivda');
    const reason = cleanStr(inp.reason, 200);
    if (reason.length < 3) return err('reason_required', 'Sabab yozing (kamida 3 belgi)');
    const { st } = stockReplay(ops.moves);
    const s = st[p.id] || { qty: 0, value: 0, unit: 0 };
    let delta;
    if (kind === 'writeoff') {
      const q = milliOf(inp.qty);
      if (!(q > 0)) return err('bad_qty', 'Miqdor 0 dan katta bo‘lsin');
      delta = -q;
    } else if (inp.counted != null && inp.counted !== '') {
      const c = milliOf(inp.counted);
      if (c == null || c < 0) return err('bad_qty', 'Haqiqiy miqdor noto‘g‘ri');
      delta = c - s.qty;
    } else {
      delta = milliOf(inp.delta);
      if (delta == null) return err('bad_qty', 'Miqdor noto‘g‘ri');
    }
    if (delta === 0) return err('no_change', 'O‘zgarish yo‘q');
    const override = ctx.role === 'owner' && !!inp.allowNegative;
    if (delta < 0 && s.qty + delta < 0 && !override) {
      return err('stock_insufficient', 'Omborda yetarli qoldiq yo‘q', { lines: [{ productId: p.id, name: p.name, need: -delta, have: Math.max(0, s.qty), needOwner: ctx.role !== 'owner' }] });
    }
    const unit = unitNow(st, p);
    const inCost = delta > 0 ? Math.round(delta * unit) : null;
    const cost = stockApply(st, p.id, delta, inCost);
    const day = isDay(inp.day) && inp.day <= dayOf(ctx.now) ? inp.day : dayOf(ctx.now);
    const id = rid(), iso = new Date(ctx.now).toISOString();
    ops.moves.push({ id, productId: p.id, qtyMilli: delta, costMinor: cost, costUzsMinor: uzsOf(cost, p.cur, rateOf(p.cur, ctx.rates)),
      kind, reason, ref: null, day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role, allowNegative: override || undefined });
    audit(ops, ctx, kind === 'writeoff' ? 'writeoff' : 'adjust', id, `${p.name}: ${delta > 0 ? '+' : ''}${delta / 1000} — ${reason}`, { amountMinor: cost, cur: p.cur });
    return { ok: true, id, qtyMilli: delta, costMinor: cost };
  });
}
/** Xarid, xarajat, kassa tuzatish yoki ombor tuzatish/chiqimini teskari yozish. Asl sana bo'yicha. */
function reverseManual(ops, inp, ctx) {
  const bad = needOp(inp); if (bad) return bad;
  return idem(ops, inp.opId, () => {
    const reason = cleanStr(inp.reason, 200);
    if (reason.length < 3) return err('reason_required', 'Bekor qilish sababini yozing (kamida 3 belgi)');
    const iso = new Date(ctx.now).toISOString();
    const override = ctx.role === 'owner' && !!inp.allowNegative;
    if (inp.moveId) {
      const m = ops.moves.find((x) => x.id === inp.moveId);
      if (!m || !['writeoff', 'adjust'].includes(m.kind)) return err('not_found', 'Harakat topilmadi');
      if (m.reversedBy) return err('reversed', 'Bu harakat allaqachon bekor qilingan');
      const p = ops.products[m.productId];
      const { st } = stockReplay(ops.moves);
      const qty = -m.qtyMilli;
      if (qty < 0 && onHandOf(st, m.productId) + qty < 0 && !override) {
        return err('stock_insufficient', 'Omborda yetarli qoldiq yo‘q', { lines: [{ productId: m.productId, name: p ? p.name : '', need: -qty, have: Math.max(0, onHandOf(st, m.productId)), needOwner: ctx.role !== 'owner' }] });
      }
      const cost = stockApply(st, m.productId, qty, qty > 0 ? m.costMinor : null);
      const id = rid();
      ops.moves.push({ id, productId: m.productId, qtyMilli: qty, costMinor: cost, costUzsMinor: uzsOf(cost, p ? p.cur : 'UZS', rateOf(p ? p.cur : 'UZS', ctx.rates)),
        kind: m.kind + '_rev', reason, ref: { reverses: m.id }, day: m.day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
      m.reversedBy = id;
      audit(ops, ctx, 'reverse_move', id, reason, { reverses: m.id });
      return { ok: true, id };
    }
    const e = ops.entries.find((x) => x.id === inp.entryId);
    if (!e || !['purchase', 'expense', 'cash_adjust'].includes(e.type)) return err('not_found', 'Yozuv topilmadi yoki bekor qilib bo‘lmaydi');
    if (e.reversedBy) return err('reversed', 'Bu yozuv allaqachon bekor qilingan');
    const rev = {
      id: rid(), type: 'reversal', reverses: e.id, reversedKind: e.type,
      amountMinor: -e.amountMinor, amountUzsMinor: e.amountUzsMinor == null ? null : -e.amountUzsMinor,
      paidMinor: e.paidMinor ? -e.paidMinor : undefined, cashMinor: 0 - (e.cashMinor || 0),
      cur: e.cur, rate: e.rate, method: e.method || null, status: 'confirmed', note: reason,
      day: e.day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role,
    };
    if (e.type === 'purchase') {
      const { st } = stockReplay(ops.moves);
      const mv = [];
      for (const m of ops.moves) {
        if (!(m.ref && m.ref.entry === e.id && m.kind === 'purchase')) continue;
        const qty = -m.qtyMilli;
        if (onHandOf(st, m.productId) + qty < 0 && !override) {
          const p = ops.products[m.productId];
          return err('stock_insufficient', 'Xarid qilingan tovar sotilib bo‘lgan — bekor qilib bo‘lmaydi', { lines: [{ productId: m.productId, name: p ? p.name : '', need: -qty, have: Math.max(0, onHandOf(st, m.productId)), needOwner: ctx.role !== 'owner' }] });
        }
        const cost = stockApply(st, m.productId, qty, null);
        mv.push({ id: rid(), productId: m.productId, qtyMilli: qty, costMinor: cost, costUzsMinor: uzsOf(cost, ops.products[m.productId] ? ops.products[m.productId].cur : e.cur, rateOf(e.cur, ctx.rates)),
          kind: 'purchase_rev', ref: { entry: rev.id, reverses: m.id }, day: e.day, at: iso, by: ctx.actor, byName: ctx.byName, role: ctx.role });
      }
      ops.moves.push(...mv);
    }
    ops.entries.push(rev);
    e.reversedBy = rev.id;
    audit(ops, ctx, 'reverse_' + e.type, rev.id, reason, { reverses: e.id, amountMinor: e.amountMinor, cur: e.cur });
    return { ok: true, id: rev.id };
  });
}

// ---------- hisobotlar ----------
const STOCK_PNL = ['sale', 'sale_rev', 'writeoff', 'writeoff_rev', 'adjust', 'adjust_rev'];
/** Har kalit bo'yicha guruhlangan moliyaviy qatorlar. Barcha raqamlar UZS minorda (kurs yozuv kursi bo'yicha). */
function aggregate(ops, from, to, keyOf) {
  const rows = new Map();
  const row = (day) => {
    const k = keyOf(day);
    let r = rows.get(k);
    if (!r) rows.set(k, r = { key: k, revenue: 0, cogs: 0, losses: 0, expenses: 0, cashIn: 0, cashOut: 0, sales: 0, unlinkedSales: 0, missingRate: 0 });
    return r;
  };
  const inR = (d) => d && d >= from && d <= to;
  const byId = new Map(ops.entries.map((e) => [e.id, e]));
  for (const e of ops.entries) {
    if (!inR(e.day)) continue;
    if (e.type === 'sale') {
      const r = row(e.day); r.sales++;
      if (e.amountUzsMinor == null) r.missingRate++; else r.revenue += e.amountUzsMinor;
      if (e.unlinked) r.unlinkedSales++;
    } else if (e.type === 'reversal' && e.reversedKind === 'sale') {
      const r = row(e.day);
      r.sales--;
      if (e.amountUzsMinor == null) r.missingRate++; else r.revenue += e.amountUzsMinor;
      const orig = byId.get(e.reverses);
      if (orig && orig.unlinked) r.unlinkedSales--;
    } else if (e.type === 'expense' || (e.type === 'reversal' && e.reversedKind === 'expense')) {
      const r = row(e.day);
      if (e.amountUzsMinor == null) r.missingRate++; else r.expenses += e.amountUzsMinor;
    }
    if (e.cashMinor) {
      const r = row(e.day);
      const u = uzsOf(e.cashMinor, e.cur, e.rate);
      if (u == null) r.missingRate++;
      else if (u > 0) r.cashIn += u; else r.cashOut += u;
    }
  }
  for (const m of ops.moves) {
    if (!inR(m.day) || !STOCK_PNL.includes(m.kind)) continue;
    const r = row(m.day);
    if (m.costUzsMinor == null) { r.missingRate++; continue; }
    const eff = m.qtyMilli < 0 ? m.costUzsMinor : -m.costUzsMinor;
    if (m.kind.startsWith('sale')) r.cogs += eff; else r.losses += eff;
  }
  for (const r of rows.values()) r.grossProfit = r.revenue - r.cogs;
  for (const r of rows.values()) r.netProfit = r.revenue - r.cogs - r.losses - r.expenses;
  return rows;
}
function sumRows(rows) {
  const t = { revenue: 0, cogs: 0, losses: 0, expenses: 0, cashIn: 0, cashOut: 0, sales: 0, unlinkedSales: 0, missingRate: 0 };
  for (const r of rows) for (const k of Object.keys(t)) t[k] += r[k];
  t.grossProfit = t.revenue - t.cogs;
  t.netProfit = t.revenue - t.cogs - t.losses - t.expenses;
  return t;
}
function periodRows(ops, from, to, groupBy) {
  const keyOf = groupBy === 'week' ? weekKey : groupBy === 'month' ? monthKey : groupBy === 'year' ? yearKey : (d) => d;
  const rows = [...aggregate(ops, from, to, keyOf).values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return rows;
}
/** Oldingi davr: bir xil uzunlikdagi, undan oldingi. */
function prevRange(from, to) {
  const len = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1;
  const pTo = addDays(from, -1), pFrom = addDays(pTo, -(len - 1));
  return { from: pFrom, to: pTo };
}
/** Davr uchun (oddiy P&L) — jami. */
function pnl(ops, from, to) {
  return sumRows([...aggregate(ops, from, to, () => 'all').values()]);
}
/** Kassa: boshlang'ich, kirim/chiqim (usul va tur bo'yicha), yakuniy qoldiq — valyuta bo'yicha va UZS ekvivalenti. */
function cashReport(ops, from, to, rates) {
  const cs = ops.cashStart;
  const per = {};
  const cur = (c) => (per[c] || (per[c] = { opening: 0, inflow: 0, outflow: 0, closing: 0, byMethod: {}, byType: {}, pending: 0, pendingCount: 0 }));
  if (cs) cur(cs.cur).opening = cs.amountMinor;
  for (const e of ops.entries) {
    if (!cs || e.day < cs.day) continue;
    if (e.type === 'payment' && e.status === 'pending' && !e.reversedBy) {
      if (e.day >= from && e.day <= to) { cur(e.cur).pending += e.amountMinor; cur(e.cur).pendingCount++; }
      continue;
    }
    if (!e.cashMinor) continue;
    if (e.day < from) { cur(e.cur).opening += e.cashMinor; continue; }
    if (e.day > to) continue;
    const c = cur(e.cur);
    if (e.cashMinor > 0) c.inflow += e.cashMinor; else c.outflow += e.cashMinor;
    const mk = e.method || '—';
    c.byMethod[mk] = (c.byMethod[mk] || 0) + e.cashMinor;
    const tk = e.type === 'reversal' ? 'bekor:' + e.reversedKind : e.type;
    c.byType[tk] = (c.byType[tk] || 0) + e.cashMinor;
  }
  for (const v of Object.values(per)) v.closing = v.opening + v.inflow + v.outflow;
  // UZS ekvivalenti: har yozuvning o'z kursi bo'yicha (D2). Kurs yo'q yozuvlar — missingRate.
  const uzsExact = { opening: 0, inflow: 0, outflow: 0, closing: 0 };
  let missing = 0;
  for (const e of ops.entries) if (cs && e.day >= cs.day && e.cashMinor && e.status !== 'pending' && uzsOf(e.cashMinor, e.cur, e.rate) == null) missing++;
  for (const e of ops.entries) {
    if (!cs || e.day < cs.day || !e.cashMinor || e.status === 'pending') continue;
    const u = uzsOf(e.cashMinor, e.cur, e.rate);
    if (u == null) continue;
    uzsExact.closing += u;
    if (e.day < from) uzsExact.opening += u;
    else if (e.day <= to) { if (u > 0) uzsExact.inflow += u; else uzsExact.outflow += u; }
  }
  if (cs) {
    const open = cs.cur === 'UZS' ? cs.amountMinor : (uzsOf(cs.amountMinor, cs.cur, cs.rate) || 0);
    uzsExact.opening += open; uzsExact.closing += open;
  }
  return { configured: !!cs, cashStart: cs, byCurrency: per, uzs: uzsExact, missingRate: missing };
}
/** Xodimlar bo'yicha: sotuv va yig'ilgan pul. */
function byEmployee(ops, from, to) {
  const m = new Map();
  const get = (k) => { let r = m.get(k); if (!r) m.set(k, r = { by: k, sales: 0, revenue: 0, cashIn: 0 }); return r; };
  for (const e of ops.entries) {
    if (!(e.day >= from && e.day <= to)) continue;
    const k = e.byName || e.by || '—';
    if (e.type === 'sale') { const r = get(k); r.sales++; if (e.amountUzsMinor != null) r.revenue += e.amountUzsMinor; }
    else if (e.type === 'reversal' && e.reversedKind === 'sale') { const r = get(k); if (e.amountUzsMinor != null) r.revenue += e.amountUzsMinor; }
    if (e.type === 'payment' && e.status === 'confirmed' && e.cashMinor) { const u = uzsOf(e.cashMinor, e.cur, e.rate); if (u != null) get(k).cashIn += u; }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
}
/** Eng ko'p foyda keltiruvchi tovarlar: sotuv daromadi − tannarx (UZS). */
function topProducts(ops, from, to) {
  const byP = new Map();
  const get = (id) => { let r = byP.get(id); if (!r) { const p = ops.products[id]; byP.set(id, r = { productId: id, name: p ? p.name : '—', qtySold: 0, revenue: 0, cogs: 0 }); } return r; };
  const ent = new Map(ops.entries.map((e) => [e.id, e]));
  for (const e of ops.entries) {
    if (!(e.day >= from && e.day <= to) || !e.lines) continue;
    if (e.type !== 'sale') continue;
    for (const l of e.lines) {
      if (!l.productId) continue;
      const r = get(l.productId);
      r.qtySold += l.qtyMilli;
      const u = uzsOf(Math.round(l.priceMinor * l.qtyMilli / 1000), e.cur, e.rate);
      if (u != null) r.revenue += u;
    }
  }
  for (const e of ops.entries) {                                                  // bekor qilingan sotuvlarni ayirish
    if (e.type !== 'reversal' || e.reversedKind !== 'sale') continue;
    const o = ent.get(e.reverses);
    if (!o || !o.lines || !(e.day >= from && e.day <= to)) continue;
    for (const l of o.lines) {
      if (!l.productId) continue;
      const r = get(l.productId);
      r.qtySold -= l.qtyMilli;
      const u = uzsOf(Math.round(l.priceMinor * l.qtyMilli / 1000), o.cur, o.rate);
      if (u != null) r.revenue -= u;
    }
  }
  for (const m of ops.moves) {
    if (!(m.day >= from && m.day <= to) || !(m.kind === 'sale' || m.kind === 'sale_rev') || !m.productId) continue;
    if (m.costUzsMinor == null) continue;
    get(m.productId).cogs += m.qtyMilli < 0 ? m.costUzsMinor : -m.costUzsMinor;
  }
  return [...byP.values()].map((r) => Object.assign(r, { profit: r.revenue - r.cogs })).sort((a, b) => b.profit - a.profit);
}
/** Ombor: qoldiq, qiymat (joriy kurs bo'yicha UZS), kam qolgan va tugagan tovarlar. */
function stockSummary(ops, rates) {
  const { st, drift } = stockReplay(ops.moves);
  const rows = [];
  let valueUzs = 0, valueMissing = 0, low = 0, out = 0;
  for (const p of Object.values(ops.products)) {
    const s = st[p.id] || { qty: 0, value: 0 };
    if (p.archived && s.qty === 0) continue;
    const isOut = s.qty <= 0;
    const isLow = !isOut && p.minMilli > 0 && s.qty <= p.minMilli;
    const vu = uzsOf(s.value, p.cur, rateOf(p.cur, rates));
    if (vu == null) valueMissing++; else valueUzs += vu;
    if (isOut) out++; else if (isLow) low++;
    rows.push({ id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, supplier: p.supplier, cur: p.cur,
      qtyMilli: s.qty, valueMinor: s.value, valueUzs: vu, buyMinor: p.buyMinor, sellMinor: p.sellMinor, minMilli: p.minMilli,
      archived: !!p.archived, status: isOut ? 'out' : isLow ? 'low' : 'ok' });
  }
  const rank = { out: 0, low: 1, ok: 2 };
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || a.name.localeCompare(b.name));
  return { rows, valueUzs, valueMissing, low, out, drift, negative: rows.filter((r) => r.qtyMilli < 0).length };
}
/** Qarzlar (qarz daftaridan — manba). Joriy kurs bo'yicha UZS ekvivalenti. */
function debtSummary(clients, rates, today) {
  const list = [];
  const perCur = {};
  let uzs = 0, uzsMissing = 0;
  const back = addDays(today, -30);
  for (const c of Array.isArray(clients) ? clients : []) {
    if (!c || c.kind === 'lender') continue;
    const cur = isCur(c.cur) ? c.cur : 'UZS';
    let bal = 0, balBack = 0, lastDebt = null;
    for (const t of Array.isArray(c.transactions) ? c.transactions : []) {
      const a = minorOf(t.amount, cur); if (a == null) continue;
      const sign = t.type === 'debt' ? 1 : -1;
      bal += sign * a;
      const d = txDay(t);
      if (d && d <= back) balBack += sign * a;
      if (t.type === 'debt' && d && (!lastDebt || d > lastDebt)) lastDebt = d;
    }
    if (bal === 0 && balBack === 0) continue;
    perCur[cur] = (perCur[cur] || 0) + bal;
    const bu = uzsOf(bal, cur, rateOf(cur, rates));
    if (bu == null) uzsMissing++; else uzs += bu;
    const overdue = bal > 0 && !!c.dueDate && c.dueDate < today;
    list.push({ id: c.id, name: c.name, cur, balanceMinor: bal, balanceUzs: bu, dueDate: c.dueDate || null, overdue,
      growth30Minor: bal - balBack, promiseDate: c.promiseDate || null, lastDebt });
  }
  list.sort((a, b) => (b.balanceUzs || 0) - (a.balanceUzs || 0));
  return { perCurrency: perCur, uzs, uzsMissing, count: list.filter((x) => x.balanceMinor > 0).length,
    overdue: list.filter((x) => x.overdue), growing: list.filter((x) => x.growth30Minor > 0 && x.balanceMinor > 0).sort((a, b) => b.growth30Minor - a.growth30Minor), list };
}
/** Tekshiruv: jurnal va qarz daftari mosligi, stok izchilligi, yetishmayotgan ma'lumot. */
function reconcile(ops, clients, rates, now) {
  const dry = projectBlob(ops, clients, { actor: 'tekshiruv', byName: 'tekshiruv', role: 'system', now, rates });
  const { st, drift } = stockReplay(ops.moves);
  const unknownMethods = ops.entries.filter((e) => e.type === 'payment' && e.method === UNKNOWN_METHOD && !e.reversedBy).length;
  const missingRates = ops.entries.filter((e) => e.cur !== 'UZS' && e.rate == null).length;
  return {
    pendingPostings: dry.ok ? dry.entries.filter((e) => e.type !== 'reversal').length : null,
    pendingReversals: dry.ok ? dry.reversed.length : null,
    blockedSales: dry.ok ? 0 : dry.errors.length,
    stockDrift: drift,
    negativeStock: Object.values(st).filter((s) => s.qty < 0).length,
    unknownMethods, missingRates,
    issues: ops.issues.slice(-20),
  };
}
/** Jurnal yozuvlari (kassa, sotuv, xarid, xarajat, ombor harakatlari) — yangi birinchi. */
function journalRows(ops, from, to) {
  const rows = [];
  for (const e of ops.entries) {
    if (!(e.day >= from && e.day <= to)) continue;
    rows.push({ kind: 'entry', id: e.id, day: e.day, at: e.at, type: e.type, reversedKind: e.reversedKind || null, reverses: e.reverses || null,
      amountMinor: e.amountMinor, cur: e.cur, uzsMinor: e.amountUzsMinor, cashMinor: e.cashMinor || 0, method: e.method || null, status: e.status || null,
      refTx: e.refTx || null, refClient: e.refClient || null, category: e.category || null, by: e.byName || e.by || null, reversedBy: e.reversedBy || null,
      supplier: e.supplier || null, lines: e.lines ? e.lines.length : 0, unlinked: e.unlinked || 0 });
  }
  for (const m of ops.moves) {
    if (!(m.day >= from && m.day <= to)) continue;
    const p = ops.products[m.productId];
    rows.push({ kind: 'move', id: m.id, day: m.day, at: m.at, type: m.kind, productId: m.productId, product: p ? p.name : '—', qtyMilli: m.qtyMilli,
      costMinor: m.costMinor, cur: p ? p.cur : 'UZS', uzsMinor: m.costUzsMinor, reason: m.reason || null, refEntry: m.ref ? m.ref.entry || m.ref.reverses || null : null,
      by: m.byName || m.by || null, reversedBy: m.reversedBy || null });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return rows;
}
/** Eksport va AI uchun: bitta joyda barcha moliyaviy ko'rsatkichlar (davr bo'yicha). */
function summaryFor(ops, from, to, rates) {
  const prev = prevRange(from, to);
  return {
    period: { from, to }, prevPeriod: prev,
    pnl: pnl(ops, from, to), prevPnl: pnl(ops, prev.from, prev.to),
    cash: cashReport(ops, from, to, rates),
    topProducts: topProducts(ops, from, to),
    byEmployee: byEmployee(ops, from, to),
  };
}

module.exports = {
  CURS, METHODS, UNKNOWN_METHOD, PENDING_METHODS, DEFAULT_EXPENSE_CATS,
  newOps, ensureOps, stockApply, stockReplay, onHandOf,
  projectionKey, projectBlob, commitProjection, audit, idem,
  saveProduct, addCategory, deleteCategory, addPurchase, addExpense, addCashAdjust, confirmPayment,
  setCashStart, activate, manualMove, reverseManual, cashNative,
  aggregate, sumRows, periodRows, prevRange, pnl, cashReport, byEmployee, topProducts, stockSummary, debtSummary,
  reconcile, journalRows, summaryFor,
  helpers: { rid, isCur, isNum, dayOf, isDay, addDays, startOfDayIso, minorOf, milliOf, rateOf, uzsOf, txDay, weekKey, monthKey, yearKey, cleanStr, minorOfCur: minorOf },
  ISSUES_KEEP, STOCK_KINDS,
};
