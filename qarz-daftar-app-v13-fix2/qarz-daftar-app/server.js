#!/usr/bin/env node
/* Qarzim — SMS serveri (Eskiz.uz). Hech qanday paket kerak emas: faqat Node.js 18+.
   Ishga tushirish:  node server.js   →  http://localhost:3000
   Sozlamalar .env faylida (.env.example ga qarang). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const OPS = require('./lib/ops');                       // v11: ombor, kassa, moliya yadrosi
const { createOpsHttp } = require('./lib/ops-http');     // v11: /api/cloud/ops/* marshrutlari

// ---------- sozlamalar: env.txt yoki .env ----------
for (const fname of ['env.txt', '.env']) {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, fname), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* fayl yo'q — normal */ }
}
const env = (k, d = '') => process.env[k] || d;
const PORT = +env('PORT', '3000');
const DATA_FILE = env('DATA_FILE', path.join(__dirname, 'data.json'));
const ESKIZ_BASE = env('ESKIZ_BASE_URL', 'https://notify.eskiz.uz');
const MAX_ATTEMPTS = 5;
const HOURLY_CAP = 300;

// ---------- matn (SMS) ----------
function normalizePhone(input) {
  if (!input) return null;
  let d = String(input).replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  return /^998\d{9}$/.test(d) ? d : null;
}
function cleanText(s) {
  return String(s).replace(/[ʻʼ‘’`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...')
    .replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = '^{}\\[~]|€';
function smsInfo(text) {
  let units = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else { const len = [...text].length; return { length: len, parts: len <= 70 ? 1 : Math.ceil(len / 67), unicode: true }; }
  }
  return { length: units, parts: units <= 160 ? 1 : Math.ceil(units / 153), unicode: false };
}
function renderTemplate(tpl, v) {
  if (!v.phone) tpl = String(tpl).replace(/\s*[^.!?]*?:\s*\{phone\}\s*$/, '');
  tpl = v.items ? String(tpl) : String(tpl).replace(/\s*\{items\}(\s+uchun)?/g, '');
  const out = String(tpl).replace(/\{(name|amount|due|phone|link|items)\}/g, (_, k) => v[k] ?? '');
  return cleanText(out).replace(/\s+([.,!?])/g, '$1');
}
function smsMoney(n, cur) {
  const r = cur === 'UZS' ? Math.round(n) : Math.round(n * 100) / 100;
  const s = String(Math.abs(r)).split('.');
  const int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const num = s[1] ? `${int}.${s[1]}` : int;
  if (cur === 'UZS') return `${num} so'm`;
  const sym = { USD: '$', EUR: 'EUR ', RUB: 'RUB ', KZT: 'KZT ' };
  return `${sym[cur] ?? cur + ' '}${num}`;
}
const smsDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const DEF_AUTO = "Hurmatli {name}, {due} sanasigacha {amount} qarzingiz bor edi. Iltimos, tezroq to'lang. Savol bo'lsa: {phone}";
const DEF_MANUAL = "Hurmatli {name}, sizning {amount} qarzingiz qoldi (muddat: {due}). Savol bo'lsa: {phone}";

// ---------- vaqt (Toshkent) ----------
function tashkent(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, min: +p.minute };
}
const quietNow = () => { if (env('SMS_QUIET_HOURS') === 'off') return false; const h = tashkent().hour; return h >= 21 || h < 8; };
const dayNum = (iso) => Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / 864e5;
/** Hozirgi eslatma raqami: 0 = hali erta */
function reminderNo(today, due, first, every, max) {
  const d = dayNum(today) - (dayNum(due) + first);
  if (d < 0) return 0;
  return Math.min(Math.floor(d / every) + 1, max);
}

// ---------- ma'lumot ----------
let DB = { accounts: {}, seq: 0 };
try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { /* yangi */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}
// Atomik yozish: vaqtincha fayl → fsync → almashtirish (quvvat uzilganda ham fayl buzilmaydi)
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function saveNow() { writeAtomic(DATA_FILE, JSON.stringify(DB)); }

// ---------- Zaxira: avtomatik nusxa, aylanma (eng eskisini o'chirish), tiklash ----------
const BACKUP_FORMAT = 'qd-backup-v1';
const BACKUP_RE = /^qd-backup-(\d{8}T\d{9}Z)-([a-z-]+)\.json$/;   // millisekund bilan: bir soniyada ikki zaxira ustma-ust tushmaydi
const backupDir = () => env('BACKUP_DIR', path.join(path.dirname(DATA_FILE), 'backups'));
const backupEveryMs = () => Math.max(0.25, parseFloat(env('BACKUP_INTERVAL_HOURS', '6')) || 6) * 3600e3;
const backupKeep = () => Math.max(3, parseInt(env('BACKUP_KEEP', '40'), 10) || 40);
let backupError = null;
function listBackups() {
  let names = [];
  try { names = fs.readdirSync(backupDir()); } catch (e) { return []; }
  return names.filter((n) => BACKUP_RE.test(n)).sort().map((n) => {
    const st = fs.statSync(path.join(backupDir(), n));
    return { name: n, bytes: st.size, at: st.mtime.toISOString(), reason: BACKUP_RE.exec(n)[2] };
  });
}
let lastBackupAt = (() => { const l = listBackups(); return l.length ? Date.parse(l[l.length - 1].at) : 0; })();
/** Zaxira yaratadi. Fayl: hisoblar, buyurtmalar, yangiliklar va (Supabase rejimida) bulut qatorlari. */
async function makeBackup(reason = 'auto') {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const mode = sbOn() ? 'supabase' : 'file';
  const cloud = sbOn() ? await store.dumpCloud() : null;
  const at = new Date().toISOString();
  const text = JSON.stringify({ format: BACKUP_FORMAT, mode, at, db: DB, cloud });
  const name = `qd-backup-${at.replace(/[-:.]/g, '')}-${reason}.json`;
  writeAtomic(path.join(dir, name), text);
  const all = listBackups();
  for (const b of all.slice(0, Math.max(0, all.length - backupKeep()))) { try { fs.unlinkSync(path.join(dir, b.name)); } catch (e) { /* yo'q */ } }
  lastBackupAt = Date.now(); backupError = null;
  return { name, bytes: Buffer.byteLength(text), mode };
}
function backupStatus() {
  const l = listBackups(), last = l[l.length - 1] || null, every = backupEveryMs();
  return { mode: sbOn() ? 'supabase' : 'file', count: l.length, keep: backupKeep(), intervalHours: every / 3600e3,
    lastAt: last ? last.at : null, lastBytes: last ? last.bytes : 0, lastReason: last ? last.reason : null,
    ok: !!last && Date.now() - Date.parse(last.at) < every * 2 && !backupError, lastError: backupError };
}
function readBackupFile(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!j || j.format !== BACKUP_FORMAT || !j.db || typeof j.db !== 'object' || !j.db.accounts || typeof j.db.accounts !== 'object') throw new Error('noto‘g‘ri zaxira fayli');
  if (j.mode !== 'file' && j.mode !== 'supabase') throw new Error('noto‘g‘ri zaxira fayli');
  if (j.mode === 'supabase' && !Array.isArray(j.cloud)) throw new Error('noto‘g‘ri zaxira fayli');
  return j;
}
/** Zaxiradan tiklaydi. Avval joriy holat "pre-restore" zaxirasiga olinadi. Server ishlab turganda chaqirilmasin (CLI tekshiradi). */
async function restoreBackup(file) {
  const j = readBackupFile(file);
  if (j.mode !== (sbOn() ? 'supabase' : 'file')) throw new Error('zaxira turi (file/supabase) joriy sozlamaga mos emas');
  const safety = await makeBackup('pre-restore');
  if (sbOn()) await store.restoreCloud(j.cloud);
  writeAtomic(DATA_FILE, JSON.stringify(j.db));
  return { safety: safety.name, accounts: Object.keys(j.db.accounts).length, cloudRows: j.cloud ? j.cloud.length : 0, at: j.at };
}
// Bir vaqtda ikki server bitta ma'lumot faylini buzmasligi uchun PID-fayl
const LOCK_FILE = () => DATA_FILE + '.pid';
function lockHeld() {
  try { const pid = parseInt(fs.readFileSync(LOCK_FILE(), 'utf8'), 10); if (!pid || pid === process.pid) return false; process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}
function writeLock() { fs.writeFileSync(LOCK_FILE(), String(process.pid)); }
function clearLock() { try { if (fs.readFileSync(LOCK_FILE(), 'utf8') === String(process.pid)) fs.unlinkSync(LOCK_FILE()); } catch (e) { /* yo'q */ } }
const DEF_CALL = "Assalomu alaykum, {name}. Sizning {amount} qarzingiz muddati o'tgan. Iltimos, to'lovni amalga oshiring. Rahmat.";
const CALL_DEF = { before_days: 1, send_time: '09:00', call_enabled: false, call_after_days: 1, call_time: '10:00', call_voice: 'male', call_script: DEF_CALL, call_max: 2, call_quiet_from: 20, call_quiet_to: 9 };
function acct(id) {
  if (!DB.accounts[id]) DB.accounts[id] = { token: null, credits: 0, settings: null, debts: {}, log: [], creditLog: [] };
  const a = DB.accounts[id];
  Object.defineProperty(a, '__id', { value: id, enumerable: false, configurable: true });
  if (!a.settings) a.settings = { auto_enabled: false, first_after_days: 1, repeat_every_days: 3, max_reminders: 3, template_auto: DEF_AUTO, template_manual: DEF_MANUAL, contact_phone: '', digest_enabled: true, digest_hour: 19, tg_first: true };
  if (!a.push) a.push = [];
  if (a.callCredits === undefined) a.callCredits = 0;
  if (!a.audit) a.audit = [];                       // faoliyat jurnali (xodimlar amallari)
  Object.keys(CALL_DEF).forEach((k) => { if (a.settings[k] === undefined) a.settings[k] = CALL_DEF[k]; });
  if (!a.tg) { a.tg = {}; a.tgStop = {}; a.inbox = []; a.tgCodes = {}; }
  if (a.settings.digest_enabled === undefined) { a.settings.digest_enabled = true; a.settings.digest_hour = 10; }
  return a;
}
const newId = () => crypto.randomBytes(8).toString('hex');

// ---------- Eskiz ----------
const providerConfigured = () => Boolean((env('ESKIZ_EMAIL') && env('ESKIZ_PASSWORD')) || env('ESKIZ_TOKEN'));
let tokenCache = null;
class HttpError extends Error { constructor(status, body) { super('http_' + status); this.status = status; this.body = body; } }
async function call(p, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(ESKIZ_BASE + p, { ...init, signal: ctl.signal });
    let body = null;
    try { body = await res.json(); } catch (e) { /* JSON emas */ }
    if (!res.ok) throw new HttpError(res.status, body);
    return body;
  } finally { clearTimeout(t); }
}
async function login() {
  const f = new FormData();
  f.set('email', env('ESKIZ_EMAIL')); f.set('password', env('ESKIZ_PASSWORD'));
  const b = await call('/api/auth/login', { method: 'POST', body: f });
  const token = b && b.data && b.data.token;
  if (!token) throw new Error('eskiz_login_failed');
  tokenCache = { token, at: Date.now() };
  return token;
}
async function getToken(force) {
  if (env('ESKIZ_TOKEN') && !force) return env('ESKIZ_TOKEN');
  if (!force && tokenCache && Date.now() - tokenCache.at < 20 * 864e5) return tokenCache.token;
  return login();
}
async function authed(p, make) {
  let token = await getToken(false);
  try { return await call(p, make(token)); } catch (e) {
    if (e instanceof HttpError && e.status === 401) { tokenCache = null; token = await getToken(true); return call(p, make(token)); }
    throw e;
  }
}
const netCode = (e) => (e && e.cause && e.cause.code) || '';
/** → {kind:'sent',providerId} | {kind:'retry',error} | {kind:'failed',error,refund} */
async function eskizSend(phone, text) {
  if (!providerConfigured()) return { kind: 'retry', error: 'not_configured' };
  const msg = env('ESKIZ_TEST_MODE') === '1' ? 'Bu Eskiz dan test' : text;
  try {
    const cb = env('APP_URL') ? `${env('APP_URL').replace(/\/$/, '')}/api/sms/callback?secret=${encodeURIComponent(env('SMS_CALLBACK_SECRET'))}` : '';
    const b = await authed('/api/message/sms/send', (token) => {
      const f = new FormData();
      f.set('mobile_phone', phone); f.set('message', msg); f.set('from', env('ESKIZ_FROM', '4546'));
      if (cb && env('SMS_CALLBACK_SECRET')) f.set('callback_url', cb);
      return { method: 'POST', body: f, headers: { Authorization: 'Bearer ' + token } };
    });
    if (!b || b.id === undefined || b.id === null) return { kind: 'failed', error: 'unconfirmed_send', refund: false };
    return { kind: 'sent', providerId: String(b.id) };
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 429 || e.status === 503) return { kind: 'retry', error: 'http_' + e.status };
      if (e.status >= 500) return { kind: 'failed', error: 'unconfirmed_send', refund: false };
      const m = e.body && e.body.message;
      return { kind: 'failed', error: 'provider_' + e.status + (m ? ': ' + String(m).slice(0, 120) : ''), refund: true };
    }
    if (e && e.message === 'eskiz_login_failed') return { kind: 'retry', error: 'login_failed' };
    if (['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(netCode(e))) return { kind: 'retry', error: 'network_' + netCode(e) };
    return { kind: 'failed', error: 'unconfirmed_send', refund: false };
  }
}
async function eskizStatus(id) {
  const b = await authed('/api/message/sms/status_by_id/' + encodeURIComponent(id), (token) => ({ method: 'GET', headers: { Authorization: 'Bearer ' + token } }));
  const raw = String((b && b.data && b.data.status) || '').toUpperCase();
  if (raw === 'DELIVERED' || raw === 'DELIVRD') return { state: 'delivered', raw };
  if (['REJECTED', 'REJECTD', 'UNDELIV', 'UNDELIVERABLE', 'EXPIRED', 'DELETED'].includes(raw)) return { state: 'failed', raw };
  if (['NEW', 'STORED', 'ACCEPTED', 'ENROUTE', 'PARTDELIVERED', 'WAITING'].includes(raw)) return { state: 'pending', raw };
  return { state: 'unknown', raw };
}

// ---------- kredit ----------
function addCredits(id, n, note) {
  const a = acct(id);
  a.credits += n;
  a.creditLog.push({ at: new Date().toISOString(), n, note: note || '' });
  a.creditLog = a.creditLog.slice(-200);
  // Kredit yetmagani uchun to'xtagan (hali yuborilmagan) SMS larni qayta navbatga qo'yamiz
  const cutoff = Date.now() - 3 * 864e5;
  for (const e of a.log) {
    if (e.status === 'failed' && e.error === 'no_credits' && Date.parse(e.createdAt) > cutoff) {
      e.status = 'pending'; e.error = null; e.nextAt = 0;
    }
  }
  save();
}
const refund = (a, e) => { if (e.charged) { if (e.channel === 'call') a.callCredits += e.charged; else a.credits += e.charged; e.charged = 0; } };
function fail(a, e, error, doRefund) {
  e.status = 'failed'; e.error = error; e.nextAt = 0;
  if (doRefund) refund(a, e);
}

// ---------- navbat ----------
function buildAutoText(a, d) {
  const s = a.settings;
  return renderTemplate(s.template_auto, {
    name: d.name, amount: smsMoney(d.balance, d.cur || 'UZS'), due: smsDate(d.dueDate), phone: s.contact_phone || '', items: d.items || '',
    link: /\{link\}/.test(s.template_auto) && a.__id ? tgLink(a.__id, d.id) : '',
  });
}
// Qarzdorlar ro'yxati bulutdagi ma'lumotdan olinadi (ilova alohida sinxronlamaydi)
const balOf2 = (c) => { let b = 0; for (const t of (c.transactions || [])) { if (t.type === 'debt') b += Number(t.amount) || 0; else if (t.type === 'payment') b -= Number(t.amount) || 0; } return b; };
async function refreshDebts(id) {
  const a = acct(id); let data = null;
  try { data = await store.get('data', id); } catch (e) { return a; }
  if (!data || !Array.isArray(data.clients)) return a;
  const next = {};
  for (const c of data.clients.slice(0, 5000)) {
    if (!c || typeof c.id !== 'string' || c.kind === 'lender' || c.deleted) continue;
    const lastDebt = [...(c.transactions || [])].reverse().find((t) => t.type === 'debt' && Array.isArray(t.items) && t.items.length);
    next[c.id] = { id: c.id, name: String(c.name || '').slice(0, 80), phone: String(c.phone || '').slice(0, 30), dueDate: /^\d{4}-\d{2}-\d{2}/.test(c.dueDate || '') ? String(c.dueDate).slice(0, 10) : null,
      balance: balOf2(c), cur: String(c.cur || 'UZS').slice(0, 4), optOut: !!c.optOut, items: lastDebt ? lastDebt.items.map((x) => x.name).join(', ').slice(0, 70) : '',
      promise: /^\d{4}-\d{2}-\d{2}/.test(c.promiseDate || '') ? String(c.promiseDate).slice(0, 10) : null };
  }
  a.debts = next; return a;
}
async function refreshAll() { for (const [id, a] of Object.entries(DB.accounts)) { if (a.settings && (a.settings.auto_enabled || a.settings.call_enabled)) await refreshDebts(id); } }
const hm = (str) => { const m = /^(\d\d):(\d\d)$/.exec(str || ''); return m ? +m[1] * 60 + +m[2] : 0; };
function enqueueAuto() {
  if (quietNow()) return;
  const T = tashkent(), today = T.date, nowMin = T.hour * 60 + T.min;
  for (const [id, a] of Object.entries(DB.accounts)) {
    const s = a.settings;
    if (!s || !s.auto_enabled || nowMin < hm(s.send_time)) continue;      // sozlangan vaqtdan oldin yubormaymiz
    for (const d of Object.values(a.debts)) {
      if (!(d.balance > 0) || !d.dueDate || d.optOut) continue;
      if (d.promise && today <= d.promise) continue;      // mijoz to'lov sanasini va'da qilgan: o'sha kungacha eslatmaymiz
      const phone = normalizePhone(d.phone);
      if (!phone && !(a.tg && a.tg[d.id])) continue;
      let no = reminderNo(today, d.dueDate, s.first_after_days, s.repeat_every_days, s.max_reminders);
      if (no < 1 && s.before_days > 0 && dayNum(d.dueDate) - dayNum(today) === s.before_days) no = -1;   // muddatdan oldin eslatma
      if (no === 0) continue;
      // Takrorlanmaslik: bir qarz + bir muddat + bir eslatma raqami = bitta SMS
      if (a.log.some((e) => e.kind === 'auto' && e.debtId === d.id && e.reminderNo === no && (e.dueAt || d.dueDate) === d.dueDate)) continue;
      const body = buildAutoText(a, d);
      a.log.push({ id: newId(), kind: 'auto', debtId: d.id, reminderNo: no, dueAt: d.dueDate, name: d.name, phone: phone || '', body, parts: smsInfo(body).parts,
        status: 'pending', error: null, providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() });
    }
    a.log = a.log.slice(-2000);
  }
  save();
}
// ---------- Avtomatik ovozli qo'ng'iroq (provayder: CALL_WEBHOOK_URL) ----------
const callReady = () => { const u = env('CALL_WEBHOOK_URL'); return /^https:\/\//.test(u) || (!!process.env.QD_TEST && /^http:\/\/127\./.test(u)); };
const callPrice = () => Math.max(1, parseInt(env('CALL_PRICE', '600'), 10) || 600);
const callPackages = () => env('CALL_PACKAGES', '10:6000,30:15000,100:45000').split(',').map((x) => x.trim().split(':')).map(([n, pr]) => ({ sms: parseInt(n, 10), price: parseInt(pr, 10) })).filter((x) => x.sms > 0 && x.price > 0);
const inQuiet = (h, from, to) => (from === to ? false : from > to ? (h >= from || h < to) : (h >= from && h < to));
function buildCallText(a, d) { return renderTemplate(a.settings.call_script || DEF_CALL, { name: d.name, amount: smsMoney(d.balance, d.cur || 'UZS'), due: smsDate(d.dueDate), phone: a.settings.contact_phone || '', items: '', link: '' }); }
function enqueueCalls() {
  if (!callReady()) return;
  const T = tashkent(), nowMin = T.hour * 60 + T.min;
  for (const a of Object.values(DB.accounts)) {
    const s = a.settings;
    if (!s || !s.call_enabled || a.callCredits < 1 || nowMin < hm(s.call_time) || inQuiet(T.hour, s.call_quiet_from, s.call_quiet_to)) continue;
    for (const d of Object.values(a.debts)) {
      if (!(d.balance > 0) || d.optOut || !d.dueDate || (d.promise && T.date <= d.promise)) continue;
      const phone = normalizePhone(d.phone); if (!phone) continue;
      const sms = a.log.filter((e) => e.kind === 'auto' && e.debtId === d.id && e.channel !== 'tg' && (e.status === 'sent' || e.status === 'delivered') && e.sentAt).pop();
      if (!sms || Date.now() - Date.parse(sms.sentAt) < s.call_after_days * 864e5) continue;
      if (a.log.some((e) => e.channel === 'call' && e.afterId === sms.id)) continue;                                  // shu SMS dan keyin allaqachon qo'ng'iroq qilingan
      if (a.log.filter((e) => e.channel === 'call' && e.debtId === d.id && (e.dueAt || d.dueDate) === d.dueDate).length >= s.call_max) continue;   // urinishlar chegarasi
      const body = buildCallText(a, d);
      a.log.push({ id: newId(), channel: 'call', kind: 'callauto', debtId: d.id, afterId: sms.id, dueAt: d.dueDate, name: d.name, phone, body, parts: 1, status: 'pending', error: null, providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() });
    }
  }
  save();
}
async function runCall(a, e) {
  const d = a.debts[e.debtId], s = a.settings, T = tashkent();
  if (e.kind === 'callauto') {
    if (!d || !(d.balance > 0)) return fail(a, e, 'debt_paid', true);       // qarz to'langan: qo'ng'iroq to'xtaydi
    if (d.optOut || !s.call_enabled) return fail(a, e, 'opted_out', true);
    if (inQuiet(T.hour, s.call_quiet_from, s.call_quiet_to)) return;       // tinch soatlar: kutamiz
    e.body = buildCallText(a, d);
  }
  if (!callReady()) return fail(a, e, 'provider_missing', true);
  if (!e.charged) { if (a.callCredits < 1) return fail(a, e, 'no_credits', false); a.callCredits -= 1; e.charged = 1; }
  e.status = 'sending'; e.attempts += 1; saveNow();
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(env('CALL_WEBHOOK_URL'), { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('CALL_WEBHOOK_KEY') },
      body: JSON.stringify({ id: e.id, phone: e.phone, text: e.body, voice: s.call_voice, lang: 'uz' }) }); clearTimeout(tm);
    if (r.ok) { e.status = 'sent'; e.sentAt = new Date().toISOString(); e.error = null; }
    else if (r.status >= 500 && e.attempts < MAX_ATTEMPTS) { e.status = 'pending'; e.error = 'http_' + r.status; e.nextAt = Date.now() + 10 * 60000; }
    else fail(a, e, 'http_' + r.status, true);
  } catch (err) { if (e.attempts < MAX_ATTEMPTS) { e.status = 'pending'; e.error = 'network'; e.nextAt = Date.now() + 10 * 60000; } else fail(a, e, 'network', true); }
}
let running = false;
async function runQueue() {
  if (running) return; running = true;
  try {
    const quiet = quietNow();
    for (const a of Object.values(DB.accounts)) {
      for (const e of a.log) {
        if (e.status !== 'pending' || e.nextAt > Date.now()) continue;
        if (e.channel === 'call') { await runCall(a, e); saveNow(); continue; }
        if (e.kind === 'auto') {
          if (quiet) continue;
          const d = a.debts[e.debtId];
          if (!d || !(d.balance > 0)) { fail(a, e, 'debt_paid', true); continue; }
          if (d.promise && tashkent().date <= d.promise) { fail(a, e, 'promise_pending', true); continue; }
          if (d.optOut || !a.settings.auto_enabled || (a.tgStop && a.tgStop[e.debtId])) { fail(a, e, 'opted_out', true); continue; }
          e.phone = normalizePhone(d.phone) || e.phone;
          e.body = buildAutoText(a, d);          // qisman to'lovdan keyin qoldiq yangilanadi
          e.channel = (!e.tgFallback && a.settings.tg_first !== false && tgReady() && a.tg[e.debtId]) ? 'tg' : 'sms';
          e.parts = e.channel === 'tg' ? 0 : smsInfo(e.body).parts;
          if (e.channel === 'sms' && !e.phone) { fail(a, e, 'no_phone', true); continue; }
        }
        if (e.channel === 'tg') {          // Telegram: bepul, kredit yechilmaydi
          const lk = a.tg[e.debtId];
          if (!lk) { fail(a, e, 'tg_not_linked', false); continue; }
          e.status = 'sending'; e.attempts += 1; saveNow();
          const r = await tgSend(lk.chatId, e.body);
          if (r.kind === 'sent') { e.status = 'delivered'; e.sentAt = e.deliveredAt = new Date().toISOString(); e.error = null; }
          else if (r.kind === 'blocked') {
            delete a.tg[e.debtId]; delete DB.tgChats[lk.chatId];
            if (e.kind === 'auto' && !e.tgFallback) { e.tgFallback = true; e.channel = 'sms'; e.status = 'pending'; e.attempts = 0; e.error = null; }   // SMS ga o'tamiz
            else fail(a, e, 'tg_blocked', false);
          } else if (r.kind === 'retry') {
            if (e.attempts >= MAX_ATTEMPTS) fail(a, e, r.error, false);
            else { e.status = 'pending'; e.error = r.error; e.nextAt = Date.now() + Math.min(60, 2 ** e.attempts) * 60000; }
          } else fail(a, e, r.error, false);
          saveNow(); continue;
        }
        // kreditni yuborishdan oldin yechamiz (qayta urinishda qayta yechilmaydi)
        if (e.charged !== e.parts) {
          const need = e.parts - (e.charged || 0);
          if (a.credits < need) { fail(a, e, 'no_credits', false); e.charged = e.charged || 0; continue; }
          a.credits -= need; e.charged = e.parts;
        }
        e.status = 'sending'; e.attempts += 1; save();     // sending holatini DISKKA yozamiz — qayta ishga tushganda takror yuborilmasligi uchun
        saveNow();
        const r = await eskizSend(e.phone, e.body);
        if (r.kind === 'sent') { e.status = 'sent'; e.providerId = r.providerId; e.sentAt = new Date().toISOString(); e.error = null; }
        else if (r.kind === 'retry') {
          if (e.attempts >= MAX_ATTEMPTS) fail(a, e, r.error, true);
          else { e.status = 'pending'; e.error = r.error; e.nextAt = Date.now() + Math.min(60, 2 ** e.attempts) * 60000; }
        } else fail(a, e, r.error, r.refund);
        saveNow();
      }
    }
  } finally { running = false; }
}
let polling = false;
async function pollStatuses() {
  if (polling || !providerConfigured()) return; polling = true;
  try {
    let n = 0;
    for (const a of Object.values(DB.accounts)) {
      for (const e of a.log) {
        if (e.status !== 'sent' || !e.providerId || n >= 60) continue;
        if (Date.now() - Date.parse(e.sentAt) < 15000) continue;
        n++;
        try {
          const s = await eskizStatus(e.providerId);
          if (s.state === 'delivered') { e.status = 'delivered'; e.deliveredAt = new Date().toISOString(); e.error = null; }
          else if (s.state === 'failed') { e.status = 'failed'; e.error = 'provider_' + s.raw; }   // provayder yubormagan — kredit qaytariladi
          if (s.state === 'failed') refund(a, e);
        } catch (err) { /* keyingi safar */ }
      }
    }
    save();
  } finally { polling = false; }
}
async function tick() {
  try { await refreshAll(); enqueueAuto(); enqueueCalls(); await runQueue(); await pollStatuses(); await digestTick(); } catch (e) { console.error('tick:', e); }
  try { if (Date.now() - lastBackupAt > backupEveryMs()) await makeBackup('auto'); } catch (e) { backupError = e.message; console.error('zaxira xatosi:', e.message); }
}
// Qayta ishga tushganda "sending" da qolganlar — yuborilgan-yuborilmaganini bilmaymiz: takrorlamaymiz
for (const a of Object.values(DB.accounts)) for (const e of a.log) if (e.status === 'sending') { e.status = 'failed'; e.error = 'unconfirmed_send'; }


// ---------- SMS paketlar va buyurtmalar ----------
// To'lov qo'lda: foydalanuvchi buyurtma beradi, siz to'lovni ko'rib tasdiqlaysiz — kredit faqat tasdiqdan keyin qo'shiladi.
function packages() {
  return env('SMS_PACKAGES', '25:4000,50:8000,100:16000,250:40000').split(',').map((x) => x.trim().split(':'))
    .map(([a, b]) => ({ sms: parseInt(a, 10), price: parseInt(b, 10) })).filter((x) => x.sms > 0 && x.price > 0);
}
if (!DB.orders) DB.orders = [];
const smsPrice = () => Math.max(1, parseInt(env('SMS_PRICE', '160'), 10) || 160);        // 1 SMS necha so'm
const minAmount = () => Math.max(1000, parseInt(env('SMS_MIN_AMOUNT', '4000'), 10) || 4000);
const maxAmount = () => parseInt(env('SMS_MAX_AMOUNT', '5000000'), 10) || 5000000;
const purchaseHidden = () => env('HIDE_PURCHASE') === '1';
/** spec: {sms} (paket) yoki {amount} (o'z summasi: qancha pul, shuncha SMS) */
function newOrder(account, spec) {
  if (purchaseHidden()) return { error: 'purchase_disabled' };
  let pk; const kind = spec && spec.kind === 'call' ? 'call' : 'sms';
  if (spec && spec.amount !== undefined) {
    const amount = Math.floor(Number(spec.amount));
    if (!Number.isFinite(amount) || amount < minAmount() || amount > maxAmount()) return { error: 'bad_amount' };
    pk = { sms: Math.floor(amount / (kind === 'call' ? callPrice() : smsPrice())), price: amount };
    if (pk.sms < 1) return { error: 'bad_amount' };
  } else pk = (kind === 'call' ? callPackages() : packages()).find((x) => x.sms === (spec && spec.sms));
  if (!pk) return { error: 'bad_package' };
  if (DB.orders.filter((o) => o.account === account && (o.status === 'pending' || o.status === 'claimed')).length >= 5) return { error: 'too_many_orders' };
  let code; do { code = 'QD-' + String(Math.floor(1000 + Math.random() * 9000)); } while (DB.orders.some((o) => o.code === code));
  const o = { id: newId(), account, kind, sms: pk.sms, price: pk.price, code, status: 'pending', createdAt: new Date().toISOString() };
  DB.orders.push(o); save(); return { order: o };
}
function approveOrder(id, received) {
  const o = DB.orders.find((x) => x.id === id || x.code === id);
  if (!o) return { error: 'no_order' };
  if (o.status === 'approved') return { error: 'already_approved' };   // ikki marta kredit qo'shilmaydi
  if (o.status === 'rejected') return { error: 'rejected' };
  // Mijoz boshqa summa to'lagan bo'lsa, admin haqiqiy kelgan summani yozadi — SMS shunga qarab hisoblanadi
  const rec = received === undefined || received === null || received === '' ? null : Math.floor(Number(received));
  if (rec !== null && (!Number.isFinite(rec) || rec < 0 || rec > maxAmount())) return { error: 'bad_amount' };
  if (rec !== null && rec !== o.price) { o.received = rec; o.sms = Math.floor(rec / (o.kind === 'call' ? callPrice() : smsPrice())); }
  if (!(o.sms >= 1)) return { error: 'bad_amount' };
  o.status = 'approved'; o.approvedAt = new Date().toISOString();
  if (o.kind === 'call') { acct(o.account).callCredits += o.sms; } else addCredits(o.account, o.sms, 'paket ' + o.code); save();
  return { order: o };
}
const publicOrder = (o) => ({ kind: o.kind || 'sms', hasReceipt: !!o.receipt, id: o.id, sms: o.sms, price: o.price, code: o.code, status: o.status, createdAt: o.createdAt });

// ---------- Web Push (ilova yopiq bo'lsa ham bildirishnoma) ----------
const b64u = (b) => Buffer.from(b).toString('base64url');
function vapid() {
  if (!DB.vapid) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = privateKey.export({ format: 'jwk' });
    DB.vapid = { d: j.d, x: j.x, y: j.y }; saveNow();
  }
  return DB.vapid;
}
const vapidPub = () => { const v = vapid(); return Buffer.concat([Buffer.from([4]), Buffer.from(v.x, 'base64url'), Buffer.from(v.y, 'base64url')]); };
function vapidAuth(endpoint) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env('VAPID_SUBJECT', 'mailto:admin@example.com') }));
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', ...vapid() }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + b64u(vapidPub());
}
/** RFC 8291 (aes128gcm) */
function encryptPush(sub, payload) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(ua), salt = crypto.randomBytes(16);
  const prk = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, enc]);
}
async function pushTo(a, payloadObj) {
  let ok = 0;
  for (const sub of [...a.push]) {
    try {
      const res = await fetch(sub.endpoint, { method: 'POST', body: encryptPush(sub, JSON.stringify(payloadObj)),
        headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'normal', Authorization: vapidAuth(sub.endpoint) } });
      if (res.status >= 200 && res.status < 300) ok++;
      else if (res.status === 404 || res.status === 410) a.push = a.push.filter((x) => x.endpoint !== sub.endpoint);
    } catch (e) { /* keyingi safar */ }
  }
  save(); return ok;
}
const balOf = (c) => { let b = 0; for (const t of (c.transactions || [])) { if (t.type === 'debt') b += Number(t.amount) || 0; else if (t.type === 'payment') b -= Number(t.amount) || 0; } return b; };
// Kunlik eslatma: foydalanuvchi bugun ilovani ochmagan bo'lsa, kechqurun bildirishnoma yuboriladi.
async function digestTick() {
  const t = tashkent();
  if (t.hour >= 21 && !process.env.QD_TEST) return;
  for (const [id, a] of Object.entries(DB.accounts)) {
    const s = a.settings;
    if (!s || s.digest_enabled === false || !a.push || !a.push.length || a.lastDigest === t.date || t.hour < (s.digest_hour || 19)) continue;
    a.lastDigest = t.date;
    if (a.lastSeen && tashkent(new Date(a.lastSeen)).date === t.date) continue;       // bugun ilovani ochgan: bezovta qilmaymiz
    let data = null; try { data = await store.get('data', id); } catch (e) { /* baza yo'q: umumiy matn */ }
    const people = data && Array.isArray(data.clients) ? data.clients : [];
    const over = [], prom = [];
    for (const c of people) {
      const bal = balOf(c); if (!(bal > 0)) continue;
      if (c.promiseDate === t.date) prom.push(c);
      const due = c.dueDate ? String(c.dueDate).slice(0, 10) : null;
      if (due && due < t.date && !(c.promiseDate && c.promiseDate >= t.date)) over.push({ bal, cur: c.cur || 'UZS' });
    }
    let body = 'Bugun daftarni ochmadingiz.';
    if (over.length) { const sums = {}; over.forEach((d) => { sums[d.cur] = (sums[d.cur] || 0) + d.bal; }); body += ` ${over.length} ta mijozning muddati o'tgan (${Object.entries(sums).map(([c, n]) => smsMoney(n, c)).join(', ')}). Eslatma yuboring.`; }
    if (prom.length) body += ` Bugun ${prom.length} ta mijoz to'lashni va'da qilgan.`;
    if (!over.length && !prom.length) body += " Bugungi qarz va to'lovlarni yozib qo'ying.";
    await pushTo(a, { title: 'Qarzim', body, url: '/' });
  }
  save();
}

// ---------- Valyuta kurslari (Markaziy bank) ----------
const RATES_URL = () => env('RATES_URL', 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
async function updateRates() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(RATES_URL(), { signal: ctl.signal }); clearTimeout(t);
    if (!res.ok) return false;
    const arr = await res.json(); if (!Array.isArray(arr)) return false;
    const out = { at: Date.now(), date: '' };
    for (const x of arr) {
      if (!['USD', 'EUR', 'RUB', 'KZT'].includes(x.Ccy)) continue;
      const v = parseFloat(String(x.Rate).replace(',', '.')) / (parseFloat(x.Nominal) || 1);
      if (v > 0 && isFinite(v)) { out[x.Ccy] = Math.round(v * 100) / 100; if (x.Date) out.date = x.Date; }
    }
    if (!out.USD) return false;
    DB.rates = out; save(); return true;
  } catch (e) { return false; }
}


// ---------- Telegram bot (ixtiyoriy, bepul eslatma + savol-javob) ----------
const tgReady = () => Boolean(env('TELEGRAM_BOT_TOKEN'));
let tgUser = env('TELEGRAM_BOT_USERNAME').replace(/^@/, '');
if (!DB.tgCodes) DB.tgCodes = {};
if (!DB.tgChats) DB.tgChats = {};
if (!DB.cloud) DB.cloud = { idx: {}, data: {} };
if (DB.tgOffset === undefined) DB.tgOffset = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tgCall(method, body, ms = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(env('TELEGRAM_API_BASE', 'https://api.telegram.org') + '/bot' + env('TELEGRAM_BOT_TOKEN') + '/' + method,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ok: !!j.ok, j };
  } catch (e) { return { status: 0, ok: false, j: {}, code: netCode(e) }; } finally { clearTimeout(t); }
}
async function tgSend(chatId, text) {
  const r = await tgCall('sendMessage', { chat_id: chatId, text: String(text).slice(0, 3500) });
  if (r.ok) return { kind: 'sent' };
  if (r.status === 403 || (r.status === 400 && /chat not found/i.test(r.j.description || ''))) return { kind: 'blocked' };
  if (r.status === 429 || (r.status === 0 && ['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(r.code))) return { kind: 'retry', error: 'tg_' + (r.status || r.code) };
  if (r.status === 0 || r.status >= 500) return { kind: 'failed', error: 'unconfirmed_send' };   // yetgan-yetmaganini bilmaymiz — takrorlamaymiz
  return { kind: 'failed', error: 'tg_' + r.status + (r.j.description ? ': ' + String(r.j.description).slice(0, 100) : '') };
}
function tgLink(id, debtId) {
  const a = acct(id);
  let code = a.tgCodes[debtId];
  if (!code) { do { code = crypto.randomBytes(6).toString('base64url'); } while (DB.tgCodes[code]); a.tgCodes[debtId] = code; DB.tgCodes[code] = { account: id, debtId }; save(); }
  return tgUser ? `https://t.me/${tgUser}?start=${code}` : '';
}
const tgRate = new Map();
function tgOk(chat) { const now = Date.now(), l = (tgRate.get(chat) || []).filter((x) => now - x < 3600e3); l.push(now); tgRate.set(chat, l); return l.length <= 20; }
async function notifyOwner(a, body) { if (a.push && a.push.length) await pushTo(a, { title: 'Qarzim', body, url: '/' }); }
async function tgUpdate(u) {
  const m = u && u.message;
  if (!m || !m.chat || typeof m.text !== 'string') return;
  const chat = String(m.chat.id), text = m.text.trim().slice(0, 1000), who = (m.from && m.from.first_name) || '';
  const say = (t) => tgSend(chat, t);
  const sm = /^\/start(?:\s+(\S+))?$/.exec(text);
  if (sm && sm[1]) {
    const c = DB.tgCodes[sm[1]];
    if (!c || !DB.accounts[c.account]) return void (await say("Havola yaroqsiz. Do'kon egasidan yangisini so'rang."));
    const a = acct(c.account), cur = a.tg[c.debtId];
    if (cur && String(cur.chatId) !== chat) return void (await say('Bu havola allaqachon boshqa hisobga ulangan.'));
    const d = a.debts[c.debtId];
    a.tg[c.debtId] = { chatId: chat, name: who, at: new Date().toISOString() }; delete a.tgStop[c.debtId]; DB.tgChats[chat] = { account: c.account, debtId: c.debtId }; save();
    await say(`Assalomu alaykum${d ? ', ' + d.name : ''}! Qarz eslatmalari endi shu yerga keladi. Qarzingizni ko'rish: /qarz. Savolingiz bo'lsa shu yerga yozing — do'kon egasiga yetkaziladi. To'xtatish: /stop`);
    await notifyOwner(a, `${d ? d.name : 'Mijoz'} Telegram botga ulandi. Eslatmalar endi bepul boradi.`);
    return;
  }
  const lk = DB.tgChats[chat];
  if (!lk || !DB.accounts[lk.account] || !acct(lk.account).tg[lk.debtId]) return void (await say(sm ? "Assalomu alaykum! Bu bot qarz eslatmalari uchun. Ulanish uchun do'kon egasi yuborgan havolani bosing." : "Avval do'kon egasi yuborgan havola orqali ulaning."));
  const a = acct(lk.account), d = a.debts[lk.debtId];
  if (sm) { delete a.tgStop[lk.debtId]; save(); return void (await say('Eslatmalar yoqildi. /qarz — qarzingiz, /stop — to\'xtatish.')); }
  if (text === '/stop') { a.tgStop[lk.debtId] = true; save(); await say("Eslatmalar to'xtatildi. Qayta yoqish: /start"); await notifyOwner(a, `${d ? d.name : 'Mijoz'} eslatmalarni to'xtatdi (/stop).`); return; }
  if (text === '/qarz') {
    if (!d || !(d.balance > 0)) return void (await say("Qarzingiz yo'q ✓"));
    return void (await say(`Qarzingiz: ${smsMoney(d.balance, d.cur || 'UZS')}.` + (d.dueDate ? ` Muddat: ${smsDate(d.dueDate)}.` : '') + (a.settings.contact_phone ? ` Savol bo'lsa: ${a.settings.contact_phone}` : '')));
  }
  if (!tgOk(chat)) return;
  a.inbox.push({ id: newId(), debtId: lk.debtId, name: d ? d.name : who, dir: 'in', text, at: new Date().toISOString(), read: false });
  a.inbox = a.inbox.slice(-500); save();
  await say("Xabaringiz do'kon egasiga yetkazildi. Javob shu yerga keladi.");
  await notifyOwner(a, `${d ? d.name : who} Telegramda yozdi: ${text.slice(0, 100)}`);
}
async function tgLoop() {
  if (!tgReady()) return;
  const me = await tgCall('getMe');
  if (me.ok && me.j.result) { tgUser = me.j.result.username || tgUser; console.log('Telegram bot ulangan: @' + tgUser); }
  else { console.log("Telegram: TELEGRAM_BOT_TOKEN noto'g'ri yoki internet yo'q — bot ishlamaydi."); return; }
  for (;;) {
    const r = await tgCall('getUpdates', { offset: DB.tgOffset, timeout: 25, allowed_updates: ['message'] }, 35000);
    if (!r.ok) { await sleep(5000); continue; }
    for (const u of r.j.result || []) { DB.tgOffset = u.update_id + 1; try { await tgUpdate(u); } catch (e) { console.error('tg:', e); } }
    if ((r.j.result || []).length) save();
  }
}

// ---------- Hisobni o'chirish (do'kon talabi) ----------
function deleteCloud(id) {
  delete DB.cloud.data[id];
  for (const [k, v] of Object.entries(DB.cloud.idx)) if (k === id || v.owner === id) delete DB.cloud.idx[k];
}
// Avval bulutdagi ma'lumot va xodimlarning kirish huquqi o'chiriladi; xato bo'lsa — mahalliy yozuv saqlanadi (ma'lumot yo'qolmaydi, "o'chirildi" deb aldamaymiz).
async function deleteAccount(id) {
  await store.removeAccount(id);
  const dir = path.join(path.dirname(DATA_FILE), 'receipts');
  for (const o of DB.orders.filter((x) => x.account === id)) { if (o.receipt) { try { fs.unlinkSync(path.join(dir, path.basename(o.receipt))); } catch (e) { /* yo'q */ } } }
  DB.orders = DB.orders.filter((x) => x.account !== id);
  for (const [k, v] of Object.entries(DB.tgCodes)) if (v.account === id) delete DB.tgCodes[k];
  for (const [k, v] of Object.entries(DB.tgChats)) if (v.account === id) delete DB.tgChats[k];
  delete DB.accounts[id]; saveNow();
}

// ---------- HTTP ----------
function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(b);
}
function readBody(req, max) {
  return new Promise((ok, no) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > (max || 4e6)) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
  });
}
/** Xom bayt (Excel yuklash). max dan katta bo'lsa rad etiladi. */
function readRaw(req, max) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { no(new Error('fayl juda katta')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', no);
  });
}
/** Do'kon bo'yicha navbatlash: bir vaqtda bitta blob PUT yoki ops mutatsiyasi (lost-update oldini oladi). */
const shopLocks = new Map();
function withShopLock(id, fn) {
  const prev = shopLocks.get(id) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  shopLocks.set(id, tail);
  tail.then(() => { if (shopLocks.get(id) === tail) shopLocks.delete(id); });
  return run;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const publicLog = (e) => ({ channel: e.channel || 'sms', id: e.id, kind: e.kind, reminderNo: e.reminderNo || null, name: e.name, phone: e.phone, body: e.body, parts: e.parts, status: e.status, error: e.error,
  createdAt: e.createdAt, sentAt: e.sentAt || null, deliveredAt: e.deliveredAt || null });
function state(a) {
  const log = a.log.slice(-200).reverse().map(publicLog);
  return { provider: { ready: providerConfigured(), test: env('ESKIZ_TEST_MODE') === '1' }, call: { ready: callReady(), price: callPrice() }, callCredits: a.callCredits || 0, debts: Object.keys(a.debts || {}).length, credits: a.credits, settings: a.settings, log,
    store: { hidePurchase: purchaseHidden() }, quiet: quietNow(), devices: (a.push || []).length, tg: { ready: tgReady(), username: tgUser, linked: Object.keys(a.tg), stopped: Object.keys(a.tgStop), unread: a.inbox.filter((m) => m.dir === 'in' && !m.read).length }, defaults: { auto: DEF_AUTO, manual: DEF_MANUAL, call: DEF_CALL } };
}
function validSettings(b, cur) {
  const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const t = (v, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : d);
  const tm = (v, d) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
  return { auto_enabled: !!b.auto_enabled, first_after_days: int(b.first_after_days, 1, 60, cur.first_after_days), repeat_every_days: int(b.repeat_every_days, 1, 60, cur.repeat_every_days),
    max_reminders: int(b.max_reminders, 1, 20, cur.max_reminders), template_auto: t(b.template_auto, DEF_AUTO), template_manual: t(b.template_manual, DEF_MANUAL),
    contact_phone: typeof b.contact_phone === 'string' ? b.contact_phone.trim().slice(0, 30) : '',
    digest_enabled: b.digest_enabled === undefined ? cur.digest_enabled !== false : !!b.digest_enabled, digest_hour: int(b.digest_hour, 6, 20, cur.digest_hour || 10),
    tg_first: b.tg_first === undefined ? cur.tg_first !== false : !!b.tg_first,
    before_days: int(b.before_days, 0, 14, cur.before_days), send_time: tm(b.send_time, cur.send_time),
    call_enabled: !!b.call_enabled, call_after_days: int(b.call_after_days, 0, 14, cur.call_after_days), call_time: tm(b.call_time, cur.call_time),
    call_voice: b.call_voice === 'female' ? 'female' : 'male', call_script: t(b.call_script, DEF_CALL), call_max: int(b.call_max, 1, 5, cur.call_max),
    call_quiet_from: int(b.call_quiet_from, 0, 23, cur.call_quiet_from), call_quiet_to: int(b.call_quiet_to, 0, 23, cur.call_quiet_to) };
}
const hourCount = (a) => a.log.filter((e) => e.kind !== 'auto' && Date.now() - Date.parse(e.createdAt) < 3600e3).length;

// ---------- Bulut (ma'lumot zaxirasi, ikkinchi telefondan kirish) ----------
// Firebase REST ko'rinishida: GET/PUT /api/cloud/qd/<hisob>.json va /api/cloud/qd_idx/<login>.json
// Himoya: har so'rovda X-Qd-User (login kaliti) + X-Qd-Auth (parol xeshi). Server xeshni scrypt bilan saqlaydi.
// Saqlash joyi: SUPABASE_URL + SUPABASE_SERVICE_KEY berilsa, Supabase (jadval qd_cloud); aks holda data.json.
const sbOn = () => !!(env('SUPABASE_URL') && env('SUPABASE_SERVICE_KEY'));
async function sb(method, query, body, extra) {
  const base = env('SUPABASE_URL').replace(/\/+$/, '') + '/rest/v1/qd_cloud' + (query ? '?' + query : '');
  const k = env('SUPABASE_SERVICE_KEY');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(base, { method, signal: ctl.signal, headers: Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) throw new Error('supabase ' + r.status);
    const tx = await r.text(); return tx ? JSON.parse(tx) : null;
  } finally { clearTimeout(t); }
}
const idxCache = new Map();   // login kaliti -> { v, t }
const store = {
  async get(kind, key) {
    if (!sbOn()) return (kind === 'idx' ? DB.cloud.idx : DB.cloud.data)[key] ?? null;
    if (kind === 'idx') { const c = idxCache.get(key); if (c && Date.now() - c.t < 30000) return c.v; }
    const r = await sb('GET', `kind=eq.${kind}&key=eq.${encodeURIComponent(key)}&select=value`);
    const v = r && r[0] ? r[0].value : null;
    if (kind === 'idx') idxCache.set(key, { v, t: Date.now() });
    return v;
  },
  async put(kind, key, value) {
    if (!sbOn()) { (kind === 'idx' ? DB.cloud.idx : DB.cloud.data)[key] = value; save(); return; }
    await sb('POST', 'on_conflict=kind,key', [{ kind, key, value, updated_at: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
    if (kind === 'idx') idxCache.delete(key);
  },
  async del(kind, key) {
    if (!sbOn()) { delete (kind === 'idx' ? DB.cloud.idx : DB.cloud.data)[key]; save(); return; }
    await sb('DELETE', `kind=eq.${kind}&key=eq.${encodeURIComponent(key)}`, undefined, { Prefer: 'return=minimal' });
    idxCache.delete(key);
  },
  async dumpCloud() {
    const rows = [];
    for (let off = 0; ; off += 1000) { const part = (await sb('GET', `select=kind,key,value,updated_at&order=kind.asc,key.asc&limit=1000&offset=${off}`)) || []; rows.push(...part); if (part.length < 1000) break; }
    return rows;
  },
  async restoreCloud(rows) {
    for (let i = 0; i < rows.length; i += 500) {
      await sb('POST', 'on_conflict=kind,key', rows.slice(i, i + 500).map((r) => ({ kind: r.kind, key: r.key, value: r.value, updated_at: r.updated_at || new Date().toISOString() })), { Prefer: 'resolution=merge-duplicates,return=minimal' });
    }
    idxCache.clear();
  },
  async removeAccount(id) {
    if (!sbOn()) { deleteCloud(id); return; }
    const q = encodeURIComponent(id);
    await sb('DELETE', `kind=eq.data&key=eq.${q}`, undefined, { Prefer: 'return=minimal' });
    await sb('DELETE', `kind=eq.idx&or=(key.eq.${q},value-%3E%3Eowner.eq.${q})`, undefined, { Prefer: 'return=minimal' });
    idxCache.clear();
  },
};
const cloudHash = (ph, salt) => crypto.scryptSync(String(ph), salt, 32).toString('hex');

// ---------- Rollar va ruxsatlar (serverda majburiy; ilovadagi yashirish — faqat ko'rinish uchun) ----------
// owner: hammasi · manager: xodimlarni boshqarishdan tashqari hammasi · cashier: yozadi + hisobot · employee: faqat qarz/to'lov yozadi va ko'radi
// v11 ruxsatlari: inv_view, inv_edit, inv_move, inv_adjust, inv_override (manfiy qoldiq), cash_view, expense, fin_reports, ai
const ROLES = {
  owner:    ['view', 'write', 'edit', 'delete', 'reports', 'lenders', 'log', 'messages', 'backup', 'staff', 'admin',
    'inv_view', 'inv_edit', 'inv_move', 'inv_adjust', 'inv_override', 'cash_view', 'expense', 'fin_reports', 'ai'],
  manager:  ['view', 'write', 'edit', 'delete', 'reports', 'lenders', 'log', 'messages', 'backup',
    'inv_view', 'inv_edit', 'inv_move', 'inv_adjust', 'cash_view', 'expense', 'fin_reports', 'ai'],
  cashier:  ['view', 'write', 'reports', 'messages', 'inv_view'],
  employee: ['view', 'write', 'inv_view'],
};
const ROLE_KEYS = ['manager', 'cashier', 'employee'];          // egasi tayinlay oladigan rollar
const roleOf = (key, rec) => (!rec ? null : (!rec.owner || rec.owner === key ? 'owner' : (ROLE_KEYS.includes(rec.role) ? rec.role : 'employee')));
const hasPerm = (role, p) => (ROLES[role] || []).includes(p);
const opsHttp = createOpsHttp({ store, acct, send, readBody, readRaw, withShopLock, rates: () => DB.rates || {}, hasPerm, ROLES, save });
// SMS/hisob endpointlari uchun kerakli ruxsat
const SMS_PERM = {
  '/api/sms/settings': 'edit', '/api/sms/send': 'messages', '/api/sms/call': 'messages', '/api/sms/resend': 'messages',
  '/api/sms/test': 'admin', '/api/sms/packages': 'admin', '/api/sms/buy': 'admin', '/api/sms/claim': 'admin', '/api/sms/receipt': 'admin',
  '/api/sms/delete-account': 'admin', '/api/sms/tg-link': 'messages', '/api/sms/tg-unlink': 'messages', '/api/sms/tg-inbox': 'messages',
  '/api/sms/tg-read': 'messages', '/api/sms/tg-reply': 'messages',
};
// Tombstone (o'chirilgan yozuv) hisobga olinadigan holati — mijoz ilovasidagi qoida bilan bir xil
const tombLive = (t) => !t.r || t.r < t.t;
const VOLATILE_CLIENT = ['_m', 'transactions', 'by', 'cur', 'promiseDate'];   // to'lov sanasi (va'da) har kim qo'ya oladi
const VOLATILE_TX = ['_m', 'by', 'cur'];
/** Kalitlari tartiblangan JSON — qurilmalar o'rtasida soxta farq chiqmasin */
const canon = (v, drop) => JSON.stringify(v, (k, x) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  const o = {};
  for (const kk of Object.keys(x).sort()) if (!(k === '' && drop && drop.includes(kk))) o[kk] = x[kk];
  return o;
});
/**
 * Qurilmadan kelgan ma'lumotni serverdagi holat bilan birlashtiradi va har bir o'zgarish uchun kerakli ruxsatni aniqlaydi.
 * Qoidalar: o'chirish faqat tombstone bilan (haqiqiy o'chirish); tombstone yo'q bo'lsa, eskirgan qurilma tomonidan
 * yozuv yo'qolmaydi (serverdagi nusxa saqlanadi). Qo'shish → write, tahrir → edit, o'chirish → delete.
 */
function reconcile(prev, next) {
  const need = new Set(), events = [];
  const num = (x) => Number(x) || 0;
  const byId = (list) => new Map((list || []).filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
  // tombstone'lar: ikkala tomonning birlashmasi (eng so'nggi t/r)
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
      else if (!t) txs.push(o);                                      // tombstone yo'q: serverdagi nusxa qoladi
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
      if (!c) { out[sec].push(p); continue; }                       // eskirgan qurilma yubormagan — o'chirish emas
      if (canon(c, VOLATILE_CLIENT) !== canon(p, VOLATILE_CLIENT)) { need.add('edit'); events.push({ action: 'client_edit', name: c.name }); }
      out[sec].push(txMerge(p, c));
    }
  }
  const del = [...mergedDel.values()].sort((a, b) => a.t - b.t).slice(-3000);
  return { need: [...need], events, clients: out.clients, lenders: out.lenders, del };
}
/** Faoliyat jurnali: kim, qachon, nima qildi (telefon raqamlari yozilmaydi) */
function auditLog(shop, actor, role, events) {
  if (!events.length) return;
  const sa = acct(shop), at = new Date().toISOString();
  const rows = events.length > 25
    ? [{ at, by: actor, role, action: 'bulk', text: `${events.length} ta o'zgarish saqlandi` }]
    : events.map((e) => ({ at, by: actor, role, action: e.action, name: e.name, amount: e.amount, cur: e.cur, text: e.text }));
  sa.audit = sa.audit.concat(rows).slice(-1000);
  save();
}
async function cloudApi(req, res, p) {
  try { return await cloudApi2(req, res, p); } catch (e) { console.error('bulut xatosi:', e.message); return send(res, 503, { error: 'storage_unavailable' }); }
}
async function cloudApi2(req, res, p) {
  if (p === '/api/cloud/ping') return send(res, 200, { ok: true, cloud: true });
  const user = String(req.headers['x-qd-user'] || '').slice(0, 80), auth = String(req.headers['x-qd-auth'] || '');
  const me = user && auth && auth.length <= 200 ? await store.get('idx', user) : null;
  const authed = !!(me && safeEq(cloudHash(auth, me.salt), me.h));
  const role = authed ? roleOf(user, me) : null;               // owner | manager | cashier | employee
  const shop = authed ? (me.owner || user) : null;             // do'kon egasining logini
  if (p.startsWith('/api/cloud/ops')) {                        // v11: ombor, kassa, moliya, AI
    if (!authed) return send(res, 401, { error: 'auth' });
    if (await opsHttp.handle(req, res, p, { user, role, shop, me })) return;
    return send(res, 404, { error: 'not_found' });
  }
  if (p === '/api/cloud/backup-status') {
    if (!authed) return send(res, 401, { error: 'auth' });
    if (!hasPerm(role, 'backup')) return send(res, 403, { error: 'forbidden' });
    const s = backupStatus();
    return send(res, 200, { mode: s.mode, lastAt: s.lastAt, count: s.count, intervalHours: s.intervalHours, ok: s.ok });
  }
  if (p === '/api/cloud/log') {
    if (!authed) return send(res, 401, { error: 'auth' });
    if (!hasPerm(role, 'log')) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, { entries: acct(shop).audit.slice(-300).reverse() });
  }
  const m = p.match(/^\/api\/cloud\/(qd|qd_idx)\/([A-Za-z0-9_.@-]{1,80})\.json$/);
  if (!m) return send(res, 404, { error: 'not_found' });
  const kind = m[1], key = m[2];
  if (kind === 'qd_idx') {
    const cur = await store.get('idx', key);
    const isSelf = authed && user === key;
    // Xodim (menejer/kassir/xodim) hisobini faqat do'kon egasi boshqaradi. Egasi hisobini hech kim o'zgartira olmaydi.
    const isMgrOf = (rec) => authed && !!rec && !!rec.owner && rec.owner !== key && rec.owner === user && role === 'owner';
    if (req.method === 'GET') {
      if (!cur) return send(res, 200, null);
      if (auth) { if (!isSelf) return send(res, 403, { error: 'bad_credentials' }); return send(res, 200, { username: cur.username, owner: cur.owner, role: roleOf(key, cur), ph: auth }); }
      return send(res, 200, { username: cur.username, owner: cur.owner, ph: null });   // faqat "bu nom band" ekanini bilish uchun
    }
    if (req.method === 'PUT') {
      const b = await readBody(req, 4e4);
      if (!b || typeof b.ph !== 'string' || b.ph.length < 4 || b.ph.length > 200) return send(res, 400, { error: 'bad_request' });
      const owner = String(b.owner || key).slice(0, 80);
      const wantRole = ROLE_KEYS.includes(b.role) ? b.role : null;
      if (!cur) {
        // Yangi hisob: o'zi uchun ro'yxatdan o'tish (owner = o'zi), yoki egasining yangi xodimi
        const selfSignup = owner === key;
        if (!selfSignup && !(authed && user === owner && hasPerm(role, 'staff'))) return send(res, 403, { error: 'forbidden' });
        const salt = crypto.randomBytes(12).toString('hex');
        const nu = { username: String(b.username || key).slice(0, 80), owner, salt, h: cloudHash(b.ph, salt) };
        if (!selfSignup) nu.role = wantRole || 'employee';
        await store.put('idx', key, nu);
        if (!selfSignup) auditLog(owner, me.username, 'owner', [{ action: 'staff_add', name: nu.username, text: nu.role }]);
        return send(res, 200, { ok: true });
      }
      // Mavjud hisob: o'zi (parol/login) yoki egasi (xodimning). Egasi va rol o'zgartirilmaydi (egasi bundan mustasno).
      const selfUpd = isSelf && owner === cur.owner;
      const staffUpd = isMgrOf(cur) && owner === cur.owner && hasPerm(role, 'staff');
      if (!(selfUpd || staffUpd)) return send(res, 403, { error: 'forbidden' });
      const nu = { username: String(b.username || cur.username || key).slice(0, 80), owner: cur.owner, salt: cur.salt, h: cloudHash(b.ph, cur.salt) };
      if (cur.owner !== key) nu.role = staffUpd && wantRole ? wantRole : (cur.role || 'employee');
      if (cur.h !== nu.h || cur.username !== nu.username || cur.role !== nu.role) {
        await store.put('idx', key, nu);
        if (staffUpd) auditLog(cur.owner, me.username, 'owner', [{ action: 'staff_edit', name: nu.username, text: nu.role }]);
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!cur) return send(res, 200, { ok: true });
      if (cur.owner === key) return send(res, 400, { error: 'use_delete_account' });   // egasi hisobi — "Hisobni o'chirish" orqali
      if (!(isSelf || isMgrOf(cur))) return send(res, 403, { error: 'forbidden' });
      await store.del('idx', key);
      if (!isSelf) auditLog(cur.owner, me.username, 'owner', [{ action: 'staff_del', name: cur.username }]);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  }
  // qd: do'kon ma'lumoti — faqat shu do'konning a'zolari (egasi, menejer, kassir, xodim)
  if (!authed || shop !== key) return send(res, authed ? 403 : 401, { error: authed ? 'forbidden' : 'auth' });
  const sa = acct(shop); if (!sa.lastSeen || Date.now() - sa.lastSeen > 60000) { sa.lastSeen = Date.now(); save(); }
  const canLenders = hasPerm(role, 'lenders');
  if (req.method === 'GET') {
    const data = await store.get('data', key);
    if (!data) return send(res, 200, null);
    return send(res, 200, { ...data, lenders: canLenders ? (data.lenders || []) : [] });   // ruxsatsiz rolga qarzdorlar ko'rinmaydi
  }
  if (req.method === 'PUT') {
    const b = await readBody(req, 12e6);
    if (!b || typeof b !== 'object' || !Array.isArray(b.clients) || !Array.isArray(b.lenders)) return send(res, 400, { error: 'bad_request' });
    const valid = (x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id.length <= 80;
    // v11: do'kon bo'yicha navbat — o'qish, birlashtirish, jurnal va yozish bitta bo'lib o'tadi
    return withShopLock(shop, async () => {
      const prev = (await store.get('data', key)) || { clients: [], lenders: [], del: [] };
      const next = {
        clients: b.clients.filter(valid).slice(0, 5000),
        lenders: canLenders ? b.lenders.filter(valid).slice(0, 5000) : (prev.lenders || []),   // ruxsatsiz rol qarzdorlarni o'zgartira olmaydi
        del: Array.isArray(b.del) ? b.del.filter(valid).slice(-3000) : [],
      };
      const r = reconcile(prev, next);
      const missing = r.need.find((n) => !hasPerm(role, n));
      if (missing) return send(res, 403, { error: 'forbidden', need: missing });
      // Ombor/kassa jurnali: sotuv va to'lovlar shu yerda yoziladi. Omborda yetmasa — butun yozuv rad etiladi (409).
      const ops = OPS.ensureOps(sa);
      const pr = OPS.projectBlob(ops, r.clients, { actor: user, byName: me.username, role, now: Date.now(), rates: DB.rates || {} });
      if (!pr.ok) return send(res, 409, { error: 'stock_insufficient', message: 'Omborda yetarli tovar yo‘q — sotuv saqlanmadi', lines: pr.errors.slice(0, 50) });
      if (pr.entries.length || pr.moves.length || pr.keyDels.length) { OPS.commitProjection(ops, pr, Date.now()); save(); }
      await store.put('data', key, { ts: Date.now(), clients: r.clients, lenders: r.lenders, del: r.del });
      auditLog(shop, me.username, role, r.events);
      return send(res, 200, { ok: true, posted: pr.entries.length });
    });
  }
  return send(res, 405, { error: 'method' });
}

// ---------- Bildirishnoma (kirmasa eslatish) va yangilanish haqida xabar ----------
if (!DB.news) DB.news = [];
if (!DB.reports) DB.reports = [];          // "Muammo haqida xabar" — admin sahifasida ko'rinadi
DB.schemaVersion = 11;                     // v11: acct.ops (ombor, kassa jurnali) — eski ma'lumotda avtomatik to'ldiriladi
async function newsApi(req, res, p) {
  try {
    const user = String(req.headers['x-qd-user'] || '').slice(0, 80), auth = String(req.headers['x-qd-auth'] || '');
    const me = user && auth && auth.length <= 200 ? await store.get('idx', user) : null;
    if (!(me && safeEq(cloudHash(auth, me.salt), me.h))) return send(res, 401, { error: 'auth' });
    const id = me.owner || user, now = Date.now();
    const mine = (n) => ({ id: n.id, title: n.title, body: n.body, category: n.category, date: new Date(n.publishAt).toISOString(), image: n.image || '', read: (n.readBy || []).includes(id) });
    if (p === '/api/news/list') return send(res, 200, { news: DB.news.filter((n) => n.publishAt <= now).sort((x, y) => y.publishAt - x.publishAt).slice(0, 100).map(mine) });
    if (p === '/api/news/read' && req.method === 'POST') {
      const b = await readBody(req, 2e4), ids = b.all ? DB.news.map((n) => n.id) : (Array.isArray(b.ids) ? b.ids : []);
      for (const n of DB.news) if (n.publishAt <= now && ids.includes(n.id)) { n.readBy = n.readBy || []; if (!n.readBy.includes(id)) n.readBy.push(id); }
      save(); return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) { return send(res, 503, { error: 'unavailable' }); }
}
async function notifyApi(req, res, p) {
  try {
    const user = String(req.headers['x-qd-user'] || '').slice(0, 80), auth = String(req.headers['x-qd-auth'] || '');
    const me = user && auth && auth.length <= 200 ? await store.get('idx', user) : null;
    if (!(me && safeEq(cloudHash(auth, me.salt), me.h))) return send(res, 401, { error: 'auth' });
    const a = acct(me.owner || user);
    const b = req.method === 'POST' ? await readBody(req, 2e4) : {};
    if (p === '/api/notify/settings' && !hasPerm(roleOf(user, me), 'edit')) return send(res, 403, { error: 'forbidden' });
    if (p === '/api/notify/state') return send(res, 200, { devices: a.push.length, enabled: a.settings.digest_enabled !== false, hour: a.settings.digest_hour || 19 });
    if (p === '/api/notify/sub') {
      const sb = b.subscription;
      if (!sb || typeof sb.endpoint !== 'string' || !/^https:\/\//.test(sb.endpoint) || !sb.keys || !sb.keys.p256dh || !sb.keys.auth) return send(res, 400, { error: 'bad_subscription' });
      a.push = a.push.filter((x) => x.endpoint !== sb.endpoint); a.push.push({ endpoint: sb.endpoint, keys: { p256dh: sb.keys.p256dh, auth: sb.keys.auth } });
      a.push = a.push.slice(-5); a.settings.digest_enabled = true; save(); return send(res, 200, { ok: true, devices: a.push.length });
    }
    if (p === '/api/notify/off') { a.push = a.push.filter((x) => x.endpoint !== b.endpoint); save(); return send(res, 200, { ok: true, devices: a.push.length }); }
    if (p === '/api/notify/settings') {
      const h = parseInt(b.hour, 10); if (Number.isFinite(h) && h >= 8 && h <= 20) a.settings.digest_hour = h;
      if (b.enabled !== undefined) a.settings.digest_enabled = !!b.enabled;
      save(); return send(res, 200, { ok: true, enabled: a.settings.digest_enabled !== false, hour: a.settings.digest_hour || 19 });
    }
    if (p === '/api/notify/test') {
      const n = await pushTo(a, { title: 'Qarzim', body: "Bildirishnoma ishlayapti. Daftarni bir kun ochmasangiz, shu yerga eslatma keladi.", url: '/' });
      return n ? send(res, 200, { ok: true }) : send(res, 400, { error: 'push_failed' });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) { return send(res, 503, { error: 'unavailable' }); }
}
const verNum = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0);
const verCmp = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
function appVersion(req, res, url) {
  const cur = url.searchParams.get('v') || '0', latest = env('APP_LATEST_VERSION'), min = env('APP_MIN_VERSION');
  const plat = url.searchParams.get('p') === 'ios' ? 'ios' : url.searchParams.get('p') === 'android' ? 'android' : 'web';
  const link = plat === 'android' ? env('PLAY_URL') : plat === 'ios' ? env('APPSTORE_URL') : '';
  return send(res, 200, { latest: latest || null, update: !!latest && verCmp(latest, cur) > 0, required: !!min && verCmp(min, cur) > 0, url: link, platform: plat, notes: env('UPDATE_NOTES').slice(0, 300) });
}

async function api(req, res, url) {
  const p = url.pathname;
  // Eskiz callback: faqat "turtki" — holatni provayderdan qayta so'raymiz
  if (p === '/api/sms/callback') {
    if (!env('SMS_CALLBACK_SECRET') || !safeEq(url.searchParams.get('secret') || '', env('SMS_CALLBACK_SECRET'))) return send(res, 403, { error: 'forbidden' });
    pollStatuses(); return send(res, 200, { ok: true });
  }
  // Administrator (kredit sotuvchi)
  if (p.startsWith('/api/admin/')) {
    if (!env('ADMIN_KEY') || !safeEq(req.headers['x-admin-key'] || '', env('ADMIN_KEY'))) return send(res, 403, { error: 'forbidden' });
    if (p === '/api/admin/accounts') return send(res, 200, { accounts: Object.entries(DB.accounts).map(([id, a]) => ({ id, credits: a.credits, sent: a.log.filter((e) => e.status === 'sent' || e.status === 'delivered').length })) });
    if (p === '/api/admin/credits' && req.method === 'POST') {
      const b = await readBody(req); const n = parseInt(b.credits, 10);
      if (!b.account || !Number.isFinite(n) || n === 0 || Math.abs(n) > 1e6) return send(res, 400, { error: 'bad_request' });
      if (!DB.accounts[b.account]) return send(res, 404, { error: 'no_account' });
      addCredits(b.account, n, b.note); return send(res, 200, { credits: DB.accounts[b.account].credits });
    }
    if (p === '/api/admin/receipt') {
      const o = DB.orders.find((x) => x.id === url.searchParams.get('id'));
      if (!o || !o.receipt) return send(res, 404, { error: 'no_receipt' });
      const f = path.join(path.dirname(DATA_FILE), 'receipts', path.basename(o.receipt));
      res.writeHead(200, { 'Content-Type': 'image/' + (o.receipt.endsWith('.jpg') ? 'jpeg' : o.receipt.split('.').pop()), 'Cache-Control': 'no-store' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p === '/api/admin/news') return send(res, 200, { news: DB.news.slice().reverse().map((n) => Object.assign({}, n, { reads: (n.readBy || []).length, readBy: undefined })) });
    if (p === '/api/admin/news/save' && req.method === 'POST') {
      const b = await readBody(req, 4e6), title = String(b.title || '').trim().slice(0, 120), body = String(b.body || '').trim().slice(0, 2000);
      if (!title || !body) return send(res, 400, { error: 'bad_news' });
      const cats = ['yangilik', 'yaxshilanish', 'muhim', 'texnik'], image = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image || '') && b.image.length < 1.2e6 ? b.image : (b.image === '' ? '' : undefined);
      const pub = b.publishAt ? Date.parse(b.publishAt) : Date.now(); if (!Number.isFinite(pub)) return send(res, 400, { error: 'bad_date' });
      let n = b.id && DB.news.find((x) => x.id === b.id);
      if (!n) { n = { id: newId(), readBy: [], createdAt: new Date().toISOString() }; DB.news.push(n); }
      Object.assign(n, { title, body, category: cats.includes(b.category) ? b.category : 'yangilik', publishAt: pub });
      if (image !== undefined) n.image = image; save(); return send(res, 200, { ok: true, id: n.id });
    }
    if (p === '/api/admin/news/delete' && req.method === 'POST') { const b = await readBody(req); DB.news = DB.news.filter((x) => x.id !== b.id); save(); return send(res, 200, { ok: true }); }
    if (p === '/api/admin/backup/status') return send(res, 200, Object.assign({ dir: backupDir(), list: listBackups().slice(-10).reverse() }, backupStatus()));
    if (p === '/api/admin/backup/now' && req.method === 'POST') {
      try { return send(res, 200, { ok: true, backup: await makeBackup('manual') }); }
      catch (e) { backupError = e.message; console.error('zaxira xatosi:', e.message); return send(res, 500, { error: 'backup_failed' }); }
    }
    if (p === '/api/admin/reports') return send(res, 200, { reports: DB.reports.slice().reverse() });
    if (p === '/api/admin/orders') return send(res, 200, { orders: DB.orders.slice(-200).reverse() });
    if ((p === '/api/admin/approve' || p === '/api/admin/reject') && req.method === 'POST') {
      const b = await readBody(req);
      if (p.endsWith('approve')) { const r = approveOrder(String(b.id || ''), b.received); return r.error ? send(res, 400, r) : send(res, 200, r); }
      const o = DB.orders.find((x) => x.id === b.id || x.code === b.id);
      if (!o || o.status === 'approved') return send(res, 400, { error: 'cannot_reject' });
      o.status = 'rejected'; save(); return send(res, 200, { order: o });
    }
    return send(res, 404, { error: 'not_found' });
  }
  if (p === '/api/app-info') return send(res, 200, { support: env('SUPPORT_CONTACT', env('PAY_CONTACT', '')) });
  if (p === '/api/support/report' && req.method === 'POST') {
    if (limited(hits, 'rep:' + clientIp(req), 10, 3600e3)) return send(res, 429, { error: 'rate_limit' });
    const b = await readBody(req, 8e3);
    const message = String((b && b.message) || '').trim().slice(0, 2000);
    if (message.length < 5) return send(res, 400, { error: 'too_short' });
    const user = String(req.headers['x-qd-user'] || '').slice(0, 80), auth = String(req.headers['x-qd-auth'] || '');
    const me = user && auth && auth.length <= 200 ? await store.get('idx', user) : null;
    const shop = me && safeEq(cloudHash(auth, me.salt), me.h) ? (me.owner || user) : '';
    DB.reports = DB.reports.concat([{ id: newId(), at: new Date().toISOString(), message, contact: String(b.contact || '').trim().slice(0, 120), page: String(b.page || '').slice(0, 40), shop }]).slice(-500);
    save(); return send(res, 200, { ok: true });
  }
  if (p.startsWith('/api/cloud')) return cloudApi(req, res, p);
  if (p.startsWith('/api/news/')) return newsApi(req, res, p);
  if (p.startsWith('/api/notify/')) return notifyApi(req, res, p);
  if (p === '/api/app-version') return appVersion(req, res, url);
  if (p === '/api/rates') return DB.rates ? send(res, 200, DB.rates) : send(res, 404, { error: 'no_rates' });
  if (p === '/api/push/key') return send(res, 200, { key: b64u(vapidPub()) });
  if (!p.startsWith('/api/sms/')) return send(res, 404, { error: 'not_found' });
  // Hisob: faqat bulut kirish ma'lumoti (login + parol xeshi). Eski "x-account/x-token" yo'li o'chirildi:
  // u hali band bo'lmagan istalgan hisob nomini egallashga imkon berardi.
  const user = String(req.headers['x-qd-user'] || '').slice(0, 80), auth = String(req.headers['x-qd-auth'] || '');
  const me = user && auth && auth.length <= 200 ? await store.get('idx', user) : null;
  if (!(me && safeEq(cloudHash(auth, me.salt), me.h))) return send(res, 401, { error: 'auth' });
  const role = roleOf(user, me), id = me.owner || user, a = await refreshDebts(id);
  if (SMS_PERM[p] && !hasPerm(role, SMS_PERM[p])) return send(res, 403, { error: 'forbidden', need: SMS_PERM[p] });

  if (p === '/api/sms/state' && req.method === 'GET') return send(res, 200, state(a));
  const b = req.method === 'POST' ? await readBody(req) : {};
  if (p === '/api/sms/settings') { a.settings = validSettings(b, a.settings); save(); return send(res, 200, state(a)); }
  if (p === '/api/sms/sync') {
    const next = {};
    for (const d of Array.isArray(b.debts) ? b.debts.slice(0, 5000) : []) {
      if (!d || typeof d.id !== 'string') continue;
      next[d.id] = { id: d.id, name: String(d.name || '').slice(0, 80), phone: String(d.phone || '').slice(0, 30), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(d.dueDate || '') ? d.dueDate : null,
        balance: Number(d.balance) || 0, cur: String(d.cur || 'UZS').slice(0, 4), optOut: !!d.optOut,
        items: String(d.items || '').replace(/[\r\n]+/g, ' ').slice(0, 70), promise: /^\d{4}-\d{2}-\d{2}$/.test(d.promise || '') ? d.promise : null };
    }
    a.debts = next; save(); return send(res, 200, { ok: true });
  }
  if (p === '/api/sms/send') {
    const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
    if (!items.length) return send(res, 400, { error: 'empty' });
    if (hourCount(a) + items.length > HOURLY_CAP) return send(res, 429, { error: 'rate_limit' });
    const prepared = [];
    for (const it of items) {
      const phone = normalizePhone(it.phone), body = cleanText(it.text || '');
      const d = it.debtId && a.debts[it.debtId];
      if (it.channel === 'tg') {
        if (!d || !a.tg[it.debtId] || a.tgStop[it.debtId] || d.optOut || !body || body.length > 500) return send(res, 400, { error: 'tg_not_linked', name: it.name });
        prepared.push({ phone: phone || '', body, name: String(it.name || '').slice(0, 80), debtId: it.debtId, parts: 0, channel: 'tg' }); continue;
      }
      if (!phone) return send(res, 400, { error: 'bad_phone', name: it.name });
      if (!body || /\{(name|amount|due|phone)\}/.test(body)) return send(res, 400, { error: 'bad_text', name: it.name });
      if (body.length > 500) return send(res, 400, { error: 'too_long', name: it.name });
      if (d && d.optOut) return send(res, 400, { error: 'opted_out', name: it.name });
      prepared.push({ phone, body, name: String(it.name || '').slice(0, 80), debtId: it.debtId || null, parts: smsInfo(body).parts, channel: 'sms' });
    }
    const need = prepared.reduce((s, x) => s + x.parts, 0);
    if (a.credits < need) return send(res, 402, { error: 'no_credits', need, credits: a.credits });
    for (const x of prepared) a.log.push({ channel: x.channel, id: newId(), kind: 'manual', debtId: x.debtId, name: x.name, phone: x.phone, body: x.body, parts: x.parts, status: 'pending', error: null,
      providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() });
    save(); await runQueue();
    return send(res, 200, state(a));
  }
  if (p === '/api/sms/call') {          // qo'lda: tanlangan mijozlarga qo'ng'iroq
    if (!callReady()) return send(res, 400, { error: 'provider_missing' });
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 20); let n = 0;
    for (const did of ids) {
      const d = a.debts[did]; if (!d || !(d.balance > 0) || d.optOut) continue; const phone = normalizePhone(d.phone); if (!phone) continue;
      if (a.log.some((e) => e.channel === 'call' && e.debtId === did && e.status === 'pending')) continue;
      a.log.push({ id: newId(), channel: 'call', kind: 'callmanual', debtId: did, name: d.name, phone, body: buildCallText(a, d), parts: 1, status: 'pending', error: null, providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() }); n++;
    }
    save(); if (n) await runQueue(); return send(res, 200, Object.assign({ queued: n }, state(a)));
  }
  if (p === '/api/sms/packages') {
    if (purchaseHidden()) return send(res, 403, { error: 'purchase_disabled' });
    return send(res, 200, { perSms: smsPrice(), perCall: callPrice(), callPackages: callPackages(), min: minAmount(), max: maxAmount(), packages: packages(), pay: { info: env('PAY_INFO'), contact: env('PAY_CONTACT') }, orders: DB.orders.filter((o) => o.account === id).slice(-20).reverse().map(publicOrder) });
  }
  if (p === '/api/sms/buy') {
    const r = newOrder(id, b.amount !== undefined ? { amount: b.amount, kind: b.kind } : { sms: parseInt(b.sms, 10), kind: b.kind });
    return r.error ? send(res, 400, r) : send(res, 200, { order: publicOrder(r.order) });
  }
  if ((p === '/api/sms/claim' || p === '/api/sms/receipt') && purchaseHidden()) return send(res, 403, { error: 'purchase_disabled' });
  if (p === '/api/sms/claim') {
    const o = DB.orders.find((x) => x.id === b.id && x.account === id);
    if (!o || o.status !== 'pending') return send(res, 400, { error: 'cannot_claim' });
    o.status = 'claimed'; o.claimedAt = new Date().toISOString(); save(); return send(res, 200, { order: publicOrder(o) });
  }
  if (p === '/api/sms/delete-account') {
    if (b.confirm !== 'DELETE') return send(res, 400, { error: 'confirm' });
    try { await deleteAccount(id); return send(res, 200, { ok: true }); }
    catch (e) { console.error('hisobni o\'chirish xatosi:', e.message); return send(res, 503, { error: 'delete_failed' }); }
  }
  if (p === '/api/sms/receipt') {
    const o = DB.orders.find((x) => x.id === b.id && x.account === id);
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || ''));
    if (!o || (o.status !== 'pending' && o.status !== 'claimed') || !m) return send(res, 400, { error: 'bad_receipt' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2.5e6 || buf.length < 500) return send(res, 400, { error: 'bad_receipt' });
    const dir = path.join(path.dirname(DATA_FILE), 'receipts'); fs.mkdirSync(dir, { recursive: true });
    o.receipt = o.id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(dir, o.receipt), buf);
    if (o.status === 'pending') { o.status = 'claimed'; o.claimedAt = new Date().toISOString(); }
    save(); return send(res, 200, { order: publicOrder(o) });
  }
  if (p === '/api/sms/tg-link') {
    if (!tgReady() || !tgUser) return send(res, 400, { error: 'tg_missing' });
    const debtId = String(b.debtId || ''); if (!a.debts[debtId]) return send(res, 400, { error: 'no_debt' });
    return send(res, 200, { link: tgLink(id, debtId), linked: !!a.tg[debtId], stopped: !!a.tgStop[debtId] });
  }
  if (p === '/api/sms/tg-unlink') { const l = a.tg[b.debtId]; if (l) { delete DB.tgChats[l.chatId]; delete a.tg[b.debtId]; save(); } return send(res, 200, { ok: true }); }
  if (p === '/api/sms/tg-inbox') return send(res, 200, { msgs: a.inbox.slice(-200), linked: Object.keys(a.tg) });
  if (p === '/api/sms/tg-read') { a.inbox.forEach((m) => { if (m.debtId === b.debtId) m.read = true; }); save(); return send(res, 200, { ok: true }); }
  if (p === '/api/sms/tg-reply') {
    const l = a.tg[b.debtId], text = String(b.text || '').trim().slice(0, 1000);
    if (!l || !text) return send(res, 400, { error: 'cannot_reply' });
    const r = await tgSend(l.chatId, text);
    if (r.kind !== 'sent') return send(res, 400, { error: r.kind === 'blocked' ? 'tg_blocked' : 'tg_failed' });
    const d = a.debts[b.debtId]; a.inbox.push({ id: newId(), debtId: b.debtId, name: d ? d.name : '', dir: 'out', text, at: new Date().toISOString(), read: true }); save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/sms/push-sub') {
    const sb = b.subscription;
    if (!sb || typeof sb.endpoint !== 'string' || !/^https:\/\//.test(sb.endpoint) || !sb.keys || !sb.keys.p256dh || !sb.keys.auth) return send(res, 400, { error: 'bad_subscription' });
    a.push = a.push.filter((x) => x.endpoint !== sb.endpoint); a.push.push({ endpoint: sb.endpoint, keys: { p256dh: sb.keys.p256dh, auth: sb.keys.auth } });
    a.push = a.push.slice(-5); save(); return send(res, 200, { ok: true, devices: a.push.length });
  }
  if (p === '/api/sms/push-off') { a.push = a.push.filter((x) => x.endpoint !== b.endpoint); save(); return send(res, 200, { ok: true, devices: a.push.length }); }
  if (p === '/api/sms/push-test') {
    const n = await pushTo(a, { title: 'Qarzim', body: "Bildirishnoma ishlayapti. Kerak bo'lganda shu yerga eslatma keladi.", url: '/' });
    return n ? send(res, 200, { ok: true }) : send(res, 400, { error: 'push_failed' });
  }
  if (p === '/api/sms/test') {
    const phone = normalizePhone(b.phone);
    if (!phone) return send(res, 400, { error: 'bad_phone' });
    if (!providerConfigured()) return send(res, 400, { error: 'provider_missing' });
    const body = cleanText("Qarzim: test SMS. Sozlamalar to'g'ri ishlayapti.");
    if (a.credits < 1) return send(res, 402, { error: 'no_credits' });
    a.log.push({ id: newId(), kind: 'test', debtId: null, name: 'Test', phone, body, parts: smsInfo(body).parts, status: 'pending', error: null, providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() });
    save(); await runQueue(); return send(res, 200, state(a));
  }
  if (p === '/api/sms/resend') {
    const e = a.log.find((x) => x.id === b.id);
    if (!e || e.status !== 'failed' || ['debt_paid', 'opted_out'].includes(e.error)) return send(res, 400, { error: 'cannot_resend' });
    const d = e.debtId && a.debts[e.debtId];
    if (d && d.optOut) return send(res, 400, { error: 'opted_out' });
    // Yangi yozuv sifatida (eski yozuv tarixda qoladi)
    a.log.push({ id: newId(), kind: e.kind === 'auto' ? 'manual' : e.kind, debtId: e.debtId, name: e.name, phone: e.phone, body: e.body, parts: e.parts, status: 'pending', error: null,
      providerId: null, attempts: 0, nextAt: 0, charged: 0, createdAt: new Date().toISOString() });
    save(); await runQueue(); return send(res, 200, state(a));
  }
  return send(res, 404, { error: 'not_found' });
}

// Sahifalar uchun Content-Security-Policy: ilova inline skript/uslub ishlatadi, shuning uchun 'unsafe-inline' qoldi;
// boshqa manbalar (begona skript, freym, obyekt) bloklanadi.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cbu.uz https://*.firebaseio.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const STATIC = { '/': 'qarz-daftar.html', '/index.html': 'qarz-daftar.html', '/qarz-daftar.html': 'qarz-daftar.html', '/sw.js': 'sw.js', '/admin': 'admin.html',
  '/manifest.webmanifest': 'manifest.webmanifest', '/privacy': 'privacy.html', '/.well-known/assetlinks.json': '.well-known/assetlinks.json',
  // Brauzerlar bularni avtomatik so'raydi (tab belgisi): ildizdagi favicon fayllari
  '/favicon.ico': 'favicon.ico', '/favicon.svg': 'favicon.svg' };
const corsList = () => env('CORS_ORIGINS', 'capacitor://localhost,ionic://localhost,http://localhost,https://localhost').split(',').map((x) => x.trim()).filter(Boolean);
const hits = new Map(), fails403 = new Map();
function clientIp(req) { return (env('TRUST_PROXY') === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?'; }
function limited(map, key, max, windowMs) {
  const now = Date.now(); let r = map.get(key);
  if (!r || now - r.t > windowMs) { r = { n: 0, t: now }; map.set(key, r); }
  r.n++; return r.n > max;
}
setInterval(() => { const now = Date.now(); for (const m of [hits, fails403]) for (const [k, v] of m) if (now - v.t > 600e3) m.delete(k); }, 60000).unref();
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.socket.encrypted || (env('TRUST_PROXY') === '1' && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https'))
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!req.url.startsWith('/api/')) res.setHeader('Content-Security-Policy', CSP);
    const origin = req.headers.origin;
    if (origin && corsList().includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Account, X-Token, X-Admin-Key, X-Qd-User, X-Qd-Auth'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    }
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const ip = clientIp(req);
      if (limited(hits, ip, 900, 60000)) return send(res, 429, { error: 'rate_limit' });                  // daqiqasiga 900 so'rov
      if ((fails403.get(ip) || { n: 0 }).n > 30) return send(res, 429, { error: 'rate_limit' });           // ko'p noto'g'ri urinish
      const origEnd = res.end.bind(res);
      res.end = (...args) => { if (res.statusCode === 401 || res.statusCode === 403) limited(fails403, ip, 1e9, 600e3); return origEnd(...args); };
      return await api(req, res, url);
    }
    let f = STATIC[url.pathname];
    if (!f && /^\/icons\/[a-z0-9-]+\.png$/.test(url.pathname)) f = url.pathname.slice(1);
    if (!f && /^\/v1[12]\/[a-z0-9-]+\.(js|css)$/.test(url.pathname)) f = url.pathname.slice(1);   // v11/v12 modul fayllari (?v=… bilan keshdan yangilanadi)
    const full = f && path.join(__dirname, f);
    if (!f || !fs.existsSync(full)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Topilmadi'); }
    const type = MIME[path.extname(f)] || 'application/octet-stream';
    // Ikonalar va favicon: uzoq kesh, lekin URL dagi ?v=… versiya o‘zgarganda yangisi olinadi
    const cache = (f.startsWith('icons/') || /^favicon\./.test(f)) ? 'public, max-age=86400' : 'no-store';
    if (f === 'privacy.html') {
      const html = fs.readFileSync(full, 'utf8').replace(/\{\{CONTACT\}\}/g, env('PRIVACY_CONTACT', env('PAY_CONTACT', "[aloqa ma'lumotingizni env.txt dagi PRIVACY_CONTACT ga yozing]")).replace(/[<>&]/g, ''))
        .replace(/\{\{OWNER\}\}/g, env('PRIVACY_OWNER', '[kompaniya yoki ism]').replace(/[<>&]/g, ''));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Service-Worker-Allowed': '/' });
    fs.createReadStream(full).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server' }); }
});

// ---------- buyruq qatori: node server.js add-credits <hisob> <son> ----------
if (process.argv[2] === 'add-credits') {
  const [, , , id, n] = process.argv;
  if (!DB.accounts[id] || !parseInt(n, 10)) { console.log('Foydalanish: node server.js add-credits <hisob_nomi> <kredit_soni>\nHisoblar:', Object.keys(DB.accounts).join(', ') || '(hali yo\'q)'); process.exit(1); }
  addCredits(id, parseInt(n, 10), 'cli'); saveNow(); console.log(id, '→ kredit:', DB.accounts[id].credits); process.exit(0);
}
if (process.argv[2] === 'orders') { for (const o of DB.orders) console.log(o.code, o.status.padEnd(9), o.account, o.sms + ' SMS', o.price + " so'm"); process.exit(0); }
if (process.argv[2] === 'approve') { const r = approveOrder(String(process.argv[3] || '')); saveNow(); console.log(r.error ? 'Xato: ' + r.error : `Tasdiqlandi: ${r.order.account} +${r.order.sms} SMS`); process.exit(r.error ? 1 : 0); }
if (process.argv[2] === 'accounts') { for (const [id, a] of Object.entries(DB.accounts)) console.log(id, 'kredit:', a.credits); process.exit(0); }

// ---------- zaxira buyruqlari: backup | backups | restore <fayl> --confirm ----------
const CLI_CMDS = ['add-credits', 'orders', 'approve', 'accounts', 'backup', 'backups', 'restore'];
if (process.argv[2] === 'backup') {
  makeBackup('manual').then((r) => { console.log('Zaxira yaratildi:', path.join(backupDir(), r.name), `(${r.bytes} bayt)`); process.exit(0); })
    .catch((e) => { console.error('Zaxira xatosi:', e.message); process.exit(1); });
}
if (process.argv[2] === 'backups') {
  const l = listBackups();
  if (!l.length) console.log("Zaxira yo'q. Papka:", backupDir());
  for (const b of l) console.log(b.name, String(b.bytes).padStart(12), 'bayt', b.at);
  process.exit(0);
}
if (process.argv[2] === 'restore') {
  const file = process.argv[3], confirm = process.argv.includes('--confirm');
  if (!file || !confirm) { console.log("Foydalanish: node server.js restore <zaxira.json> --confirm\nJoriy holat avval 'pre-restore' zaxirasiga olinadi. Serverni avval to'xtating."); process.exit(1); }
  if (lockHeld()) { console.error("Server ishlayapti. Avval uni to'xtating, so'ng tiklang."); process.exit(1); }
  restoreBackup(path.resolve(file)).then((r) => { console.log(`Tiklandi: ${r.accounts} ta hisob, ${r.cloudRows} ta bulut yozuvi (zaxira: ${r.at}). Oldingi holat: ${r.safety}`); process.exit(0); })
    .catch((e) => { console.error('Tiklash bekor qilindi:', e.message); process.exit(1); });
}

if (require.main === module && !CLI_CMDS.includes(process.argv[2])) {
  if (lockHeld()) { console.error(`Qarzim allaqachon ishlayapti (${LOCK_FILE()}). Ikkinchi nusxa ishga tushmaydi.`); process.exit(1); }
  writeLock();
  server.listen(PORT, () => {
    console.log(`Qarzim:  http://localhost:${PORT}`);
    console.log('SMS provayder:', providerConfigured() ? (env('ESKIZ_TEST_MODE') === '1' ? 'ulangan (TEST rejimi)' : 'ulangan') : "ULANMAGAN — .env (env.txt) ga ESKIZ_EMAIL va ESKIZ_PASSWORD yozing");
    if (!env('ADMIN_KEY')) console.log("Eslatma: ADMIN_KEY yo'q — kreditni faqat `node server.js add-credits` bilan qo'shish mumkin.");
  });
  setInterval(tick, 30000); setTimeout(tick, 3000);
  // v11: jurnalni qarz daftari bilan qayta moslash (ishga tushganda va har soatda)
  const opsPass = () => { for (const id of Object.keys(DB.accounts)) { const a = DB.accounts[id]; if (a && a.ops && a.ops.activeFrom) opsHttp.projectShop(id).catch((e) => console.error('ops:', e.message)); } };
  setTimeout(opsPass, 8000); setInterval(opsPass, 3600e3).unref();
  updateRates(); setInterval(updateRates, 3 * 3600e3);
  tgLoop().catch((e) => console.error('tgLoop:', e));
  process.on('uncaughtException', (e) => console.error('uncaught:', e));
  process.on('unhandledRejection', (e) => console.error('unhandled:', e));
  process.on('SIGINT', () => { saveNow(); clearLock(); process.exit(0); });
  process.on('SIGTERM', () => { saveNow(); clearLock(); process.exit(0); });
}
module.exports = { enqueueCalls, refreshDebts, store, deleteAccount, tgUpdate, tgLink, tgSend, tgLoop, updateRates, encryptPush, vapidAuth, vapidPub, pushTo, digestTick, approveOrder, newOrder, packages, normalizePhone, smsInfo, renderTemplate, smsMoney, reminderNo, server, tick, runQueue, DB, acct, addCredits, enqueueAuto, eskizSend,
  makeBackup, restoreBackup, listBackups, backupStatus, reconcile, roleOf, hasPerm, ROLES, lockHeld, writeAtomic };
