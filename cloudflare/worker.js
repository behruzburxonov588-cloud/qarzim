// Qarzim — Cloudflare Workers kirish nuqtasi.
// Statik fayllar "assets" orqali beriladi. Bu yerda faqat:
//  - "/" va "/index.html" → qarz-daftar.html
//  - "/privacy" → privacy.html ({{OWNER}}, {{CONTACT}} to'ldiriladi)
//  - "/api/cloud/*" → vaqtinchalik bulut (Cloudflare D1, cloud.js): login, xodimlar, sinxronlash
//  - boshqa "/api/*" → 404 JSON (SMS markazi, Telegram, Ombor — server olingach)
import { cloudApi } from './cloud.js';
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cbu.uz https://*.firebaseio.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";

function secure(res, html) {
  const h = new Headers(res.headers);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (html) { h.set('Content-Security-Policy', CSP); h.set('Cache-Control', 'no-cache'); }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const asset = (req, env, path) => env.ASSETS.fetch(new Request(new URL(path, req.url), req));
const clean = (s, d) => String(s || d).replace(/[<>&]/g, '');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p.startsWith('/api/cloud')) return cloudApi(req, env, p);
    if (p.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (p === '/' || p === '/index.html') return secure(await asset(req, env, '/qarz-daftar'), true);
    if (p === '/privacy' || p === '/privacy.html') {
      const r = await asset(req, env, '/privacy');
      if (!r.ok) return r;
      const html = (await r.text())
        .replace(/\{\{CONTACT\}\}/g, clean(env.PRIVACY_CONTACT, "[aloqa ma'lumoti hali yozilmagan]"))
        .replace(/\{\{OWNER\}\}/g, clean(env.PRIVACY_OWNER, '[kompaniya yoki ism]'));
      return secure(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }), true);
    }
    const r = await env.ASSETS.fetch(req);
    return secure(r, (r.headers.get('content-type') || '').includes('text/html'));
  },
};
