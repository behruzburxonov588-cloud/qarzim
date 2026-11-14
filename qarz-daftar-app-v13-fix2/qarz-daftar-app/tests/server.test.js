'use strict';
// Real-process tests: every server runs as a child process against a throwaway data directory in the OS temp folder.
// Nothing here touches the real data.json or backups of the application.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const APP = process.env.QD_APP || (fs.existsSync(path.resolve(__dirname, '..', 'server.js')) ? path.resolve(__dirname, '..') : path.resolve(__dirname, '..', 'src', 'qarz-daftar-app'));
const ADMIN_KEY = 'admin-test-key-' + 'x'.repeat(24);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return {
    base, out: () => out,
    stop: async () => { const exited = new Promise((r) => child.once('exit', r)); child.kill('SIGTERM'); await exited; },
  };
}
function cli(args, dataDir, extraEnv = {}) {
  // async on purpose: the Supabase tests serve a fake PostgREST from this same process, which must keep answering
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["server.js", ...args], { cwd: APP, env: { ...process.env, DATA_FILE: requireTemp(path.join(dataDir, "data.json")), BACKUP_DIR: path.join(dataDir, "backups"), ...extraEnv } });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    child.on("exit", (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
  });
}
const J = (method, url, body, hdr = {}) => fetch(url, { method, headers: { 'Content-Type': 'application/json', ...hdr }, body: body === undefined ? undefined : JSON.stringify(body) });
const who = (u, ph) => ({ 'X-Qd-User': u, 'X-Qd-Auth': ph });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const c1 = () => ({ id: 'c1', name: 'Ali', phone: '+998901112233', transactions: [{ id: 't1', type: 'debt', amount: 500000, ts: 1 }] });
const lender = () => ({ id: 'l1', name: 'Bank', transactions: [{ id: 'lt1', type: 'debt', amount: 1000, ts: 1 }] });

// ---------------------------------------------------------------- roles, data safety, account security
describe('roles, data safety and account security', () => {
  let srv, B, dir, O, M, K, X;
  const putData = (h, body) => J('PUT', `${B}/api/cloud/qd/owner.json`, body, h);
  const getData = async (h) => { const r = await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, h); return r.status === 200 ? r.json() : r; };

  before(async () => {
    dir = tempDir('roles'); srv = await startServer(dir); B = srv.base;
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0001', owner: 'owner' })).status, 200);
    O = who('owner', 'OWNER-PH-0001');
    for (const [k, u, ph, role] of [['mgr', 'Mgr', 'MGR-PH-00001', 'manager'], ['kassir', 'Kassir', 'KASS-PH-00001', 'cashier'], ['xodim', 'Xodim', 'XODIM-PH-0001', 'employee']]) {
      assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/${k}.json`, { username: u, ph, owner: 'owner', role }, O)).status, 200, 'owner creates ' + role);
    }
    M = who('mgr', 'MGR-PH-00001'); K = who('kassir', 'KASS-PH-00001'); X = who('xodim', 'XODIM-PH-0001');
  });
  after(async () => { await srv.stop(); });

  test('owner stores and reads the ledger', async () => {
    assert.equal((await putData(O, { clients: [c1()], lenders: [lender()], del: [] })).status, 200);
    const d = await getData(O); assert.equal(d.clients.length, 1); assert.equal(d.lenders.length, 1);
  });
  test('a PUT without clients/lenders arrays is rejected and nothing is wiped', async () => {
    assert.equal((await putData(O, { ts: 5 })).status, 400);
    assert.equal((await getData(O)).clients.length, 1);
  });
  test('employee and cashier never receive lenders; manager does', async () => {
    assert.deepEqual((await getData(X)).lenders, []);
    assert.deepEqual((await getData(K)).lenders, []);
    assert.equal((await getData(M)).lenders.length, 1);
  });
  test('employee can record a new debt', async () => {
    const d = await getData(X); d.clients[0].transactions.push({ id: 't2', type: 'debt', amount: 30000, ts: 2 });
    assert.equal((await putData(X, { clients: d.clients, lenders: [], del: [] })).status, 200);
    assert.equal((await getData(O)).clients[0].transactions.length, 2);
  });
  test('employee cannot edit a customer name (needs edit permission)', async () => {
    const d = await getData(O); d.clients[0].name = 'Boshqa';
    const r = await putData(X, { clients: d.clients, lenders: [], del: [] });
    assert.equal(r.status, 403); assert.equal((await r.json()).need, 'edit');
    assert.equal((await getData(O)).clients[0].name, 'Ali');
  });
  test('a stale device that omits a customer does not delete it (no tombstone)', async () => {
    assert.equal((await putData(X, { clients: [], lenders: [], del: [] })).status, 200);
    assert.equal((await getData(O)).clients.length, 1);
  });
  test('employee cannot delete a customer even with a tombstone', async () => {
    const r = await putData(X, { clients: [], lenders: [], del: [{ id: 'c1', t: Date.now() }] });
    assert.equal(r.status, 403); assert.equal((await r.json()).need, 'delete');
    assert.equal((await getData(O)).clients.length, 1);
  });
  test('cashier can add a payment but cannot edit', async () => {
    const d = await getData(K); d.clients[0].transactions.push({ id: 't3', type: 'payment', amount: 10000, ts: 3 });
    assert.equal((await putData(K, { clients: d.clients, lenders: [], del: [] })).status, 200);
    const e = await getData(K); e.clients[0].phone = '+998900000000';
    assert.equal((await putData(K, { clients: e.clients, lenders: [], del: [] })).status, 403);
  });
  test('manager can delete with a tombstone', async () => {
    assert.equal((await putData(M, { clients: [], lenders: [], del: [{ id: 'c1', t: Date.now() }] })).status, 200);
    assert.equal((await getData(O)).clients.length, 0);
  });
  test('a stale device cannot resurrect a deleted customer', async () => {
    const r = await putData(X, { clients: [c1()], lenders: [], del: [{ id: 'c1', t: Date.now() }] });
    assert.equal(r.status, 200);
    assert.equal((await getData(O)).clients.length, 0);
  });
  test('audit log shows who did what; staff cannot read it', async () => {
    const r = await J('GET', `${B}/api/cloud/log`, undefined, O); assert.equal(r.status, 200);
    const { entries } = await r.json();
    assert.ok(entries.some((e) => e.action === 'payment' && e.by === 'Kassir' && e.amount === 10000), 'cashier payment logged');
    assert.ok(entries.some((e) => e.action === 'client_del' && e.by === 'Mgr' && e.name === 'Ali'), 'manager deletion logged');
    assert.ok(entries.some((e) => e.action === 'debt' && e.by === 'Xodim' && e.amount === 30000), 'employee debt logged');
    assert.equal((await J('GET', `${B}/api/cloud/log`, undefined, X)).status, 403);
    assert.equal((await J('GET', `${B}/api/cloud/log`, undefined, K)).status, 403);
  });
  test('SMS and billing endpoints respect roles', async () => {
    const settings = (h) => J('POST', `${B}/api/sms/settings`, { auto_enabled: false }, h);
    assert.equal((await settings(X)).status, 403);
    assert.equal((await settings(K)).status, 403);
    assert.equal((await settings(M)).status, 200);
    const send = (h) => J('POST', `${B}/api/sms/send`, { items: [{ phone: '+998901112233', text: 'Salom' }] }, h);
    assert.equal((await send(X)).status, 403, 'employee cannot send messages');
    assert.equal((await send(K)).status, 402, 'cashier passes the gate (no SMS credits here)');
    assert.equal((await J('POST', `${B}/api/sms/buy`, { sms: 25 }, K)).status, 403, 'only owner buys packages');
  });
  test('an employee cannot promote themselves by sending a role', async () => {
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/xodim.json`, { username: 'Xodim', ph: 'XODIM-PH-0001', owner: 'owner', role: 'manager' }, X)).status, 200);
    const r = await (await J('GET', `${B}/api/cloud/qd_idx/xodim.json`, undefined, X)).json();
    assert.equal(r.role, 'employee');
  });
  test('owner can reset a staff password; the old one stops working', async () => {
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/xodim.json`, { username: 'Xodim', ph: 'XODIM-NEW-PH-9', owner: 'owner', role: 'employee' }, O)).status, 200);
    assert.equal((await J('GET', `${B}/api/cloud/qd_idx/xodim.json`, undefined, who('xodim', 'XODIM-PH-0001'))).status, 403);
    assert.equal((await J('GET', `${B}/api/cloud/qd_idx/xodim.json`, undefined, who('xodim', 'XODIM-NEW-PH-9'))).status, 200);
  });
  test('manager cannot manage staff; nobody but the owner can change the owner login', async () => {
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/xodim.json`, { username: 'Xodim', ph: 'HACK-PH-000001', owner: 'owner' }, M)).status, 403);
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'HACK-PH-000002', owner: 'owner' }, X)).status, 403);
    assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'HACK-PH-000003', owner: 'owner' }, K)).status, 403);
    assert.equal((await J('GET', `${B}/api/cloud/qd_idx/owner.json`, undefined, who('owner', 'HACK-PH-000003'))).status, 403);
  });
  test('removing a staff member revokes their cloud access immediately', async () => {
    const xo = who('xodim', 'XODIM-NEW-PH-9');
    assert.equal((await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, xo)).status, 200);
    assert.equal((await J('DELETE', `${B}/api/cloud/qd_idx/xodim.json`, undefined, O)).status, 200);
    assert.equal((await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, xo)).status, 401);
  });
  test('employees cannot delete the owner or other staff; owner needs account deletion', async () => {
    assert.equal((await J('DELETE', `${B}/api/cloud/qd_idx/mgr.json`, undefined, K)).status, 403);
    assert.equal((await J('DELETE', `${B}/api/cloud/qd_idx/owner.json`, undefined, O)).status, 400);
  });
  test('the legacy x-account/x-token login path is gone', async () => {
    const r = await fetch(B + '/api/sms/state', { headers: { 'X-Account': 'victim', 'X-Token': 'token-of-attacker-12345' } });
    assert.equal(r.status, 401);
  });
  test('pages send a Content-Security-Policy and anti-clickjacking headers; API responses do not', async () => {
    const page = await fetch(B + '/');
    assert.match(page.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('strict-transport-security'), null, 'no HSTS over plain http');
    const api = await fetch(B + '/api/app-version?v=1.0.0');
    assert.equal(api.headers.get('content-security-policy'), null);
  });
  test('account deletion: cashier cannot; owner needs the confirmation word; then everything is gone', async () => {
    assert.equal((await J('POST', `${B}/api/sms/delete-account`, { confirm: 'DELETE' }, K)).status, 403);
    assert.equal((await J('POST', `${B}/api/sms/delete-account`, { confirm: 'nope' }, O)).status, 400);
    assert.equal((await J('POST', `${B}/api/sms/delete-account`, { confirm: 'DELETE' }, O)).status, 200);
    assert.equal((await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, O)).status, 401);
    assert.equal((await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, M)).status, 401);
  });
});

// ---------------------------------------------------------------- backups: admin, rotation, disaster recovery
describe('backups: status, rotation and restore (file mode)', () => {
  test('admin triggers a backup; admin key is required; owner sees status without paths', async () => {
    const dir = tempDir('bak'), srv = await startServer(dir), B = srv.base;
    try {
      assert.equal((await fetch(B + '/api/admin/backup/status')).status, 403);
      assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0001', owner: 'owner' })).status, 200);
      const O = who('owner', 'OWNER-PH-0001');
      await J('PUT', `${B}/api/cloud/qd/owner.json`, { clients: [c1()], lenders: [], del: [] }, O);
      const r = await fetch(B + '/api/admin/backup/now', { method: 'POST', headers: { 'X-Admin-Key': ADMIN_KEY } });
      assert.equal(r.status, 200);
      const st = await (await fetch(B + '/api/admin/backup/status', { headers: { 'X-Admin-Key': ADMIN_KEY } })).json();
      assert.ok(st.count >= 1); assert.equal(st.ok, true); assert.ok(st.lastAt);
      const own = await (await J('GET', `${B}/api/cloud/backup-status`, undefined, O)).json();
      assert.equal(own.ok, true); assert.equal(own.dir, undefined, 'paths are not exposed to shop owners');
      assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((n) => /^qd-backup-.*-manual\.json$/.test(n)));
    } finally { await srv.stop(); }
  });

  test('disaster recovery: lost data file is restored from backup; staff can log in again', async () => {
    const dir = tempDir('dr');
    let srv = await startServer(dir), B = srv.base;
    const O = who('owner', 'OWNER-PH-0001'), X = who('xodim', 'XODIM-PH-0001');
    await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0001', owner: 'owner' });
    await J('PUT', `${B}/api/cloud/qd_idx/xodim.json`, { username: 'Xodim', ph: 'XODIM-PH-0001', owner: 'owner', role: 'employee' }, O);
    await J('PUT', `${B}/api/cloud/qd/owner.json`, { clients: [c1()], lenders: [lender()], del: [] }, O);
    const before = await (await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, O)).json();
    await srv.stop();                                           // stopping saves the final state
    const made = await cli(['backup'], dir);
    assert.equal(made.status, 0, made.stderr || made.stdout);
    const backupFile = fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.endsWith('-manual.json')).sort().pop();
    const bpath = path.join(dir, 'backups', backupFile);

    fs.unlinkSync(path.join(dir, 'data.json'));                 // disaster: the data file is gone
    const noConfirm = await cli(['restore', bpath], dir);
    assert.equal(noConfirm.status, 1); assert.ok(!fs.existsSync(path.join(dir, 'data.json')), 'nothing restored without --confirm');
    const ok = await cli(['restore', bpath, '--confirm'], dir);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((n) => n.endsWith('-pre-restore.json')), 'current state saved before restore');

    srv = await startServer(dir); B = srv.base;
    try {
      const after = await (await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, who('owner', 'OWNER-PH-0001'))).json();
      assert.deepEqual(after.clients, before.clients);
      assert.deepEqual(after.lenders, before.lenders);
      assert.equal((await J('GET', `${B}/api/cloud/qd_idx/xodim.json`, undefined, X)).status, 200, 'staff login restored');
    } finally { await srv.stop(); }
  });

  test('restore refuses while the server is running, and refuses bad files without touching data', async () => {
    const dir = tempDir('guard');
    const srv = await startServer(dir), B = srv.base;
    await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0001', owner: 'owner' });
    const bak = await cli(['backup'], dir); assert.equal(bak.status, 0, bak.stderr);
    const bpath = path.join(dir, 'backups', fs.readdirSync(path.join(dir, 'backups')).pop());
    try {
      const running = await cli(['restore', bpath, '--confirm'], dir);
      assert.equal(running.status, 1); assert.match(running.stderr + running.stdout, /ishlayapti/);
    } finally { await srv.stop(); }
    const data = path.join(dir, 'data.json'), before = sha(data);
    const garbage = path.join(dir, 'garbage.json'); fs.writeFileSync(garbage, '{"format":"nope"}');
    const bad = await cli(['restore', garbage, '--confirm'], dir);
    assert.equal(bad.status, 1); assert.equal(sha(data), before, 'data file unchanged after a rejected restore');
  });

  test('backups rotate: only the newest BACKUP_KEEP files remain', async () => {
    const dir = tempDir('rot');
    for (let i = 0; i < 5; i++) assert.equal((await cli(['backup'], dir, { BACKUP_KEEP: '3' })).status, 0);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 3);
  });

  test('an automatic backup is taken on startup (no manual step needed)', async () => {
    const dir = tempDir('auto'), srv = await startServer(dir);
    try {
      let files = [];
      for (let i = 0; i < 60 && !files.length; i++) { await sleep(200); try { files = fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.endsWith('-auto.json')); } catch (e) { /* not yet */ } }
      assert.ok(files.length >= 1, 'an auto backup exists after the first scheduler tick');
    } finally { await srv.stop(); }
  });

  test('a second server on the same data file refuses to start', async () => {
    const dir = tempDir('lock');
    const srv = await startServer(dir);
    try {
      const port = await freePort();
      const second = spawnSync(process.execPath, ['server.js'], { cwd: APP, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), ESKIZ_TEST_MODE: '1' } });
      assert.equal(second.status, 1);
      assert.match(second.stderr + second.stdout, /allaqachon ishlayapti/);
    } finally { await srv.stop(); }
  });
});

// ---------------------------------------------------------------- Supabase mode, against a fake PostgREST
function fakeSupabase() {
  const rows = new Map(); let failDelete = false;
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__fail') { failDelete = u.searchParams.get('on') === '1'; return res.end('ok'); }
    if (!u.pathname.startsWith('/rest/v1/qd_cloud')) { res.statusCode = 404; return res.end(); }
    if (req.headers.apikey !== 'svc-test-key') { res.statusCode = 401; return res.end('{}'); }
    const body = await new Promise((r) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => r(s)); });
    const filters = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (k === 'kind' || k === 'key') { const m = /^eq\.(.*)$/.exec(v); if (m) filters.push((r) => String(r[k]) === m[1]); }
      if (k === 'or') {
        const ors = v.slice(1, -1).split(',').map((t) => { const m = /^(key|value->>owner)\.eq\.(.*)$/.exec(t); return m ? (r) => (m[1] === 'key' ? r.key : r.value.owner) === m[2] : () => false; });
        filters.push((r) => ors.some((f) => f(r)));
      }
    }
    const matching = () => [...rows.values()].filter((r) => filters.every((f) => f(r)));
    if (req.method === 'GET') {
      const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1000);
      const out = matching().sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key)).slice(off, off + lim);
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(out));
    }
    if (req.method === 'POST') {
      for (const r of JSON.parse(body || '[]')) rows.set(r.kind + '|' + r.key, { kind: r.kind, key: r.key, value: r.value, updated_at: r.updated_at });
      res.statusCode = 201; return res.end();
    }
    if (req.method === 'DELETE') {
      if (failDelete) { res.statusCode = 500; return res.end('{"message":"simulated outage"}'); }
      for (const r of matching()) rows.delete(r.kind + '|' + r.key);
      res.statusCode = 204; return res.end();
    }
    res.statusCode = 405; res.end();
  });
  return { srv, rows, setFail: (on) => (failDelete = on) };
}
describe('Supabase mode (fake PostgREST)', () => {
  let fake, fakeBase, fakeCtl;
  before(async () => {
    fakeCtl = fakeSupabase();
    await new Promise((r) => fakeCtl.srv.listen(0, '127.0.0.1', r));
    fakeBase = `http://127.0.0.1:${fakeCtl.srv.address().port}`;
  });
  after(() => fakeCtl.srv.close());

  test('a failed cloud delete is reported, and the account is kept', async () => {
    const dir = tempDir('sb'), env = { SUPABASE_URL: fakeBase, SUPABASE_SERVICE_KEY: 'svc-test-key' };
    const srv = await startServer(dir, env), B = srv.base;
    try {
      assert.equal((await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0001', owner: 'owner' })).status, 200);
      const O = who('owner', 'OWNER-PH-0001');
      assert.equal((await J('PUT', `${B}/api/cloud/qd/owner.json`, { clients: [c1()], lenders: [], del: [] }, O)).status, 200);
      assert.ok(fakeCtl.rows.has('data|owner'), 'ledger stored in the cloud table');
      fakeCtl.setFail(true);
      const r = await J('POST', `${B}/api/sms/delete-account`, { confirm: 'DELETE' }, O);
      assert.equal(r.status, 503); assert.equal((await r.json()).error, 'delete_failed');
      assert.equal((await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, O)).status, 200, 'account still usable after failed delete');
      fakeCtl.setFail(false);
      assert.equal((await J('POST', `${B}/api/sms/delete-account`, { confirm: 'DELETE' }, O)).status, 200);
      assert.ok(!fakeCtl.rows.has('data|owner') && ![...fakeCtl.rows.keys()].some((k) => k.startsWith('idx|')), 'cloud rows removed');
    } finally { await srv.stop(); }
  });

  test('a Supabase backup captures cloud rows and restores them after loss', async () => {
    const dir = tempDir('sbr'), env = { SUPABASE_URL: fakeBase, SUPABASE_SERVICE_KEY: 'svc-test-key' };
    let srv = await startServer(dir, env), B = srv.base;
    const O = who('owner', 'OWNER-PH-0002');
    await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner2', ph: 'OWNER-PH-0002', owner: 'owner' });
    await J('PUT', `${B}/api/cloud/qd/owner.json`, { clients: [c1()], lenders: [lender()], del: [] }, O);
    const before = await (await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, O)).json();
    const made = await fetch(B + '/api/admin/backup/now', { method: 'POST', headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(made.status, 200);
    await srv.stop();
    const file = fs.readdirSync(path.join(dir, 'backups')).find((n) => n.endsWith('-manual.json'));
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'backups', file), 'utf8'));
    assert.equal(j.mode, 'supabase'); assert.ok(j.cloud.length >= 2, 'cloud rows included');

    fakeCtl.rows.clear();                                       // disaster: the cloud table is emptied
    const r = await cli(['restore', path.join(dir, 'backups', file), '--confirm'], dir, env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    srv = await startServer(dir, env); B = srv.base;
    try {
      const after = await (await J('GET', `${B}/api/cloud/qd/owner.json`, undefined, O)).json();
      assert.deepEqual(after.clients, before.clients); assert.deepEqual(after.lenders, before.lenders);
    } finally { await srv.stop(); }
  });
});

// ---------------------------------------------------------------- support: app info and problem reports
describe('support: app info and problem reports', () => {
  let srv, B, dir;
  before(async () => {
    dir = tempDir('support'); srv = await startServer(dir, { SUPPORT_CONTACT: '@qarz_support_test' }); B = srv.base;
  });
  after(async () => { await srv.stop(); });

  test('app-info exposes the configured support contact', async () => {
    const r = await fetch(`${B}/api/app-info`); assert.equal(r.status, 200);
    assert.equal((await r.json()).support, '@qarz_support_test');
  });
  test('a too-short problem report is rejected', async () => {
    assert.equal((await J('POST', `${B}/api/support/report`, { message: 'hi' })).status, 400);
  });
  test('an anonymous problem report is stored and visible to the admin only', async () => {
    const r = await J('POST', `${B}/api/support/report`, { message: 'Sahifa ochilmayapti', contact: '+998900000001', page: 'settings' });
    assert.equal(r.status, 200);
    assert.equal((await fetch(`${B}/api/admin/reports`)).status, 403, 'public cannot list reports');
    const a = await fetch(`${B}/api/admin/reports`, { headers: { 'X-Admin-Key': ADMIN_KEY } });
    assert.equal(a.status, 200);
    const { reports } = await a.json();
    assert.equal(reports[0].message, 'Sahifa ochilmayapti');
    assert.equal(reports[0].shop, '', 'anonymous report has no shop');
  });
  test('a report from a signed-in owner is tied to their shop; a forged login is not', async () => {
    await J('PUT', `${B}/api/cloud/qd_idx/owner.json`, { username: 'Owner', ph: 'OWNER-PH-0009', owner: 'owner' });
    const ok = await J('POST', `${B}/api/support/report`, { message: 'Qarz qo‘shishda xato' }, who('owner', 'OWNER-PH-0009'));
    assert.equal(ok.status, 200);
    const forged = await J('POST', `${B}/api/support/report`, { message: 'Soxta login urinishi' }, who('owner', 'WRONG-PH-0009'));
    assert.equal(forged.status, 200);
    const { reports } = await (await fetch(`${B}/api/admin/reports`, { headers: { 'X-Admin-Key': ADMIN_KEY } })).json();
    const real = reports.find((x) => x.message.startsWith('Qarz')), fake = reports.find((x) => x.message.startsWith('Soxta'));
    assert.equal(real.shop, 'owner'); assert.equal(fake.shop, '');
  });
  test('reports are rate-limited per client (10 per hour)', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await J('POST', `${B}/api/support/report`, { message: 'Takroriy xabar ' + i })).status);
    assert.ok(statuses.includes(429), 'the 10-per-hour cap is enforced: ' + statuses.join(','));
  });
});
