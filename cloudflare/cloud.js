// Qarzim — vaqtinchalik bulut (Cloudflare D1). server.js dagi /api/cloud/* bilan bir xil shartnoma:
//   GET  /api/cloud/ping
//   GET|PUT|DELETE /api/cloud/qd_idx/<login>.json   — hisob (login, egasi, rol, parol xeshi)
//   GET|PUT        /api/cloud/qd/<do'kon>.json      — do'kon ma'lumoti (mijozlar, qarzlarim, o'chirish belgilari)
//   GET  /api/cloud/log                             — harakatlar jurnali
// Qoidalar (rollar, birlashtirish, tombstone) server.js dan aynan ko'chirilgan — server olingach ma'lumot shu ko'rinishda ko'chadi.
// Parol: X-Qd-Auth (ilova xeshi) serverda PBKDF2-SHA256 bilan qayta xeshlanadi (alg: "pbkdf2").

const ROLES = {
  owner: ['view', 'write', 'edit', 'delete', 'reports', 'lenders', 'log', 'messages', 'backup', 'staff', 'admin',
    'inv_view', 'inv_edit', 'inv_move', 'inv_adjust', 'inv_override', 'cash_view', 'expense', 'fin_reports', 'ai'],
  manager: ['view', 'write', 'edit', 'delete', 'reports', 'lenders', 'log', 'messages', 'backup',
    'inv_view', 'inv_edit', 'inv_move', 'inv_adjust', 'cash_view', 'expense', 'fin_reports', 'ai'],
  cashier: ['view', 'write', 'reports', 'messages', 'inv_view'],
  employee: ['view', 'write', 'inv_view'],
};
const ROLE_KEYS = ['manager', 'cashier', 'employee'];
const roleOf = (key, rec) => (!rec ? null : (!rec.owner || rec.owner === key ? 'owner' : (ROLE_KEYS.includes(rec.role) ? rec.role : 'employee')));
const hasPerm = (role, p) => (ROLES[role] || []).includes(p);

const PBKDF2_ITER = 20000;
const CHUNK = 600000;                 // D1 qator chegarasi 2 MB: katta ma'lumot bo'laklarga bo'linadi
const MAX_BODY = 12e6;

// ---------- yordamchilar ----------
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function pbkdf2(secret, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}
function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function readJson(req, max) {
  const len = +req.headers.get('content-length') || 0;
  if (len > max) throw Object.assign(new Error('big'), { status: 413 });
  const text = await req.text();
  if (text.length > max) throw Object.assign(new Error('big'), { status: 413 });
  return text ? JSON.parse(text) : {};
}

// ---------- saqlash (D1) ----------
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS qd_cloud (kind TEXT NOT NULL, key TEXT NOT NULL, part INTEGER NOT NULL DEFAULT 0, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind, key, part))').run();
  schemaReady = true;
}
const store = {
  async get(db, kind, key) {
    const r = await db.prepare('SELECT value FROM qd_cloud WHERE kind = ?1 AND key = ?2 ORDER BY part').bind(kind, key).all();
    if (!r.results || !r.results.length) return null;
    return JSON.parse(r.results.map((x) => x.value).join(''));
  },
  async put(db, kind, key, value) {
    const text = JSON.stringify(value), at = new Date().toISOString(), stmts = [db.prepare('DELETE FROM qd_cloud WHERE kind = ?1 AND key = ?2').bind(kind, key)];
    for (let i = 0, part = 0; i < text.length || part === 0; i += CHUNK, part++) {
      stmts.push(db.prepare('INSERT INTO qd_cloud (kind, key, part, value, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(kind, key, part, text.slice(i, i + CHUNK), at));
    }
    await db.batch(stmts);                // bitta tranzaksiya: yarim yozilgan holat qolmaydi
  },
  async del(db, kind, key) { await db.prepare('DELETE FROM qd_cloud WHERE kind = ?1 AND key = ?2').bind(kind, key).run(); },
};

// ---------- birlashtirish (server.js reconcile bilan bir xil) ----------
const tombLive = (t) => !t.r || t.r < t.t;
const VOLATILE_CLIENT = ['_m', 'transactions', 'by', 'cur', 'promiseDate'];
const VOLATILE_TX = ['_m', 'by', 'cur'];
const canon = (v, drop) => JSON.stringify(v, (k, x) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  const o = {};
  for (const kk of Object.keys(x).sort()) if (!(k === '' && drop && drop.includes(kk))) o[kk] = x[kk];
  return o;
});
function reconcile(prev, next) {
  const need = new Set(), events = [];
  const num = (x) => Number(x) || 0;
  const byId = (list) => new Map((list || []).filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
  const mergedDel = new Map();
  for (const t of [...(prev.del || []), ...(next.del || [])]) {
    if (!t || typeof t.id !== 'string') continue;
    const o = mergedDel.get(t.id);
    mergedDel.set(t.id, { id: t.id, t: Math.max(t.t || 0, o ? o.t || 0 : 0), r: Math.max(t.r || 0, o ? o.r || 0 : 0) });
  }
  const prevDead = new Set((prev.del || []).filter((t) => t && typeof t.id === 'string' && tombLive(t)).map((t) => t.id));
  const dead = new Set(), newDead = new Set();
  for (const [id, t] of mergedDel) if (tombLive(t)) { dead.add(id); if (!prevDead.has(id)) newDead.add(id); }
  const txMerge = (p, c) => {
    const pt = byId(p && p.transactions), nt = byId(c.transactions), txs = [];
    for (const tid of new Set([...pt.keys(), ...nt.keys()])) {
      const o = pt.get(tid), t = nt.get(tid);
      if (dead.has(tid)) { if (o && newDead.has(tid)) { need.add('delete'); events.push({ action: 'tx_del', name: c.name, amount: num(o.amount), cur: o.cur || c.cur || 'UZS' }); } continue; }
      if (!o) { need.add('write'); events.push({ action: t.type === 'payment' ? 'payment' : 'debt', name: c.name, amount: num(t.amount), cur: t.cur || c.cur || 'UZS' }); txs.push(t); }
      else if (!t) txs.push(o);
      else { if (canon(t, VOLATILE_TX) !== canon(o, VOLATILE_TX)) { need.add('edit'); events.push({ action: 'tx_edit', name: c.name, amount: num(t.amount), cur: t.cur || c.cur || 'UZS' }); } txs.push(t); }
    }
    return Object.assign({}, c, { transactions: txs });
  };
  const out = { clients: [], lenders: [] };
  for (const sec of ['clients', 'lenders']) {
    const pm = byId(prev[sec]), nm = byId(next[sec]);
    for (const id of new Set([...pm.keys(), ...nm.keys()])) {
      const p = pm.get(id), c = nm.get(id);
      if (dead.has(id)) { if (p && newDead.has(id)) { need.add('delete'); events.push({ action: 'client_del', name: p.name }); } continue; }
      if (!p) { need.add('write'); events.push({ action: 'client_add', name: c.name }); out[sec].push(txMerge(null, c)); continue; }
      if (!c) { out[sec].push(p); continue; }
      if (canon(c, VOLATILE_CLIENT) !== canon(p, VOLATILE_CLIENT)) { need.add('edit'); events.push({ action: 'client_edit', name: c.name }); }
      out[sec].push(txMerge(p, c));
    }
  }
  const del = [...mergedDel.values()].sort((a, b) => a.t - b.t).slice(-3000);
  return { need: [...need], events, clients: out.clients, lenders: out.lenders, del };
}
async function auditLog(db, shop, actor, role, events) {
  if (!events.length) return;
  const at = new Date().toISOString();
  const rows = events.length > 25
    ? [{ at, by: actor, role, action: 'bulk', text: `${events.length} ta o'zgarish saqlandi` }]
    : events.map((e) => ({ at, by: actor, role, action: e.action, name: e.name, amount: e.amount, cur: e.cur, text: e.text }));
  const cur = (await store.get(db, 'audit', shop)) || [];
  await store.put(db, 'audit', shop, cur.concat(rows).slice(-1000));
}

// ---------- himoya: noto'g'ri urinishlar ----------
const fails = new Map();
const failCount = (ip) => { const r = fails.get(ip); return r && Date.now() - r.t < 600e3 ? r.n : 0; };
const noteFail = (ip) => { const r = fails.get(ip); if (!r || Date.now() - r.t > 600e3) fails.set(ip, { n: 1, t: Date.now() }); else r.n++; if (fails.size > 5000) fails.clear(); };
const verified = new Map();          // tekshirilgan parollar keshi (isolate ichida): har 20 soniyalik sinxronlashda PBKDF2 qayta hisoblanmasin

async function checkAuth(db, user, auth) {
  if (!user || !auth || auth.length > 200) return { me: null, authed: false };
  const me = await store.get(db, 'idx', user);
  if (!me) return { me: null, authed: false };
  const ck = user + '\n' + auth;
  const c = verified.get(ck);
  if (c && c === me.h) return { me, authed: true };
  const ok = safeEq(await pbkdf2(auth, me.salt), me.h);
  if (ok) { verified.set(ck, me.h); if (verified.size > 2000) verified.clear(); }
  return { me, authed: ok };
}

// ---------- marshrutlar ----------
export async function cloudApi(req, env, p) {
  if (!env.DB) return json(503, { error: 'storage_unavailable' });
  const ip = req.headers.get('CF-Connecting-IP') || '?';
  if (failCount(ip) > 30) return json(429, { error: 'rate_limit' });
  try {
    const res = await route(req, env.DB, p);
    if (res.status === 401 || res.status === 403) noteFail(ip);
    return res;
  } catch (e) {
    if (e && e.status === 413) return json(413, { error: 'too_large' });
    if (e instanceof SyntaxError) return json(400, { error: 'bad_request' });
    console.error('bulut xatosi:', e && e.message);
    return json(503, { error: 'storage_unavailable' });
  }
}

async function route(req, db, p) {
  if (p === '/api/cloud/ping') return json(200, { ok: true, cloud: true, store: 'd1' });
  await ensureSchema(db);
  const user = String(req.headers.get('x-qd-user') || '').slice(0, 80), auth = String(req.headers.get('x-qd-auth') || '');
  const { me, authed } = await checkAuth(db, user, auth);
  const role = authed ? roleOf(user, me) : null;
  const shop = authed ? (me.owner || user) : null;

  if (p.startsWith('/api/cloud/ops')) {
    if (!authed) return json(401, { error: 'auth' });
    return json(503, { error: 'not_available', message: 'Ombor va moliya bo‘limi server ulangandan keyin ishlaydi. Qarz daftari bulutda saqlanmoqda.' });
  }
  if (p === '/api/cloud/log') {
    if (!authed) return json(401, { error: 'auth' });
    if (!hasPerm(role, 'log')) return json(403, { error: 'forbidden' });
    const a = (await store.get(db, 'audit', shop)) || [];
    return json(200, { entries: a.slice(-300).reverse() });
  }
  if (p === '/api/cloud/backup-status') return json(404, { error: 'not_available' });

  const m = p.match(/^\/api\/cloud\/(qd|qd_idx)\/([A-Za-z0-9_.@-]{1,80})\.json$/);
  if (!m) return json(404, { error: 'not_found' });
  const kind = m[1], key = m[2];

  if (kind === 'qd_idx') {
    const cur = await store.get(db, 'idx', key);
    const isSelf = authed && user === key;
    const isMgrOf = (rec) => authed && !!rec && !!rec.owner && rec.owner !== key && rec.owner === user && role === 'owner';
    if (req.method === 'GET') {
      if (!cur) return json(200, null);
      if (auth) { if (!isSelf) return json(403, { error: 'bad_credentials' }); return json(200, { username: cur.username, owner: cur.owner, role: roleOf(key, cur), ph: auth }); }
      return json(200, { username: cur.username, owner: cur.owner, ph: null });
    }
    if (req.method === 'PUT') {
      const b = await readJson(req, 4e4);
      if (!b || typeof b.ph !== 'string' || b.ph.length < 4 || b.ph.length > 200) return json(400, { error: 'bad_request' });
      const owner = String(b.owner || key).slice(0, 80);
      const wantRole = ROLE_KEYS.includes(b.role) ? b.role : null;
      if (!cur) {
        const selfSignup = owner === key;
        if (!selfSignup && !(authed && user === owner && hasPerm(role, 'staff'))) return json(403, { error: 'forbidden' });
        const salt = randHex(12);
        const nu = { username: String(b.username || key).slice(0, 80), owner, salt, alg: 'pbkdf2', h: await pbkdf2(b.ph, salt) };
        if (!selfSignup) nu.role = wantRole || 'employee';
        await store.put(db, 'idx', key, nu);
        if (!selfSignup) await auditLog(db, owner, me.username, 'owner', [{ action: 'staff_add', name: nu.username, text: nu.role }]);
        return json(200, { ok: true });
      }
      const selfUpd = isSelf && owner === cur.owner;
      const staffUpd = isMgrOf(cur) && owner === cur.owner && hasPerm(role, 'staff');
      if (!(selfUpd || staffUpd)) return json(403, { error: 'forbidden' });
      const nu = { username: String(b.username || cur.username || key).slice(0, 80), owner: cur.owner, salt: cur.salt, alg: 'pbkdf2', h: await pbkdf2(b.ph, cur.salt) };
      if (cur.owner !== key) nu.role = staffUpd && wantRole ? wantRole : (cur.role || 'employee');
      if (cur.h !== nu.h || cur.username !== nu.username || cur.role !== nu.role) {
        await store.put(db, 'idx', key, nu);
        if (staffUpd) await auditLog(db, cur.owner, me.username, 'owner', [{ action: 'staff_edit', name: nu.username, text: nu.role }]);
      }
      return json(200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!cur) return json(200, { ok: true });
      if (cur.owner === key) return json(400, { error: 'use_delete_account' });
      if (!(isSelf || isMgrOf(cur))) return json(403, { error: 'forbidden' });
      await store.del(db, 'idx', key);
      if (!isSelf) await auditLog(db, cur.owner, me.username, 'owner', [{ action: 'staff_del', name: cur.username }]);
      return json(200, { ok: true });
    }
    return json(405, { error: 'method' });
  }

  // qd: do'kon ma'lumoti — faqat shu do'kon a'zolari
  if (!authed || shop !== key) return json(authed ? 403 : 401, { error: authed ? 'forbidden' : 'auth' });
  const canLenders = hasPerm(role, 'lenders');
  if (req.method === 'GET') {
    const data = await store.get(db, 'data', key);
    if (!data) return json(200, null);
    return json(200, { ...data, lenders: canLenders ? (data.lenders || []) : [] });
  }
  if (req.method === 'PUT') {
    const b = await readJson(req, MAX_BODY);
    if (!b || typeof b !== 'object' || !Array.isArray(b.clients) || !Array.isArray(b.lenders)) return json(400, { error: 'bad_request' });
    const valid = (x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 80;
    const prev = (await store.get(db, 'data', key)) || { clients: [], lenders: [], del: [] };
    const next = {
      clients: b.clients.filter(valid).slice(0, 5000),
      lenders: canLenders ? b.lenders.filter(valid).slice(0, 5000) : (prev.lenders || []),
      del: Array.isArray(b.del) ? b.del.filter(valid).slice(-3000) : [],
    };
    const r = reconcile(prev, next);
    const missing = r.need.find((n) => !hasPerm(role, n));
    if (missing) return json(403, { error: 'forbidden', need: missing });
    await store.put(db, 'data', key, { ts: Date.now(), clients: r.clients, lenders: r.lenders, del: r.del });
    await auditLog(db, shop, me.username, role, r.events);
    return json(200, { ok: true, posted: 0 });
  }
  return json(405, { error: 'method' });
}

export const _test = { reconcile, roleOf, hasPerm, pbkdf2 };
