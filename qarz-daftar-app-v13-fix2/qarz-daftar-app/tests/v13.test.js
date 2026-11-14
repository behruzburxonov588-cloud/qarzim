'use strict';
// v13 checks: the page carries its own styles, logo and favicons; cache versions; security headers on the page.
// Every server runs as a child process against a throwaway data directory in the OS temp folder.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn } = require('child_process');

const APP = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qd-v13-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), DATA_FILE: path.join(dataDir, 'data.json') };
  const child = spawn(process.execPath, ['server.js'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 150 && !up; i++) { try { up = (await fetch(base + '/')).ok; } catch (e) { await sleep(100); } }
  if (!up) throw new Error('server did not start:\n' + out);
  return {
    base,
    stop: async () => { const exited = new Promise((r) => child.once('exit', r)); child.kill('SIGTERM'); await exited; fs.rmSync(dataDir, { recursive: true, force: true }); },
  };
}

describe('v13 self-contained page and icons', () => {
  let srv, res, html;
  before(async () => { srv = await startServer(); res = await fetch(srv.base + '/'); html = await res.text(); });
  after(async () => { if (srv) await srv.stop(); });

  test('the chart and app styles are inside the page, not in separate files', () => {
    assert.match(html, /<style>\/\* v11\/app\.css/);
    assert.match(html, /\.qc-line polyline\{/);
    assert.doesNotMatch(html, /<link rel="stylesheet" href="v12\//);
    assert.doesNotMatch(html, /<link rel="stylesheet" href="v11\/app\.css/);
  });

  test('the chart line is never filled, even without a stylesheet', () => {
    assert.match(html, /<polyline points="'\+pts\+'" fill="none"/);
  });

  test('the logo is embedded as a data URI and used by every logo image', () => {
    assert.match(html, /var QD_LOGO="data:image\/png;base64,[A-Za-z0-9+/=]{1000,}"/);
    assert.doesNotMatch(html, /src="\/icons\/logo-mark-160\.png"/);
    assert.ok((html.match(/src="'\+QD_LOGO\+'"/g) || []).length >= 4);
  });

  test('the browser tab icons are embedded and the rest point at v13 files', () => {
    assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,/);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="16x16" href="data:image\/png;base64,/);
    assert.match(html, /\/favicon\.svg\?v=13/);
    assert.match(html, /manifest\.webmanifest\?v=13/);
    assert.doesNotMatch(html, /v11\/app\.js/);
    assert.match(html, /window\.QDV11 = \{ open: open/);
    assert.match(html, /Ombor yuklanmadi/);
  });

  test('the viewport meta does not block pinch zoom', () => {
    const m = html.match(/<meta[^>]+name="viewport"[^>]*>/);
    assert.ok(m, 'viewport meta present');
    assert.doesNotMatch(m[0], /maximum-scale|user-scalable=no/);
  });

  test('the page is served with a CSP that allows its inline styles and embedded images', () => {
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data:/);
  });

  test('the service worker uses the v4 shell cache', () => {
    const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
    assert.match(sw, /const CACHE = 'qd-shell-v4'/);
  });

  test('the favicon and icon routes still answer', async () => {
    const ico = await fetch(srv.base + '/favicon.ico');
    assert.equal(ico.status, 200);
    assert.match(ico.headers.get('content-type') || '', /^image\//);
    const svg = await fetch(srv.base + '/favicon.svg');
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
    const png = await fetch(srv.base + '/icons/logo-mark-160.png');
    assert.equal(png.status, 200);
    assert.equal(png.headers.get('content-type'), 'image/png');
  });
});
