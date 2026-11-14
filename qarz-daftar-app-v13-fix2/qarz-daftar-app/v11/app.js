/* Qarzim v11 — ombor, kassa, daromad-xarajat, moliyaviy hisobotlar va AI yordamchi.
 * Ma’lumot faqat serverdan keladi (/api/cloud/ops/*). Mijoz hech qanday qoldiq yoki pulni o‘zi hisoblamaydi
 * (ko‘rsatish uchun formatlash bundan mustasno). Ruxsatlar /me dan olinadi; server har marshrutda qayta tekshiradi.
 */
(function () {
  'use strict';
  var X = window.__qdx;
  if (!X) return;                                   // v10 ko‘prigi yo‘q bo‘lsa — ishga tushmaydi

  /* ---------- yordamchilar ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var grp = function (s) { return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var fmt = function (n, d) {
    var neg = n < 0, s = Math.abs(n).toFixed(d || 0), p = s.split('.');
    return (neg ? '−' : '') + grp(p[0]) + (p[1] ? '.' + p[1] : '');
  };
  var scale = function (c) { return c === 'UZS' ? 1 : 100; };
  var moneyUzs = function (minor) { return fmt(Math.round(minor || 0)) + ' so‘m'; };
  var money = function (minor, cur) { cur = cur || 'UZS'; return cur === 'UZS' ? moneyUzs(minor) : fmt((minor || 0) / 100, 2) + ' ' + cur; };
  var qtyFmt = function (milli) { var v = Math.round(milli || 0) / 1000; return grp(String(+v.toFixed(3))); };
  var shortNum = function (v) {
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + ' mlrd';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + ' mln';
    if (a >= 1e3) return Math.round(v / 1e3) + ' ming';
    return fmt(v);
  };
  var pnum = function (v) { var x = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : null; };
  var today = function () { return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); };      // Toshkent (UTC+5)
  var opId = function (p) { return (p || 'op') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); };
  var keyLabel = function (k) { return k && k.length === 7 ? k.slice(5, 7) + '.' + k.slice(2, 4) : (k || '').slice(8, 10) + '.' + (k || '').slice(5, 7); };
  var pct = function (a, b) { if (!b) return null; return Math.round((a - b) / Math.abs(b) * 1000) / 10; };
  var deltaHtml = function (a, b) {
    var p = pct(a, b);
    if (p === null) return '<span class="k-s">oldingi davrda ma’lumot yo‘q</span>';
    return '<span class="k-s ' + (p >= 0 ? 'up' : 'down') + '">' + (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% oldingi davrga nisbatan</span>';
  };
  var ERRS = {
    forbidden: 'Bu amal uchun ruxsatingiz yo‘q', auth: 'Kirish muddati tugagan — qayta kiring',
    network: 'Server bilan aloqa yo‘q. Internetni tekshirib, qayta urinib ko‘ring', offline: 'Bulut serveriga ulanmagan'
  };
  var errText = function (r) {
    var d = r && r.data || {};
    if (d.message) return d.message;
    if (ERRS[d.error]) return ERRS[d.error];
    if (r && r.status === 403) return ERRS.forbidden;
    return 'Xatolik yuz berdi' + (r && r.status ? ' (' + r.status + ')' : '');
  };
  var svg = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var I = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    box: '<path d="M21 8 12 3 3 8l9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    inn: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    out: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>',
    wallet: '<rect x="2.5" y="6" width="19" height="14" rx="3"/><path d="M16 13h2"/><path d="M2.5 10h19"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    spark: '<path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
  };
  var NAV = [
    { id: 'dash', t: 'Boshqaruv paneli', ic: 'dash', need: ['inv_view'] },
    { id: 'stock', t: 'Ombor', ic: 'box', need: ['inv_view'] },
    { id: 'products', t: 'Tovarlar', ic: 'tag', need: ['inv_view'] },
    { id: 'purchase', t: 'Tovar kirimi', ic: 'inn', need: ['inv_move'] },
    { id: 'moves', t: 'Tovar chiqimi', ic: 'out', need: ['inv_move', 'inv_adjust'] },
    { id: 'cash', t: 'Kassa', ic: 'wallet', need: ['cash_view'] },
    { id: 'expenses', t: 'Daromad va xarajatlar', ic: 'receipt', need: ['fin_reports'] },
    { id: 'reports', t: 'Moliyaviy hisobotlar', ic: 'chart', need: ['fin_reports'] },
    { id: 'ai', t: 'AI yordamchi', ic: 'spark', need: ['ai'] }
  ];
  var PERIODS = [['today', 'Bugun'], ['week', 'Hafta'], ['month', 'Oy'], ['year', 'Yil'], ['custom', 'Oraliq']];
  var METHODS = [['naqd', 'Naqd pul'], ['karta', 'Karta'], ['otkazma', 'O‘tkazma'], ['boshqa', 'Boshqa']];
  var METHOD_LBL = { naqd: 'Naqd', karta: 'Karta', otkazma: 'O‘tkazma', boshqa: 'Boshqa', 'noma’lum': 'Noma’lum' };
  var TYPE_LBL = { sale: 'Sotuv', reversal: 'Bekor qilish', payment: 'To‘lov', purchase: 'Kirim (xarid)', expense: 'Xarajat', cash_adjust: 'Kassa tuzatish', writeoff: 'Yaroqsiz / yo‘qotish', adjust: 'Inventarizatsiya', purchase_rev: 'Xarid bekor', writeoff_rev: 'Chiqim bekor', adjust_rev: 'Tuzatish bekor', sale_rev: 'Sotuv bekor' };

  /* ---------- holat ---------- */
  var V = {
    open: false, root: null, section: 'dash', theme: 'dark', me: null, perms: [], role: '',
    state: null, sum: null, jr: [], jtotal: 0, jlimit: 200, loadErr: '', loading: false,
    period: { preset: 'month', from: '', to: '', group: '' }, tips: [], ai: { hist: [], ex: null, busy: false },
    filters: { stock: { q: '', st: 'all', cat: '' }, products: { q: '' } }, purchLines: 0, importBuf: null, sumReq: 0
  };
  try { V.theme = localStorage.getItem('qarzim_v11_theme') || 'dark'; } catch (e) { /* xotira yo‘q */ }
  var can = function (p) { return V.perms.indexOf(p) >= 0; };
  var canAny = function (list) { return list.some(can); };
  var canNav = function (item) { return canAny(item.need); };
  var offline = function () { return !X.isSrv() || (X.demo && X.demo()); };

  /* ---------- tarmoq ---------- */
  function apiBase() { return X.curl() + '/ops'; }
  async function api(method, path, body, raw) {
    if (offline()) return { ok: false, status: 0, data: { error: 'offline' } };
    var h = X.qhead(raw ? { 'Content-Type': 'application/octet-stream' } : (body !== undefined ? { 'Content-Type': 'application/json' } : {}));
    try {
      var r = await fetch(apiBase() + path, { method: method, headers: h, cache: 'no-store', body: raw ? body : (body !== undefined ? JSON.stringify(body) : undefined) });
      var data = null;
      if ((r.headers.get('content-type') || '').indexOf('json') >= 0) data = await r.json().catch(function () { return null; });
      return { ok: r.ok, status: r.status, data: data || {} };
    } catch (e) { return { ok: false, status: 0, data: { error: 'network' } }; }
  }
  function periodQS(withGroup) {
    var p = V.period, q = 'period=' + p.preset;
    if (p.preset === 'custom') q += '&from=' + encodeURIComponent(p.from) + '&to=' + encodeURIComponent(p.to);
    if (withGroup && p.group) q += '&group=' + p.group;
    return q;
  }
  async function loadMe() {
    var r = await api('GET', '/me');
    if (r.status === 401 && typeof window.cloudSync === 'function') {
      // yangi hisobning bulutdagi yozuvi birinchi sinxronlashda yaratiladi (v10 tartibi): shuni majburan bajaramiz
      try { await window.cloudSync(); } catch (e) { /* keyingi urinishda xato ko‘rsatiladi */ }
      r = await api('GET', '/me');
    }
    if (!r.ok) { V.loadErr = errText(r); return false; }
    var d = r.data;
    V.me = d; V.perms = d.perms || []; V.role = d.role || '';
    return true;
  }
  async function loadAll() {
    if (offline()) { V.loadErr = ''; render(); return; }
    V.loading = true; render();
    var ok = await loadMe();
    if (!ok) { V.loading = false; render(); return; }
    var reqs = [];
    if (can('ai') && !V.ai.ex) reqs.push(api('GET', '/ai/examples').then(function (r) { if (r.ok) V.ai.ex = r.data.examples || []; }));
    if (can('inv_view')) reqs.push(api('GET', '/state').then(function (r) { if (r.ok) V.state = r.data; else V.loadErr = errText(r); }));
    if (can('fin_reports')) {
      reqs.push(api('GET', '/summary?' + periodQS(true)).then(function (r) { if (r.ok) V.sum = r.data; else V.loadErr = errText(r); }));
      reqs.push(api('GET', '/journal?' + periodQS(false) + '&limit=' + V.jlimit).then(function (r) { if (r.ok) { V.jr = r.data.rows || []; V.jtotal = r.data.total || 0; } }));
    } else { V.sum = null; V.jr = []; }
    await Promise.all(reqs);
    if (X.products !== undefined && V.state) X.products = V.state.products || [];
    if (V.state) window.__qdx.products = V.state.products || [];
    V.loading = false;
    render();
  }

  /* ---------- rejected (saqlanmagan) sotuvlar — v10 ko‘prigi ---------- */
  function rejList() { try { return X.rej ? X.rej.list() : []; } catch (e) { return []; } }

  /* ---------- modal, toast, tooltip ---------- */
  function note(msg, ok) {
    if (!V.root) return;
    var w = V.root.querySelector('#v11Toast'); if (!w) return;
    var el = document.createElement('div'); el.className = ok === false ? 'bad' : 'ok'; el.textContent = msg;
    w.appendChild(el); setTimeout(function () { el.remove(); }, 3200);
  }
  function openModal(html, onSubmit) {
    var m = V.root.querySelector('#v11Modal');
    m.innerHTML = '<form class="v11-modal" id="v11MF" novalidate>' + html + '</form>';
    m.classList.add('open');
    var f = m.querySelector('#v11MF');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      runForm(f, async function () { return onSubmit(f); });
    });
    var first = f.querySelector('input,select,textarea'); if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeModal() { var m = V.root && V.root.querySelector('#v11Modal'); if (m) { m.classList.remove('open'); m.innerHTML = ''; } }
  async function runForm(form, fn) {
    var btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try {
      var err = await fn(form);
      if (err) {
        var el = form.querySelector('.v11-msg-err');
        if (el) el.textContent = err; else note(err, false);
      }
    } catch (e) { note('Xatolik: ' + (e && e.message || e), false); }
    finally { if (btn) btn.disabled = false; }
  }
  function tipShow(html, e) {
    var t = V.root.querySelector('#v11Tip'); t.innerHTML = html; t.style.display = 'block'; tipMove(e);
  }
  function tipMove(e) {
    var t = V.root.querySelector('#v11Tip'); if (t.style.display !== 'block') return;
    var x = e.clientX + 14, y = e.clientY + 14, w = t.offsetWidth, h = t.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function tipHide() { var t = V.root && V.root.querySelector('#v11Tip'); if (t) t.style.display = 'none'; }

  /* ---------- diagrammalar ---------- */
  function emptyBox(title, text) {
    return '<div class="v11-empty"><div class="e-ico">' + svg(I.inbox) + '</div><h4>' + esc(title) + '</h4><p>' + esc(text || '') + '</p></div>';
  }
  function tipSeries(r) {
    return '<b>' + esc(keyLabel(r.key)) + '</b>' +
      '<div>Daromad <b>' + esc(moneyUzs(r.revenue)) + '</b></div>' +
      '<div>Sof foyda <b>' + esc(moneyUzs(r.netProfit)) + '</b></div>' +
      '<div>Xarajat <b>' + esc(moneyUzs(r.expenses)) + '</b></div>' +
      '<div>Sotuvlar <b>' + esc(r.sales || 0) + '</b></div>';
  }
  /* Silliq chiziq (Catmull-Rom → Bezier). */
  function smoothPath(pts) {
    if (!pts.length) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1), i;
    for (i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  /* Tekis, o‘qishga qulay o‘qlar: 4 ta oraliq, toza yaxlitlangan qiymatlar. */
  function niceTicks(lo, hi) {
    var raw = (hi - lo) / 4 || 1, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    var a = Math.floor(lo / st + 1e-9), b = Math.ceil(hi / st - 1e-9), out = [], k;
    for (k = a; k <= b; k++) out.push(k * st);
    return out;
  }
  function seriesChart(rows) {
    if (!rows || !rows.length) return emptyBox('Ma’lumot yo‘q', 'Tanlangan davrda sotuv yoki xarajat yozilmagan.');
    var W = 720, H = 292, pl = 62, pr = 16, pt = 22, pb = 30, n = rows.length;
    var vals = []; rows.forEach(function (r) { vals.push(r.revenue || 0, r.netProfit || 0); });
    var hi0 = Math.max.apply(null, [0].concat(vals)), lo0 = Math.min.apply(null, [0].concat(vals));
    var ticks = niceTicks(lo0, hi0 === lo0 ? lo0 + 1 : hi0);
    var lo = ticks[0], hi = ticks[ticks.length - 1], span = (hi - lo) || 1;
    var plotH = H - pt - pb, plotW = W - pl - pr;
    var y = function (v) { return pt + plotH * (hi - v) / span; };
    var band = plotW / n, y0 = y(0);
    var x = function (i) { return pl + band * i + band / 2; };
    var g = '', i, t, tot = { rev: 0, net: 0, sales: 0 };

    // To‘r: gorizontal to‘rlar (hairline) va o‘q yorliqlari
    ticks.forEach(function (v) {
      var yy = y(v).toFixed(1);
      g += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="ax" x="' + (pl - 10) + '" y="' + (+yy + 4) + '" text-anchor="end">' + esc(shortNum(v)) + '</text>';
    });
    g += '<line class="base" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '"/>';

    var rPts = [], nPts = [];
    rows.forEach(function (r, idx) {
      rPts.push([x(idx), y(r.revenue || 0)]);
      nPts.push([x(idx), y(r.netProfit || 0)]);
      tot.rev += r.revenue || 0; tot.net += r.netProfit || 0; tot.sales += r.sales || 0;
    });
    // Daromad: yumshoq maydon (10% shaffoflik) + 2px chiziq
    var last = rPts[rPts.length - 1];
    var rLine = smoothPath(rPts);
    g += '<path class="area" d="' + rLine + 'L' + last[0].toFixed(1) + ',' + y0.toFixed(1) + 'L' + rPts[0][0].toFixed(1) + ',' + y0.toFixed(1) + 'Z"/>';
    g += '<path class="ln-rev" d="' + rLine + '"/>';
    // Sof foyda: 2px chiziq (boshqa shakl — ikkilamchi kodlash)
    g += '<path class="ln-net" d="' + smoothPath(nPts) + '"/>';

    // O‘q yorliqlari (kerak bo‘lsa siyrak)
    var step = Math.max(1, Math.ceil(n / 8));
    rows.forEach(function (r, idx) {
      // Oxirgi yorliq bilan to‘qnashmasligi uchun, oxiriga yaqin oraliq yorliqlar o‘tkazib yuboriladi
      if ((idx % step === 0 && idx <= n - 1 - Math.ceil(step / 2)) || idx === n - 1) {
        var anchor = idx === 0 ? 'start' : (idx === n - 1 ? 'end' : 'middle');
        g += '<text class="ax" x="' + x(idx).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(keyLabel(r.key)) + '</text>';
      }
    });

    // Hover: har bir davr uchun guruh — nishon (hit), vertikal chiziq va nuqtalar
    rows.forEach(function (r, idx) {
      V.tips.push(tipSeries(r));
      var cx = x(idx).toFixed(1), isLast = idx === n - 1;
      g += '<g class="pp">' +
        '<rect class="hit" data-tip="' + (V.tips.length - 1) + '" x="' + (pl + band * idx).toFixed(1) + '" y="' + pt + '" width="' + band.toFixed(1) + '" height="' + plotH + '" fill="transparent"/>' +
        '<line class="xl" x1="' + cx + '" x2="' + cx + '" y1="' + pt + '" y2="' + y0.toFixed(1) + '"/>' +
        '<circle class="dn' + (isLast ? ' on' : '') + '" cx="' + cx + '" cy="' + y(r.netProfit || 0).toFixed(1) + '" r="4"/>' +
        '<circle class="dt' + (isLast ? ' on' : '') + '" cx="' + cx + '" cy="' + y(r.revenue || 0).toFixed(1) + '" r="4.5"/>' +
        '</g>';
    });

    var neg = tot.net < 0;
    var strip = '<div class="v11-cstrip">' +
      '<div><small>Daromad</small><b>' + esc(moneyUzs(tot.rev)) + '</b></div>' +
      '<div><small>Sof foyda</small><b class="' + (neg ? 'v11-neg' : '') + '">' + esc(moneyUzs(tot.net)) + '</b></div>' +
      '<div><small>Sotuvlar</small><b>' + esc(tot.sales) + '</b></div></div>';
    return strip +
      '<div class="v11-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Daromad va sof foyda grafigi">' + g + '</svg></div>' +
      '<div class="v11-legend"><span><i class="ln area"></i>Daromad</span><span><i class="ln net"></i>Sof foyda</span><span class="v11-hint">Ustiga olib boring — tafsilot</span></div>';
  }
  function hbars(items, o) {
    o = o || {};
    if (!items || !items.length) return '<div class="v11-muted">Ma’lumot yo‘q</div>';
    var key = o.val || 'value', lab = o.label || 'name', f = o.fmt || moneyUzs;
    var m = Math.max.apply(null, [1].concat(items.map(function (i) { return Math.abs(i[key]) || 0; })));
    return items.map(function (i) {
      var w = Math.max(2, Math.round(Math.abs(i[key] || 0) / m * 100)), neg = (i[key] || 0) < 0;
      return '<div class="v11-hb"><span class="lbl" title="' + esc(i[lab]) + '">' + esc(i[lab]) + '</span><span class="val ' + (neg ? 'v11-neg' : '') + '">' + esc(f(i[key] || 0)) + '</span>' +
        '<div class="track"><div class="fill ' + (neg ? 'neg' : (o.tone || '')) + '" style="width:' + w + '%"></div></div></div>';
    }).join('');
  }
  function badge(kind, text) { return '<span class="v11-badge ' + kind + '">' + esc(text) + '</span>'; }
  function stockBadge(s) {
    if (s === 'out') return badge('out', 'Tugagan');
    if (s === 'low') return badge('low', 'Kam qoldi');
    return badge('ok', 'Yetarli');
  }
  function revBtn(kind, id) { return '<button type="button" class="v11-btn sm danger" data-act="rev" data-kind="' + kind + '" data-id="' + esc(id) + '">Bekor qilish</button>'; }

  /* ---------- shablonlar (bo‘limlar) ---------- */
  function kpi(cls, label, value, sub, goto) {
    return '<div class="v11-card v11-kpi ' + cls + '"' + (goto ? ' data-nav="' + goto + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="k-l"><span class="k-dot"></span>' + esc(label) + '</div><div class="k-v">' + value + '</div>' + (sub || '') + '</div>';
  }
  function periodBar(withGroup) {
    var p = V.period;
    var chips = PERIODS.map(function (x) { return '<button type="button" class="v11-chip" aria-pressed="' + (p.preset === x[0]) + '" data-period="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    var g = withGroup ? '<label class="v11-lb" style="min-width:150px">Guruhlash<select class="v11-in" data-group>' +
      [['', 'Avtomatik'], ['day', 'Kunlik'], ['week', 'Haftalik'], ['month', 'Oylik']].map(function (x) { return '<option value="' + x[0] + '"' + (p.group === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' : '';
    var custom = p.preset === 'custom' ? '<form class="v11-row" data-form="period" style="margin-top:8px">' +
      '<label class="v11-lb">Boshlanish<input class="v11-in" type="date" name="from" value="' + esc(p.from) + '" required></label>' +
      '<label class="v11-lb">Tugash<input class="v11-in" type="date" name="to" value="' + esc(p.to) + '" required></label>' +
      '<button class="v11-btn primary" type="submit">Qo‘llash</button></form>' : '';
    return '<div class="v11-toolbar" style="align-items:flex-end"><div class="v11-chips">' + chips + '</div><div class="v11-sp"></div>' + g + '</div>' + custom;
  }
  function activationCard() {
    if (!V.me || V.me.activated || !can('fin_reports')) return '';
    return '<div class="v11-banner info"><div style="flex:1"><b>Moliya hisobini faollashtiring</b>' +
      '<div class="v11-muted">Faollashtirish kunidan boshlab sotuv, to‘lov, xarid, xarajat va kassa yozuvlari hisobga olinadi. Oldingi qarzlar boshlang‘ich holat sifatida qoladi va foydaga kirmaydi.</div></div>' +
      '<button type="button" class="v11-btn primary" data-act="activate">Faollashtirish</button></div>';
  }
  function offlineCard() {
    var demo = !!(X.demo && X.demo());
    return '<div class="v11-empty" style="margin-top:40px"><div class="e-ico">' + svg(I.lock) + '</div>' +
      (demo ? '<h4>Demo rejimda ombor va moliya ishlamaydi</h4><p>Ombor va moliya ma’lumotlari bulut serverida saqlanadi. Hisobingizga kirib, shu bo‘limlardan foydalaning.</p>' +
              '<div class="v11-row" style="justify-content:center;margin-top:14px"><button type="button" class="v11-btn primary" data-act="demo-exit">Demodan chiqish</button></div>'
            : '<h4>Bulut serveriga ulanmagan</h4><p>Ombor va moliya bo‘limlari bulut serveri bilan ishlaydi. Ilovada bulutga ulanib, hisobga kirganingizdan keyin shu yerda ko‘rinadi.</p>') +
      '</div>';
  }
  function notAllowed() { return emptyBox('Bu bo‘lim sizga ochiq emas', 'Kerakli ruxsat egasi tomonidan berilishi kerak. Ruxsatlar “Sozlamalar”da boshqariladi.'); }

  /* 1. Boshqaruv paneli */
  function secDash() {
    var st = V.state, sm = V.sum, out = '';
    var rej = rejList();
    if (!can('fin_reports')) {
      var pr = st ? st.products || [] : [];
      var low = pr.filter(function (p) { return p.status === 'low'; }), outs = pr.filter(function (p) { return p.status === 'out'; });
      var val = pr.reduce(function (a, p) { return a + (p.valueUzs || 0); }, 0);
      out += '<h1 class="v11-h1">Boshqaruv paneli</h1><p class="v11-sub">Ombor ko‘rsatkichlari. Moliyaviy ko‘rsatkichlar uchun egasi yoki menejer ruxsati kerak.</p>';
      out += '<div class="v11-grid">' + kpi('', 'Tovarlar', String(pr.length), 'faol tovar turlari', 'products') + kpi(low.length ? 'gold' : '', 'Kam qolgan', String(low.length), 'minimal qoldiqdan past', 'stock') +
        kpi(outs.length ? 'neg' : 'pos', 'Tugagan', String(outs.length), 'omborda qoldiq yo‘q', 'stock') + (st && st.canCost ? kpi('gold', 'Ombor qiymati', moneyUzs(val), 'joriy o‘rtacha tannarx', 'stock') : '') + '</div>';
      out += rejBlock(rej);
      return out;
    }
    var k = sm ? sm.pnl : null, pv = sm ? sm.prevPnl : null, cash = sm ? sm.cash : null;
    var pending = 0, pendingN = 0;
    if (cash) Object.keys(cash.byCurrency).forEach(function (c) { pendingN += cash.byCurrency[c].pendingCount || 0; });
    out += '<h1 class="v11-h1">Boshqaruv paneli</h1><p class="v11-sub">Tanlangan davr bo‘yicha asosiy ko‘rsatkichlar</p>';
    out += activationCard();
    if (sm && sm.reconcile && sm.reconcile.blockedSales) out += '<div class="v11-banner bad">' + svg(I.alert) + '<div><b>' + sm.reconcile.blockedSales + ' ta sotuv omborda yetarli bo‘lmagani uchun saqlanmagan</b><span class="v11-muted">Pastdagi “Saqlanmagan sotuvlar” ro‘yxatiga qarang.</span></div></div>';
    if (sm && sm.reconcile && sm.reconcile.negativeStock) out += '<div class="v11-banner">' + svg(I.alert) + '<div><b>' + sm.reconcile.negativeStock + ' ta tovarda manfiy qoldiq bor</b><span class="v11-muted">Ombor qoldig‘ini tekshirib, inventarizatsiya qiling.</span></div></div>';
    out += periodBar(true);
    if (k) {
      var cu = cash ? cash.uzs : null;
      out += '<div class="v11-grid">' +
        kpi('', 'Daromad (sotuv)', moneyUzs(k.revenue), deltaHtml(k.revenue, pv && pv.revenue), 'reports') +
        kpi(cu && cu.closing < 0 ? 'neg' : 'pos', 'Haqiqiy kassa (qoldiq)', moneyUzs(cu ? cu.closing : 0), '<span class="k-s">' + (pendingN ? pendingN + ' ta to‘lov tasdiq kutmoqda' : 'kutilayotgan to‘lov yo‘q') + '</span>', 'cash') +
        kpi(sm.debts && sm.debts.uzs > 0 ? 'gold' : '', 'Ochiq qarzlar', moneyUzs(sm.debts ? sm.debts.uzs : 0), '<span class="k-s">' + (sm.debts ? sm.debts.count : 0) + ' mijozda qarz bor</span>', '') +
        kpi('', 'Xarajatlar', moneyUzs(k.expenses), deltaHtml(k.expenses, pv && pv.expenses), 'expenses') +
        kpi('', 'Yalpi foyda', moneyUzs(k.grossProfit), '<span class="k-s">daromad − tannarx</span>', 'reports') +
        kpi(k.netProfit < 0 ? 'neg' : 'pos', 'Sof foyda', moneyUzs(k.netProfit), deltaHtml(k.netProfit, pv && pv.netProfit), 'reports') +
        (st && st.canCost && sm.stock ? kpi('gold', 'Ombor qiymati', moneyUzs(sm.stock.valueUzs), '<span class="k-s">joriy kurs bo‘yicha</span>', 'stock') : '') +
        kpi(sm.stock && sm.stock.out ? 'neg' : (sm.stock && sm.stock.low ? 'gold' : 'blue'), 'Kam qolgan tovarlar', String(sm.stock ? sm.stock.low : 0), '<span class="k-s">' + (sm.stock ? sm.stock.out : 0) + ' tasi tugagan</span>', 'stock') +
        '</div>';
    } else {
      out += emptyBox('Moliya hisobi hali faollashtirilmagan', 'Faollashtirgandan keyin daromad, kassa va foyda shu yerda ko‘rinadi.');
    }
    out += '<div class="v11-sec">Grafik</div>';
    out += '<div class="v11-grid-2"><div class="v11-card"><h3>Daromad va sof foyda</h3><p class="v11-sub">Tanlangan davr bo‘yicha kunlik daromad va sof foyda</p>' +
      (sm ? seriesChart(sm.series) : emptyBox('Ma’lumot yo‘q', '')) + '</div>' +
      '<div class="v11-card"><h3>Eng ko‘p foyda keltirgan tovarlar</h3><p class="v11-sub">Sotuv daromadi − tannarx</p>' + hbars(sm ? sm.topProducts.slice(0, 6) : [], { val: 'profit', label: 'name', tone: 'gold' }) + '</div></div>';
    out += '<div class="v11-sec">Ogohlantirishlar</div><div class="v11-grid-2">' + lowList(st) + overdueList(sm) + '</div>';
    out += rejBlock(rej);
    return out;
  }
  function lowList(st) {
    var rows = st ? (st.products || []).filter(function (p) { return p.status === 'low' || p.status === 'out'; }) : [];
    var body = rows.length ? rows.slice(0, 8).map(function (p) {
      return '<div class="v11-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span><b>' + esc(p.name) + '</b> <span class="v11-muted">' + esc(qtyFmt(p.qtyMilli)) + ' / min ' + esc(qtyFmt(p.minMilli)) + '</span></span>' + stockBadge(p.status) + '</div>';
    }).join('') : '<div class="v11-muted">Hammasi yetarli</div>';
    return '<div class="v11-card"><h3>Kam qolgan tovarlar</h3>' + body + (rows.length > 8 ? '<div class="v11-muted" style="margin-top:8px">va yana ' + (rows.length - 8) + ' ta</div>' : '') + '</div>';
  }
  function overdueList(sm) {
    var rows = sm && sm.debts ? sm.debts.overdue || [] : [];
    var body = rows.length ? rows.slice(0, 8).map(function (d) {
      return '<div class="v11-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span><b>' + esc(d.name) + '</b> <span class="v11-muted">muddati: ' + esc(d.dueDate) + '</span></span><span class="v11-neg" style="font-weight:700">' + esc(money(d.balanceMinor, d.cur)) + '</span></div>';
    }).join('') : '<div class="v11-muted">Muddati o‘tgan qarz yo‘q</div>';
    return '<div class="v11-card"><h3>Muddati o‘tgan qarzlar</h3>' + body + '</div>';
  }
  function rejBlock(rej) {
    if (!rej.length) return '';
    var rows = rej.slice().reverse().map(function (x) {
      var items = (x.tx && x.tx.items || []).map(function (i) { return esc(i.name) + ' × ' + esc(qtyFmt((i.qty || 1) * 1000)); }).join(', ');
      var short = (x.lines || []).map(function (l) { return esc(l.name) + ': kerak ' + esc(qtyFmt(l.need)) + ', omborda ' + esc(qtyFmt(l.have)); }).join('; ');
      var neg = can('inv_override') || V.role === 'owner';
      return '<div class="v11-card" style="margin-bottom:10px"><div class="v11-row" style="justify-content:space-between"><b>' + esc(x.clientName) + '</b><span class="v11-muted">' + esc(new Date(x.at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })) + '</span></div>' +
        '<div style="margin:6px 0">' + items + '</div><div class="v11-neg" style="font-size:12.5px">' + short + '</div>' +
        '<div class="v11-row" style="margin-top:10px"><button type="button" class="v11-btn sm" data-act="rej-restore" data-id="' + esc(x.id) + '">Qayta kiritish</button>' +
        (neg ? '<button type="button" class="v11-btn sm gold" data-act="rej-restore-neg" data-id="' + esc(x.id) + '">Manfiy qoldiqqa ruxsat bilan</button>' : '') +
        '<button type="button" class="v11-btn sm danger" data-act="rej-discard" data-id="' + esc(x.id) + '">O‘chirish</button></div></div>';
    }).join('');
    return '<div class="v11-sec">Saqlanmagan sotuvlar</div><p class="v11-sub">Bu sotuvlar omborda yetarli tovar bo‘lmagani uchun serverga yuborilmadi. Ular faqat shu qurilmada turibdi.</p>' + rows;
  }

  /* 2. Ombor */
  function secStock() {
    var st = V.state;
    if (!st) return emptyBox('Yuklanmoqda…', '');
    var f = V.filters.stock, all = st.products || [];
    var cats = (st.productCats || []);
    var list = all.filter(function (p) {
      if (p.archived) return false;
      if (f.st !== 'all' && p.status !== f.st) return false;
      if (f.cat && p.category !== f.cat) return false;
      var q = f.q.trim().toLowerCase();
      return !q || [p.name, p.sku, p.barcode, p.category].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var val = all.reduce(function (a, p) { return a + (p.valueUzs || 0); }, 0);
    var h = '<h1 class="v11-h1">Ombor</h1><p class="v11-sub">Qoldiq, holat va tez amallar</p>';
    h += '<div class="v11-grid">' + kpi('', 'Tovar turlari', String(all.filter(function (p) { return !p.archived; }).length), 'faol', 'products') +
      kpi(st.low ? 'gold' : 'pos', 'Kam qolgan', String(st.low || 0), 'minimaldan past', '') +
      kpi(st.out ? 'neg' : 'pos', 'Tugagan', String(st.out || 0), 'qoldiq 0 yoki manfiy', '') +
      (st.canCost ? kpi('gold', 'Ombor qiymati', moneyUzs(val), 'joriy o‘rtacha tannarx', '') : '') + '</div>';
    h += '<div class="v11-sec">Qoldiqlar</div>';
    h += '<div class="v11-toolbar"><input class="v11-in" data-filter="stock-q" placeholder="Qidirish: nom, artikul, shtrix-kod" value="' + esc(f.q) + '" aria-label="Qidirish">' +
      '<div class="v11-chips">' + [['all', 'Hammasi'], ['ok', 'Yetarli'], ['low', 'Kam'], ['out', 'Tugagan']].map(function (x) { return '<button type="button" class="v11-chip" aria-pressed="' + (f.st === x[0]) + '" data-filter-st="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<select class="v11-in" data-filter="stock-cat" style="max-width:200px" aria-label="Kategoriya"><option value="">Barcha kategoriyalar</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (f.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<div class="v11-sp"></div>' + (can('inv_move') ? '<button type="button" class="v11-btn primary sm" data-nav="purchase">+ Kirim</button>' : '') + (can('inv_move') || can('inv_adjust') ? '<button type="button" class="v11-btn sm" data-nav="moves">Chiqim / tuzatish</button>' : '') + '</div>';
    if (!all.length) return h + emptyBox('Tovarlar hali yo‘q', can('inv_edit') ? '“Tovarlar” bo‘limida birinchi tovaringizni qo‘shing yoki Excel fayldan yuklang.' : 'Egasi yoki menejer tovarlarni qo‘shadi.');
    h += '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Tovar</th><th>Kategoriya</th><th class="n">Qoldiq</th><th class="n">Minimal</th><th>Holat</th>' + (st.canCost ? '<th class="n">Qiymat</th>' : '') + '<th></th></tr></thead><tbody>' +
      (list.length ? list.map(function (p) {
        return '<tr><td><b>' + esc(p.name) + '</b>' + (p.sku ? '<div class="v11-muted" style="font-size:12px">' + esc(p.sku) + '</div>' : '') + '</td><td>' + esc(p.category || '—') + '</td>' +
          '<td class="n ' + (p.qtyMilli < 0 ? 'v11-neg' : '') + '">' + esc(qtyFmt(p.qtyMilli)) + ' ' + '</td><td class="n">' + esc(qtyFmt(p.minMilli)) + '</td><td>' + stockBadge(p.status) + '</td>' +
          (st.canCost ? '<td class="n">' + esc(p.valueUzs == null ? '—' : moneyUzs(p.valueUzs)) + '</td>' : '') +
          '<td class="n">' + (can('inv_move') ? '<button type="button" class="v11-btn sm" data-nav="purchase">Kirim</button> ' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="v11-muted">Filtrga mos tovar yo‘q</td></tr>') +
      '</tbody></table></div></div>';
    return h;
  }

  /* 3. Tovarlar */
  function secProducts() {
    var st = V.state;
    if (!st) return emptyBox('Yuklanmoqda…', '');
    var f = V.filters.products, q = f.q.trim().toLowerCase();
    var list = (st.products || []).filter(function (p) { return !q || [p.name, p.sku, p.barcode, p.category, p.supplier].join(' ').toLowerCase().indexOf(q) >= 0; });
    var edit = can('inv_edit');
    var h = '<h1 class="v11-h1">Tovarlar</h1><p class="v11-sub">Tovar kartochkalari, kategoriyalar va Excel orqali yuklash</p>';
    h += '<div class="v11-toolbar"><input class="v11-in" data-filter="prod-q" placeholder="Qidirish" value="' + esc(f.q) + '" aria-label="Tovarlarni qidirish"><div class="v11-sp"></div>' +
      (edit ? '<button type="button" class="v11-btn primary" data-act="prod-new">+ Tovar qo‘shish</button><label class="v11-btn" style="cursor:pointer">Excel yuklash<input type="file" accept=".xlsx" data-act="import-file" hidden></label><button type="button" class="v11-btn" data-act="export" data-sheet="products">Excel yuklab olish</button>' : '') + '</div>';
    if (!(st.products || []).length) h += emptyBox('Tovarlar hali yo‘q', edit ? 'Birinchi tovarni qo‘shing yoki Excel fayl yuklang.' : 'Egasi yoki menejer tovarlarni qo‘shadi.');
    else {
      h += '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Nomi</th><th>Artikul</th><th>Kategoriya</th><th>Valyuta</th>' +
        (st.canCost ? '<th class="n">Kirish</th>' : '') + '<th class="n">Sotish</th><th class="n">Qoldiq</th><th>Holat</th>' + (edit ? '<th></th>' : '') + '</tr></thead><tbody>' +
        list.map(function (p) {
          var sc = scale(p.cur);
          return '<tr style="' + (p.archived ? 'opacity:.55' : '') + '"><td><b>' + esc(p.name) + '</b>' + (p.archived ? ' ' + badge('rev', 'arxiv') : '') + '</td><td>' + esc(p.sku || '—') + '</td><td>' + esc(p.category || '—') + '</td><td>' + esc(p.cur) + '</td>' +
            (st.canCost ? '<td class="n">' + esc(fmt(p.buyMinor / sc, sc > 1 ? 2 : 0)) + '</td>' : '') +
            '<td class="n">' + esc(fmt(p.sellMinor / sc, sc > 1 ? 2 : 0)) + '</td><td class="n">' + esc(qtyFmt(p.qtyMilli)) + '</td><td>' + stockBadge(p.status) + '</td>' +
            (edit ? '<td class="n"><button type="button" class="v11-btn sm" data-act="prod-edit" data-id="' + esc(p.id) + '">Tahrir</button> <button type="button" class="v11-btn sm" data-act="prod-archive" data-id="' + esc(p.id) + '" data-arch="' + (p.archived ? '0' : '1') + '">' + (p.archived ? 'Tiklash' : 'Arxiv') + '</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    if (edit) {
      h += '<div class="v11-sec">Kategoriyalar</div><div class="v11-grid-2"><div class="v11-card"><h3>Tovar kategoriyalari</h3>' +
        (st.productCats && st.productCats.length ? '<div class="v11-chips">' + st.productCats.map(function (c) {
          return '<span class="v11-chip" style="cursor:default">' + esc(c) + ' <button type="button" class="v11-btn sm danger" style="padding:2px 8px;margin-left:4px" data-act="cat-del" data-kind="product" data-name="' + esc(c) + '" aria-label="' + esc(c) + ' ni o‘chirish">✕</button></span>';
        }).join('') + '</div>' : '<div class="v11-muted">Hali kategoriya yo‘q</div>') +
        '<form class="v11-row" data-form="cat" data-kind="product" style="margin-top:12px"><input class="v11-in" name="name" placeholder="Yangi kategoriya" maxlength="40" required><button class="v11-btn primary" type="submit">Qo‘shish</button></form><div class="v11-msg-err"></div></div>' +
        '<div class="v11-card"><h3>Excel orqali yuklash</h3><p class="v11-sub">Birinchi qatorda sarlavha: <b>Nomi</b>, <b>Artikul</b>, <b>Shtrix-kod</b>, <b>Kategoriya</b>, <b>Kirish narxi</b>, <b>Sotish narxi</b>, <b>Valyuta</b>, <b>Miqdor</b>, <b>Minimal qoldiq</b>, <b>Yetkazib beruvchi</b>. Artikul bo‘yicha mavjud tovar yangilanadi.</p>' +
        '<div class="v11-row"><label class="v11-btn primary" style="cursor:pointer">Faylni tanlash (.xlsx)<input type="file" accept=".xlsx" data-act="import-file" hidden></label><button type="button" class="v11-btn" data-act="export" data-sheet="products">Shablon sifatida yuklab olish</button></div></div></div>';
    }
    return h;
  }

  /* 4. Tovar kirimi */
  function secPurchase() {
    var st = V.state;
    if (!st) return emptyBox('Yuklanmoqda…', '');
    var prods = (st.products || []).filter(function (p) { return !p.archived; });
    var cur = (V.purchCur || 'UZS');
    var curs = (V.me && V.me.currencies) || ['UZS', 'USD'];
    var h = '<h1 class="v11-h1">Tovar kirimi</h1><p class="v11-sub">Yetkazib beruvchidan kelgan tovarlar. Kirim — aktiv, xarajat emas; sotilganda tannarx sifatida foydaga o‘tadi.</p>';
    if (!prods.length) return h + emptyBox('Avval tovar qo‘shing', '“Tovarlar” bo‘limida tovar yarating, so‘ngra kirim qiling.');
    var curProds = prods.filter(function (p) { return p.cur === cur; });
    if (!V.purchRows || !V.purchRows.length) V.purchRows = [{ pid: '', qty: '', price: '' }];
    var lineHtml = V.purchRows.map(function (r, i) {
      return '<div class="v11-form pl-line" data-line style="grid-template-columns:minmax(0,2fr) minmax(90px,1fr) minmax(110px,1fr) auto;margin-bottom:8px">' +
        '<label class="v11-lb">Tovar<select class="v11-in" name="pid">' + (curProds.length ? '<option value="">— tanlang —</option>' + curProds.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === r.pid ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') : '<option value="">Bu valyutada tovar yo‘q</option>') + '</select></label>' +
        '<label class="v11-lb">Miqdor<input class="v11-in" name="qty" inputmode="decimal" placeholder="0" value="' + esc(r.qty) + '"></label>' +
        '<label class="v11-lb">Bir birlik narxi<input class="v11-in" name="price" inputmode="decimal" placeholder="0" value="' + esc(r.price) + '"></label>' +
        '<button type="button" class="v11-btn sm danger" data-act="pl-del" data-idx="' + i + '" aria-label="Qatorni o‘chirish" style="margin-bottom:2px">✕</button></div>';
    }).join('');
    h += '<div class="v11-card"><form data-form="purchase">' +
      '<div class="v11-form" style="margin-bottom:12px">' +
      '<label class="v11-lb">Valyuta<select class="v11-in" name="cur" data-purch-cur>' + curs.map(function (c) { return '<option value="' + c + '"' + (c === cur ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label>' +
      '<label class="v11-lb">Yetkazib beruvchi<input class="v11-in" name="supplier" maxlength="120" placeholder="Masalan: Un zavodi"></label>' +
      '<label class="v11-lb">Sana<input class="v11-in" type="date" name="day" value="' + today() + '" max="' + today() + '"></label>' +
      '<label class="v11-lb">Izoh<input class="v11-in" name="note" maxlength="200"></label></div>' +
      '<div class="v11-sec" style="margin-top:6px">Tovarlar</div>' + lineHtml +
      '<div class="v11-row" style="margin-bottom:14px"><button type="button" class="v11-btn sm" data-act="pl-add">+ Yana tovar</button><div class="v11-sp"></div><div>Jami: <b id="v11PurchTot">0</b></div></div>' +
      '<div class="v11-form"><label class="v11-lb">To‘langan summa<input class="v11-in" name="paid" inputmode="decimal" placeholder="Bo‘sh qolsa — to‘liq"></label>' +
      '<label class="v11-lb">To‘lov usuli<select class="v11-in" name="method">' + METHODS.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></label>' +
      '<div class="full v11-msg-err"></div><button class="v11-btn primary" type="submit">Kirimni saqlash</button></div></form></div>';
    h += '<div class="v11-sec">So‘nggi kirimlar</div>' + purchaseList();
    return h;
  }
  function purchaseList() {
    var rows = (V.jr || []).filter(function (r) { return r.kind === 'entry' && r.type === 'purchase'; });
    if (!can('fin_reports')) return '<div class="v11-muted">Kirimlar ro‘yxati egasi yoki menejerga ko‘rinadi.</div>';
    if (!rows.length) return emptyBox('Kirimlar yo‘q', 'Tanlangan davrda kirim qilinmagan.');
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Sana</th><th>Yetkazib beruvchi</th><th class="n">Jami</th><th class="n">To‘langan</th><th>Holat</th><th></th></tr></thead><tbody>' +
      rows.slice(0, 50).map(function (r) {
        return '<tr><td>' + esc(r.day) + '</td><td>' + esc(r.supplier || '—') + '</td><td class="n">' + esc(money(r.amountMinor, r.cur)) + '</td><td class="n">' + esc(money(-(r.cashMinor || 0), r.cur)) + '</td><td>' +
          (r.reversedBy ? badge('rev', 'bekor qilingan') : badge('ok', 'faol')) + '</td><td class="n">' + (r.reversedBy || !can('inv_move') ? '' : revBtn('entry', r.id)) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* 5. Tovar chiqimi */
  function secMoves() {
    var st = V.state;
    if (!st) return emptyBox('Yuklanmoqda…', '');
    var prods = (st.products || []).filter(function (p) { return !p.archived; });
    var h = '<h1 class="v11-h1">Tovar chiqimi</h1><p class="v11-sub">Yaroqsiz yoki yo‘qolgan tovarlar, inventarizatsiya tuzatishlari. Har bir amal sabab bilan yoziladi.</p>';
    if (!prods.length) return h + emptyBox('Avval tovar qo‘shing', '');
    var opt = prods.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (' + esc(qtyFmt(p.qtyMilli)) + ')</option>'; }).join('');
    h += '<div class="v11-grid-2">' +
      '<div class="v11-card"><h3>Yaroqsiz yoki yo‘qolgan</h3><p class="v11-sub">Qoldiq kamayadi, yo‘qotish sifatida foydadan ayriladi</p>' +
      '<form class="v11-form" data-form="move" data-kind="writeoff"><label class="v11-lb full">Tovar<select class="v11-in" name="productId">' + opt + '</select></label>' +
      '<label class="v11-lb">Miqdor<input class="v11-in" name="qty" inputmode="decimal" required></label>' +
      '<label class="v11-lb">Sabab<input class="v11-in" name="reason" minlength="3" maxlength="200" placeholder="Masalan: namlikdan yaroqsiz" required></label>' +
      (V.role === 'owner' ? '<label class="v11-check full"><input type="checkbox" name="allowNegative"> Manfiy qoldiqqa ruxsat (faqat bir amal uchun)</label>' : '') +
      '<div class="full v11-msg-err"></div><button class="v11-btn danger full" type="submit" style="grid-column:1/-1">Chiqim qilish</button></form></div>' +
      '<div class="v11-card"><h3>Inventarizatsiya tuzatish</h3><p class="v11-sub">Haqiqiy sanalgan miqdorni kiriting; farq avtomatik yoziladi</p>' +
      '<form class="v11-form" data-form="move" data-kind="adjust"><label class="v11-lb full">Tovar<select class="v11-in" name="productId" data-adj-pick>' + opt + '</select></label>' +
      '<div class="full v11-muted" data-adj-hint>Hozirgi qoldiq: ' + esc(qtyFmt(prods[0].qtyMilli)) + '</div>' +
      '<label class="v11-lb">Haqiqiy miqdor<input class="v11-in" name="counted" inputmode="decimal" required></label>' +
      '<label class="v11-lb">Sabab<input class="v11-in" name="reason" minlength="3" maxlength="200" placeholder="Masalan: oylik inventarizatsiya" required></label>' +
      '<div class="full v11-msg-err"></div><button class="v11-btn primary" type="submit" style="grid-column:1/-1">Tuzatishni saqlash</button></form></div></div>';
    h += '<div class="v11-sec">So‘nggi harakatlar</div>' + movesList();
    return h;
  }
  function movesList() {
    if (!can('fin_reports')) return '<div class="v11-muted">Harakatlar ro‘yxati egasi yoki menejerga ko‘rinadi.</div>';
    var rows = (V.jr || []).filter(function (r) { return r.kind === 'move' && (r.type === 'writeoff' || r.type === 'adjust' || r.type === 'writeoff_rev' || r.type === 'adjust_rev'); });
    if (!rows.length) return emptyBox('Harakatlar yo‘q', 'Tanlangan davrda chiqim yoki tuzatish bo‘lmagan.');
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Sana</th><th>Tovar</th><th>Tur</th><th class="n">Miqdor</th><th class="n">Qiymat</th><th>Sabab</th><th>Kim</th><th></th></tr></thead><tbody>' +
      rows.slice(0, 80).map(function (r) {
        var isRev = r.type.indexOf('_rev') > 0;
        return '<tr><td>' + esc(r.day) + '</td><td>' + esc(r.product) + '</td><td>' + esc(TYPE_LBL[r.type] || r.type) + '</td><td class="n ' + (r.qtyMilli < 0 ? 'v11-neg' : 'v11-pos') + '">' + (r.qtyMilli > 0 ? '+' : '') + esc(qtyFmt(r.qtyMilli)) + '</td>' +
          '<td class="n">' + esc(money(Math.abs(r.costMinor || 0), r.cur)) + '</td><td class="wrap">' + esc(r.reason || '') + '</td><td>' + esc(r.by || '') + '</td><td class="n">' +
          (!isRev && !r.reversedBy && can('inv_adjust') || (!isRev && !r.reversedBy && can('inv_move') && r.type === 'writeoff') ? revBtn('move', r.id) : (r.reversedBy ? badge('rev', 'bekor qilingan') : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* 6. Kassa */
  function secCash() {
    if (!can('cash_view')) return notAllowed();
    var sm = V.sum, cs = V.state ? V.state.cashStart : null;
    var h = '<h1 class="v11-h1">Kassa</h1><p class="v11-sub">Haqiqiy pul: naqd va tasdiqlangan to‘lovlar. Qarzga sotuv kassaga kirmaydi.</p>';
    h += activationCard();
    if (!sm) return h + emptyBox('Moliya hisobi hali faollashtirilmagan', 'Faollashtirgandan keyin kassa shu yerda ko‘rinadi.');
    var cur = sm.cash.byCurrency;
    var curKeys = Object.keys(cur).length ? Object.keys(cur) : ['UZS'];
    h += '<div class="v11-grid">' + curKeys.map(function (c) {
      var v = cur[c] || { opening: 0, inflow: 0, outflow: 0, closing: 0, pending: 0, pendingCount: 0 };
      return kpi(v.closing < 0 ? 'neg' : 'pos', 'Kassa qoldig‘i · ' + c, money(v.closing, c), '<span class="k-s">kirim ' + esc(money(v.inflow, c)) + ' · chiqim ' + esc(money(-v.outflow, c)) + '</span>', '');
    }).join('') + kpi('gold', 'UZS ekvivalenti', moneyUzs(sm.cash.uzs.closing), sm.cash.missingRate ? '<span class="k-s v11-neg">' + sm.cash.missingRate + ' ta yozuvda kurs yo‘q</span>' : '<span class="k-s">yozuv kursi bo‘yicha</span>', '') + '</div>';
    h += '<div class="v11-sec">Boshlang‘ich qoldiq va tuzatish</div><div class="v11-grid-2"><div class="v11-card"><h3>Kassa boshlang‘ich qoldig‘i</h3>' +
      '<p class="v11-sub">' + (cs ? 'Hozircha: ' + esc(cs.day) + ' sanasidan, ' + esc(money(cs.amountMinor, cs.cur)) : 'Hali kiritilmagan') + '. Qiymat sanasi ertasi kunga o‘tishi uchun kun tanlang.</p>' +
      (can('cash_view') ? '<form class="v11-form" data-form="cash-start"><label class="v11-lb">Sana<input class="v11-in" type="date" name="day" value="' + (cs ? esc(cs.day) : today()) + '" max="' + today() + '" required></label>' +
        '<label class="v11-lb">Valyuta<select class="v11-in" name="cur">' + ((V.me && V.me.currencies) || ['UZS', 'USD']).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
        '<label class="v11-lb">Summa<input class="v11-in" name="amount" inputmode="decimal" required placeholder="0"></label>' +
        '<div class="full v11-msg-err"></div><button class="v11-btn" type="submit">Saqlash</button></form>' : '') + '</div>' +
      '<div class="v11-card"><h3>Haqiqiy qoldiqqa moslash</h3><p class="v11-sub">Kassada sanalgan pul bilan hisob farqi tuzatiladi. Sabab majburiy.</p>' +
      '<form class="v11-form" data-form="cash-adj"><label class="v11-lb">Valyuta<select class="v11-in" name="cur">' + ((V.me && V.me.currencies) || ['UZS', 'USD']).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
      '<label class="v11-lb">Sanalgan summa<input class="v11-in" name="counted" inputmode="decimal" required placeholder="Kassada haqiqatda"></label>' +
      '<label class="v11-lb full">Sabab<input class="v11-in" name="reason" minlength="3" maxlength="200" required placeholder="Masalan: inventarizatsiya"></label>' +
      '<div class="full v11-msg-err"></div><button class="v11-btn primary" type="submit" style="grid-column:1/-1">Tuzatishni saqlash</button></form></div></div>';
    h += '<div class="v11-sec">Usullar bo‘yicha</div><div class="v11-grid-2"><div class="v11-card"><h3>To‘lov usullari</h3>' +
      curKeys.map(function (c) {
        var bm = (cur[c] && cur[c].byMethod) || {};
        var items = Object.keys(bm).map(function (k) { return { name: METHOD_LBL[k] || k, value: bm[k] }; });
        return '<div class="v11-sub" style="margin:6px 0">' + esc(c) + '</div>' + hbars(items, { fmt: function (v) { return money(v, c); }, tone: 'gold' });
      }).join('') + '</div>' +
      '<div class="v11-card"><h3>Kutilayotgan to‘lovlar</h3><p class="v11-sub">Otkazma va boshqa usullar kassaga tasdiqlangandan keyin tushadi</p>' + pendingList() + '</div></div>';
    h += '<div class="v11-sec">Kassa jurnali</div>' + cashJournal();
    return h;
  }
  function pendingList() {
    var rows = (V.jr || []).filter(function (r) { return r.kind === 'entry' && r.type === 'payment' && r.status === 'pending' && !r.reversedBy; });
    if (!rows.length) return '<div class="v11-muted">Tasdiq kutayotgan to‘lov yo‘q</div>';
    return rows.map(function (r) {
      return '<div class="v11-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span><b>' + esc(r.refClient || 'Mijoz') + '</b> <span class="v11-muted">' + esc(r.day) + ' · ' + esc(METHOD_LBL[r.method] || r.method || '') + '</span></span>' +
        '<span class="v11-row"><b>' + esc(money(r.amountMinor, r.cur)) + '</b><button type="button" class="v11-btn sm primary" data-act="pay-confirm" data-id="' + esc(r.id) + '">Tasdiqlash</button></span></div>';
    }).join('');
  }
  function cashJournal() {
    if (!can('fin_reports')) return '';
    var rows = (V.jr || []).filter(function (r) { return r.kind === 'entry' && (r.cashMinor || r.type === 'cash_adjust' || r.type === 'reversal' || r.type === 'payment' || r.type === 'expense' || r.type === 'purchase'); });
    if (!rows.length) return emptyBox('Kassa harakati yo‘q', '');
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Sana</th><th>Tur</th><th>Usul</th><th>Holat</th><th class="n">Kassa ta’siri</th><th>Kim</th><th></th></tr></thead><tbody>' +
      rows.slice(0, 120).map(function (r) {
        var canRev = !r.reversedBy && (r.type === 'cash_adjust' || r.type === 'expense' || r.type === 'purchase') && (r.type === 'expense' ? can('expense') : r.type === 'purchase' ? can('inv_move') : true);
        return '<tr><td>' + esc(r.day) + '</td><td>' + esc(TYPE_LBL[r.type] || (r.type === 'payment' ? 'To‘lov' : r.type)) + (r.reversedKind ? ' <span class="v11-muted">(bekor)</span>' : '') + '</td><td>' + esc(METHOD_LBL[r.method] || r.method || '—') + '</td><td>' +
          (r.status === 'pending' ? badge('pend', 'kutilmoqda') : r.reversedBy ? badge('rev', 'bekor qilingan') : badge('ok', 'tasdiqlangan')) + '</td><td class="n ' + (r.cashMinor < 0 ? 'v11-neg' : (r.cashMinor > 0 ? 'v11-pos' : '')) + '">' + (r.cashMinor ? esc(money(r.cashMinor, r.cur)) : '—') + '</td><td>' + esc(r.by || '') + '</td><td class="n">' + (canRev ? revBtn('entry', r.id) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* 7. Daromad va xarajatlar */
  function secExpenses() {
    if (!can('fin_reports')) return notAllowed();
    var sm = V.sum, cats = (V.me && V.me.expenseCats) || [];
    var h = '<h1 class="v11-h1">Daromad va xarajatlar</h1><p class="v11-sub">Daromad, xarajat turlari va foyda tahlili</p>' + activationCard();
    if (!sm) return h + emptyBox('Moliya hisobi hali faollashtirilmagan', '');
    h += periodBar(false);
    var k = sm.pnl, pv = sm.prevPnl;
    h += '<div class="v11-grid">' + kpi('', 'Daromad', moneyUzs(k.revenue), deltaHtml(k.revenue, pv.revenue), 'reports') + kpi('', 'Xarajatlar', moneyUzs(k.expenses), deltaHtml(k.expenses, pv.expenses), '') +
      kpi(k.netProfit < 0 ? 'neg' : 'pos', 'Sof foyda', moneyUzs(k.netProfit), deltaHtml(k.netProfit, pv.netProfit), '') + kpi(k.losses > 0 ? 'gold' : 'blue', 'Yo‘qotish va tuzatish', moneyUzs(k.losses), '<span class="k-s">yaroqsiz va inventarizatsiya</span>', '') + '</div>';
    var catRows = {};
    (V.jr || []).forEach(function (r) {
      if (r.kind !== 'entry' || r.type !== 'expense' || r.reversedBy) return;
      var c = r.category || 'Boshqa'; catRows[c] = (catRows[c] || 0) + (r.uzsMinor || 0);
    });
    var catItems = Object.keys(catRows).map(function (c) { return { name: c, value: catRows[c] }; }).sort(function (a, b) { return b.value - a.value; });
    h += '<div class="v11-sec">Xarajatlar</div><div class="v11-grid-2"><div class="v11-card"><h3>Xarajat turlari bo‘yicha</h3>' + hbars(catItems, { tone: 'gold' }) + '</div>' +
      '<div class="v11-card"><h3>Yangi xarajat</h3>' +
      (can('expense') ? '<form class="v11-form" data-form="expense"><label class="v11-lb">Turi<select class="v11-in" name="category">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label class="v11-lb">Summa<input class="v11-in" name="amount" inputmode="decimal" required placeholder="0"></label>' +
        '<label class="v11-lb">Valyuta<select class="v11-in" name="cur">' + ((V.me && V.me.currencies) || ['UZS']).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
        '<label class="v11-lb">To‘lov usuli<select class="v11-in" name="method">' + METHODS.map(function (m) { return '<option value="' + m[0] + '">' + m[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="v11-lb">Sana<input class="v11-in" type="date" name="day" value="' + today() + '" max="' + today() + '"></label>' +
        '<label class="v11-lb">Izoh<input class="v11-in" name="note" maxlength="200"></label>' +
        '<div class="full v11-msg-err"></div><button class="v11-btn primary full" type="submit" style="grid-column:1/-1">Xarajatni saqlash</button></form>' : '<div class="v11-muted">Xarajat kiritish ruxsati yo‘q</div>') + '</div></div>';
    h += '<div class="v11-sec">Xarajat turlari</div><div class="v11-card">' + (cats.length ? '<div class="v11-chips" style="margin-bottom:12px">' + cats.map(function (c) {
      return '<span class="v11-chip" style="cursor:default">' + esc(c) + (can('expense') ? ' <button type="button" class="v11-btn sm danger" style="padding:2px 8px;margin-left:4px" data-act="cat-del" data-kind="expense" data-name="' + esc(c) + '" aria-label="' + esc(c) + ' ni o‘chirish">✕</button>' : '') + '</span>';
    }).join('') + '</div>' : '') +
      (can('expense') ? '<form class="v11-row" data-form="cat" data-kind="expense"><input class="v11-in" name="name" placeholder="Yangi xarajat turi" maxlength="40" required style="max-width:280px"><button class="v11-btn" type="submit">Qo‘shish</button></form><div class="v11-msg-err"></div>' : '') + '</div>';
    h += '<div class="v11-sec">Davr bo‘yicha taqqoslash</div>' + plTable(sm);
    h += '<div class="v11-sec">So‘nggi xarajatlar</div>' + expenseList();
    return h;
  }
  function plTable(sm) {
    var k = sm.pnl, p = sm.prevPnl;
    var rows = [['Daromad (sotuv)', k.revenue, p.revenue], ['Tannarx (COGS)', k.cogs, p.cogs], ['Yalpi foyda', k.grossProfit, p.grossProfit], ['Yo‘qotish va tuzatish', k.losses, p.losses], ['Xarajatlar', k.expenses, p.expenses], ['Sof foyda', k.netProfit, p.netProfit]];
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Ko‘rsatkich</th><th class="n">Joriy davr</th><th class="n">Oldingi davr</th><th class="n">O‘zgarish</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var pc = pct(r[1], r[2]);
        return '<tr><td>' + esc(r[0]) + '</td><td class="n"><b>' + esc(moneyUzs(r[1])) + '</b></td><td class="n">' + esc(moneyUzs(r[2])) + '</td><td class="n ' + (pc === null ? 'v11-muted' : pc >= 0 ? 'v11-pos' : 'v11-neg') + '">' + (pc === null ? '—' : (pc >= 0 ? '+' : '') + pc + '%') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="v11-sub" style="margin:10px 0 0">Sof foyda = daromad − tannarx − yo‘qotish − xarajatlar. Xarid kirimi foydaga ta’sir qilmaydi.</p></div>';
  }
  function expenseList() {
    var rows = (V.jr || []).filter(function (r) { return r.kind === 'entry' && (r.type === 'expense' || r.reversedKind === 'expense'); });
    if (!rows.length) return emptyBox('Xarajat yo‘q', 'Tanlangan davrda xarajat kiritilmagan.');
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Sana</th><th>Turi</th><th class="n">Summa</th><th>Usul</th><th>Kim</th><th>Holat</th><th></th></tr></thead><tbody>' +
      rows.slice(0, 100).map(function (r) {
        var isRev = r.type === 'reversal';
        return '<tr><td>' + esc(r.day) + '</td><td>' + esc(r.category || '—') + (isRev ? ' <span class="v11-muted">(bekor)</span>' : '') + '</td><td class="n">' + esc(money(r.amountMinor, r.cur)) + '</td><td>' + esc(METHOD_LBL[r.method] || r.method || '—') + '</td><td>' + esc(r.by || '') + '</td><td>' +
          (r.reversedBy ? badge('rev', 'bekor qilingan') : isRev ? badge('rev', 'bekor') : badge('ok', 'faol')) + '</td><td class="n">' + (!isRev && !r.reversedBy && can('expense') ? revBtn('entry', r.id) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  /* 8. Moliyaviy hisobotlar */
  function secReports() {
    if (!can('fin_reports')) return notAllowed();
    var sm = V.sum;
    var h = '<h1 class="v11-h1">Moliyaviy hisobotlar</h1><p class="v11-sub">P&amp;L, davrlar kesimida, xodimlar bo‘yicha, jurnal va eksport</p>' + activationCard();
    if (!sm) return h + emptyBox('Moliya hisobi hali faollashtirilmagan', '');
    h += periodBar(true);
    h += '<div class="v11-toolbar"><button type="button" class="v11-btn primary" data-act="export" data-sheet="report">Excel: hisobot</button>' +
      '<button type="button" class="v11-btn" data-act="export" data-sheet="journal">Excel: jurnal</button>' +
      (can('inv_edit') ? '<button type="button" class="v11-btn" data-act="export" data-sheet="products">Excel: tovarlar</button>' : '') +
      '<button type="button" class="v11-btn gold" data-act="pdf">PDF (chop etish)</button><div class="v11-sp"></div><span class="v11-muted" style="font-size:12px">Oxirgi yangilanish: ' + esc(V.state && V.state.lastSync ? new Date(V.state.lastSync).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : '—') + '</span></div>';
    h += '<div class="v11-grid-2"><div class="v11-card"><h3>Daromad va sof foyda</h3>' + seriesChart(sm.series) + '</div>' +
      '<div class="v11-card"><h3>Foyda va xarajat (joriy davr)</h3>' + plTable(sm) + '</div></div>';
    h += '<div class="v11-sec">Davrlar</div><div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Davr</th><th class="n">Daromad</th><th class="n">Tannarx</th><th class="n">Yalpi foyda</th><th class="n">Xarajat</th><th class="n">Sof foyda</th><th class="n">Kassa kirimi</th><th class="n">Kassa chiqimi</th></tr></thead><tbody>' +
      (sm.series.length ? sm.series.map(function (r) { return '<tr><td>' + esc(keyLabel(r.key)) + '</td><td class="n">' + esc(moneyUzs(r.revenue)) + '</td><td class="n">' + esc(moneyUzs(r.cogs)) + '</td><td class="n">' + esc(moneyUzs(r.grossProfit)) + '</td><td class="n">' + esc(moneyUzs(r.expenses)) + '</td><td class="n ' + (r.netProfit < 0 ? 'v11-neg' : '') + '">' + esc(moneyUzs(r.netProfit)) + '</td><td class="n">' + esc(moneyUzs(r.cashIn)) + '</td><td class="n">' + esc(moneyUzs(r.cashOut)) + '</td></tr>'; }).join('') : '<tr><td colspan="8" class="v11-muted">Ma’lumot yo‘q</td></tr>') +
      '</tbody></table></div></div>';
    h += '<div class="v11-sec">Tahlil</div><div class="v11-grid-2"><div class="v11-card"><h3>Eng yaxshi tovarlar</h3>' + hbars(sm.topProducts.slice(0, 10), { val: 'profit', label: 'name', tone: 'gold' }) + '</div>' +
      '<div class="v11-card"><h3>Qarzlar</h3><p class="v11-sub">Qarz daftaridan olingan (joriy kurs bo‘yicha)</p>' +
      '<div class="v11-grid" style="grid-template-columns:1fr 1fr"><div><div class="v11-muted">Ochiq qarz</div><b>' + esc(moneyUzs(sm.debts.uzs)) + '</b></div><div><div class="v11-muted">Mijozlar</div><b>' + esc(sm.debts.count) + '</b></div></div>' +
      (sm.debts.uzsMissing ? '<p class="v11-neg" style="margin-top:8px">' + sm.debts.uzsMissing + ' ta qarz uchun kurs yo‘q</p>' : '') +
      '<div style="margin-top:12px">' + (sm.debts.list.filter(function (d) { return d.balanceMinor > 0; }).slice(0, 6).map(function (d) { return '<div class="v11-row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(d.name) + '</span><b>' + esc(money(d.balanceMinor, d.cur)) + '</b></div>'; }).join('') || '<div class="v11-muted">Ochiq qarz yo‘q</div>') + '</div></div></div>';
    if (sm.byEmployee) {
      h += '<div class="v11-sec">Xodimlar bo‘yicha</div><div class="v11-card"><p class="v11-sub">Har bir yozuv kim tomonidan kiritilgani serverda qayd etiladi (deploydan keyingi yozuvlar)</p><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Xodim</th><th class="n">Sotuvlar</th><th class="n">Daromad</th><th class="n">Kassaga yig‘ilgan</th></tr></thead><tbody>' +
        (sm.byEmployee.length ? sm.byEmployee.map(function (e) { return '<tr><td>' + esc(e.by) + '</td><td class="n">' + esc(e.sales) + '</td><td class="n">' + esc(moneyUzs(e.revenue)) + '</td><td class="n">' + esc(moneyUzs(e.cashIn)) + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="v11-muted">Ma’lumot yo‘q</td></tr>') + '</tbody></table></div></div>';
    }
    if (sm.reconcile) {
      var rc = sm.reconcile;
      h += '<div class="v11-sec">Tekshiruv</div><div class="v11-grid">' +
        kpi(rc.pendingPostings ? 'gold' : 'pos', 'Jurnalga kutilayotgan', rc.pendingPostings == null ? '—' : String(rc.pendingPostings), '<span class="k-s">qarz daftari va jurnal mos emasligi</span>', '') +
        kpi(rc.blockedSales ? 'neg' : 'pos', 'Bloklangan sotuvlar', String(rc.blockedSales || 0), '<span class="k-s">omborda yetmagan</span>', '') +
        kpi(rc.stockDrift ? 'neg' : 'pos', 'Tannarx farqi', String(rc.stockDrift || 0), '<span class="k-s">0 bo‘lishi kerak</span>', '') +
        kpi(rc.unknownMethods ? 'gold' : 'pos', 'Noma’lum to‘lov usuli', String(rc.unknownMethods || 0), '<span class="k-s">tasdiqlashni kuting</span>', '') + '</div>';
    }
    h += '<div class="v11-sec">Jurnal</div>' + journalTable();
    return h;
  }
  function journalTable() {
    var rows = V.jr || [];
    var more = V.jtotal > rows.length ? '<div class="v11-row" style="justify-content:center;margin-top:12px"><button type="button" class="v11-btn" data-act="jmore">Ko‘proq yuklash (' + (V.jtotal - rows.length) + ' ta qoldi)</button></div>' : '';
    if (!rows.length) return emptyBox('Jurnal bo‘sh', 'Tanlangan davrda yozuv yo‘q.');
    return '<div class="v11-card"><div class="v11-tw"><table class="v11-tbl"><thead><tr><th>Sana</th><th>Vaqt</th><th>Tur</th><th>Tovar / kategoriya</th><th class="n">Summa</th><th class="n">Kassa</th><th>Holat</th><th>Kim</th><th></th></tr></thead><tbody>' +
      rows.slice(0, V.jlimit).map(function (r) {
        var what = r.kind === 'move' ? esc(r.product) + ' · ' + esc(qtyFmt(r.qtyMilli)) : esc(r.category || r.supplier || r.refClient || '—');
        var amt = r.kind === 'move' ? money(Math.abs(r.costMinor || 0), r.cur) : money(r.amountMinor || 0, r.cur);
        var rev = '';
        if (!r.reversedBy && !(r.type === 'reversal' || (r.type && r.type.indexOf('_rev') > 0))) {
          if (r.kind === 'move' && (r.type === 'writeoff' || r.type === 'adjust') && can('inv_adjust')) rev = revBtn('move', r.id);
          else if (r.kind === 'entry' && (r.type === 'expense' ? can('expense') : r.type === 'purchase' ? can('inv_move') : r.type === 'cash_adjust' ? can('cash_view') : false)) rev = revBtn('entry', r.id);
        }
        var st = r.reversedBy ? badge('rev', 'bekor qilingan') : (r.status === 'pending' ? badge('pend', 'kutilmoqda') : (r.type === 'reversal' ? badge('rev', 'bekor') : badge('ok', 'faol')));
        return '<tr><td>' + esc(r.day) + '</td><td class="v11-muted">' + esc((r.at || '').slice(11, 16)) + '</td><td>' + esc(TYPE_LBL[r.type] || r.type) + '</td><td class="wrap">' + what + '</td><td class="n">' + esc(amt) + '</td><td class="n">' + (r.cashMinor ? esc(money(r.cashMinor, r.cur)) : '—') + '</td><td>' + st + '</td><td>' + esc(r.by || '') + '</td><td class="n">' + rev + '</td></tr>';
      }).join('') + '</tbody></table></div>' + more + '</div>';
  }

  /* 9. AI yordamchi */
  function secAi() {
    if (!can('ai')) return notAllowed();
    var h = '<h1 class="v11-h1">AI yordamchi</h1><p class="v11-sub">Ombor va moliya bo‘yicha savollarga o‘zbekcha javob. Faqat o‘qiydi — hech narsani o‘zgartirmaydi. Javoblar serverdagi haqiqiy ma’lumotdan hisoblanadi.</p>';
    h += '<div class="v11-grid-2"><div class="v11-card"><h3>Savol bering</h3>' +
      '<form data-form="ai" class="v11-form" style="grid-template-columns:1fr"><textarea class="v11-in" name="q" rows="2" maxlength="300" placeholder="Masalan: Bu oy sof foyda qancha?" aria-label="Savol"></textarea>' +
      '<div class="v11-row"><button class="v11-btn primary" type="submit"' + (V.ai.busy ? ' disabled' : '') + '>Yuborish</button><span class="v11-muted" style="font-size:12px">Yordamchi tashqi AI xizmatiga yuborilmaydi</span></div><div class="v11-msg-err"></div></form>' +
      '<div class="v11-sec" style="margin-top:14px">Misollar</div><div class="v11-chips">' +
      (V.ai.ex || []).map(function (e) { return '<button type="button" class="v11-chip" data-act="ai-ex" data-q="' + esc(e) + '">' + esc(e) + '</button>'; }).join('') + '</div></div>' +
      '<div class="v11-card"><h3>Suhbat</h3><div id="v11AiHist">' + aiHist() + '</div></div></div>';
    return h;
  }
  function aiHist() {
    if (!V.ai.hist.length) return '<div class="v11-muted">Hali savol berilmagan. Yuqoridagi misollardan birini bosing yoki o‘zingiz yozing.</div>';
    return V.ai.hist.slice().reverse().map(function (x) {
      var a = x.a;
      var body = a ? '<div style="font-weight:700;margin-bottom:6px">' + esc(a.title || '') + (a.estimate ? ' ' + badge('gold', 'taxminiy') : '') + '</div>' +
        '<div style="white-space:pre-line">' + esc(a.text || '') + '</div>' +
        (a.bullets && a.bullets.length ? '<ul style="margin:8px 0 0;padding-left:18px">' + a.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '') +
        (a.notes && a.notes.length ? '<div class="v11-muted" style="font-size:12px;margin-top:8px">' + a.notes.map(esc).join('<br>') + '</div>' : '')
        : '<div class="v11-neg">Javob olinmadi</div>';
      return '<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="v11-muted" style="font-size:12px">Savol: ' + esc(x.q) + '</div><div style="margin-top:6px">' + body + '</div></div>';
    }).join('');
  }

  /* ---------- ko‘rinish: nav, asosiy qism, boshqaruv ---------- */
  var SECTIONS = { dash: secDash, stock: secStock, products: secProducts, purchase: secPurchase, moves: secMoves, cash: secCash, expenses: secExpenses, reports: secReports, ai: secAi };
  function renderNav() {
    var nav = V.root.querySelector('#v11Nav');
    var rejN = rejList().length;
    nav.innerHTML = NAV.filter(canNav).map(function (it) {
      return '<button type="button" class="v11-nb" data-nav="' + it.id + '" aria-current="' + (V.section === it.id ? 'page' : 'false') + '" title="' + esc(it.t) + '">' + svg(I[it.ic]) +
        '<span class="t">' + esc(it.t) + '</span>' + (it.id === 'dash' && rejN ? '<span class="n-badge" aria-label="' + rejN + ' ta saqlanmagan">' + rejN + '</span>' : '') + '</button>';
    }).join('');
    if (!NAV.filter(canNav).some(function (x) { return x.id === V.section; }) && NAV.filter(canNav).length) V.section = NAV.filter(canNav)[0].id;
  }
  function render() {
    if (!V.root) return;
    V.tips = [];
    renderNav();
    var main = V.root.querySelector('#v11Main');
    if (offline()) { main.innerHTML = offlineCard(); return; }
    if (V.loading && !V.me) { main.innerHTML = '<div class="v11-skel" style="width:40%;height:22px"></div><div class="v11-skel" style="width:70%"></div><div class="v11-skel"></div><div class="v11-skel" style="width:85%"></div>'; return; }
    if (V.loadErr && !V.me) { main.innerHTML = emptyBox('Ulanib bo‘lmadi', V.loadErr) + '<div class="v11-row" style="justify-content:center"><button type="button" class="v11-btn primary" data-act="refresh">Qayta urinish</button></div>'; return; }
    if (!NAV.filter(canNav).length) { main.innerHTML = notAllowed(); return; }
    var fn = SECTIONS[V.section] || secDash;
    var html = fn();
    if (V.loadErr) html = '<div class="v11-banner bad">' + svg(I.alert) + '<div><b>Ma’lumot to‘liq yuklanmadi</b><span class="v11-muted">' + esc(V.loadErr) + '</span></div></div>' + html;
    main.innerHTML = html;
    main.scrollTop = 0;
  }

  /* ---------- tanlovlar: bo‘limga o‘tish, davr, amallar ---------- */
  async function setPeriod(preset) {
    V.period.preset = preset;
    if (preset !== 'custom') { V.period.from = ''; V.period.to = ''; }
    V.jlimit = 200;
    await loadAll();
  }
  function renderNavAndMain() { renderNav(); render(); }
  async function go(id) { V.section = id; V.loadErr = ''; renderNavAndMain(); if (V.me) await loadAll(); }

  async function doAction(act, t) {
    switch (act) {
      case 'close': close(); return;
      case 'demo-exit': {
        if (X.exitDemo) X.exitDemo();
        close();
        return;
      }
      case 'theme': V.theme = V.theme === 'dark' ? 'light' : 'dark'; V.root.setAttribute('data-theme', V.theme); try { localStorage.setItem('qarzim_v11_theme', V.theme); } catch (e) { /* */ } return;
      case 'refresh': await loadAll(); note('Yangilandi'); return;
      case 'activate': {
        var r = await api('POST', '/activate', { opId: opId('act') });
        if (r.ok) { note(r.data.already ? 'Hisob allaqachon faollashtirilgan' : 'Moliya hisobi faollashtirildi'); await loadAll(); } else note(errText(r), false);
        return;
      }
      case 'jmore': V.jlimit += 200; await loadAll(); return;
      case 'export': return exportSheet(t.dataset.sheet);
      case 'pdf': return printReport();
      case 'prod-new': return productModal(null);
      case 'prod-edit': return productModal((V.state.products || []).find(function (p) { return p.id === t.dataset.id; }) || null);
      case 'prod-archive': {
        var p = (V.state.products || []).find(function (x) { return x.id === t.dataset.id; });
        if (!p) return;
        // server qisman yangilashni qo‘llaydi: faqat id va archived yuboriladi, qolgan maydonlar saqlanadi
        var body = { opId: opId('arc'), id: p.id, archived: t.dataset.arch === '1' };
        var rr = await api('POST', '/product', body);
        if (rr.ok) { note(body.archived ? 'Arxivga olindi' : 'Tiklandi'); await loadAll(); } else note(errText(rr), false);
        return;
      }
      case 'cat-del': {
        var rc = await api('POST', '/category/delete', { opId: opId('cdl'), kind: t.dataset.kind, name: t.dataset.name });
        if (rc.ok) { note('O‘chirildi'); await loadAll(); } else note(errText(rc), false);
        return;
      }
      case 'pl-add': captureLines(); if (V.purchRows.length < 30) V.purchRows.push({ pid: '', qty: '', price: '' }); render(); return;
      case 'pl-del': {
        captureLines();
        if (V.purchRows.length > 1) { V.purchRows.splice(+t.dataset.idx, 1); render(); }
        return;
      }
      case 'rev': return reverseFlow(t.dataset.kind, t.dataset.id);
      case 'pay-confirm': {
        var pc = await api('POST', '/payment/confirm', { opId: opId('pcf'), entryId: t.dataset.id });
        if (pc.ok) { note('To‘lov tasdiqlandi'); await loadAll(); } else note(errText(pc), false);
        return;
      }
      case 'rej-restore': case 'rej-restore-neg': {
        if (!X.rej) return;
        var okR = X.rej.restore(t.dataset.id, act === 'rej-restore-neg');
        if (okR) { note('Qayta yuborildi. Natija “Saqlanmagan sotuvlar”da ko‘rinadi.'); render(); } else note('Topilmadi', false);
        return;
      }
      case 'rej-discard': {
        if (!X.rej) return;
        if (window.confirm && !window.confirm('Bu saqlanmagan sotuv butunlay o‘chirilsinmi?')) return;
        X.rej.discard(t.dataset.id); note('O‘chirildi'); render(); return;
      }
      case 'ai-ex': { var ta = V.root.querySelector('#v11Main textarea[name=q]'); if (ta) { ta.value = t.dataset.q; ta.focus(); } return;
      }
      case 'import-file': return;
      default: return;
    }
  }

  // Kirim qatorlarining joriy qiymatlarini holatga olish (qator qo‘shilganda/o‘chirilganda yo‘qolmasin)
  function captureLines() {
    var rows = V.root.querySelectorAll('[data-line]');
    if (!rows.length) return;
    V.purchRows = Array.prototype.map.call(rows, function (r) {
      var v = function (n) { var el = r.querySelector('[name=' + n + ']'); return el ? el.value : ''; };
      return { pid: v('pid'), qty: v('qty'), price: v('price') };
    });
  }

  async function reverseFlow(kind, id) {
    var ttl = kind === 'move' ? 'Harakatni bekor qilish' : 'Yozuvni bekor qilish';
    openModal('<h3>' + esc(ttl) + '</h3><p class="v11-sub">Asl yozuv saqlanadi; uning o‘rniga teskari yozuv qo‘shiladi. Sabab majburiy.</p>' +
      '<label class="v11-lb">Sabab<textarea class="v11-in" name="reason" minlength="3" maxlength="200" required placeholder="Masalan: noto‘g‘ri kiritilgan"></textarea></label>' +
      '<div class="v11-msg-err"></div><div class="foot"><button type="button" class="v11-btn" data-act="modal-close">Bekor</button><button type="submit" class="v11-btn danger">Bekor qilish</button></div>',
      async function (f) {
        var reason = (f.reason.value || '').trim();
        if (reason.length < 3) return 'Sabab kamida 3 belgi bo‘lsin';
        var body = { opId: opId('rv'), reason: reason };
        if (kind === 'move') body.moveId = id; else body.entryId = id;
        var r = await api('POST', '/reverse', body);
        if (!r.ok) return errText(r);
        closeModal(); note('Bekor qilindi'); await loadAll(); return null;
      });
  }

  function productModal(p) {
    var st = V.state || {}, cats = st.productCats || [], cur = p ? p.cur : 'UZS', sc = scale(cur);
    var isNew = !p;
    var cs = ((V.me && V.me.currencies) || ['UZS', 'USD']).map(function (c) { return '<option' + (c === cur ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    openModal('<h3>' + (isNew ? 'Yangi tovar' : 'Tovarni tahrirlash') + '</h3><div class="v11-form">' +
      '<label class="v11-lb full">Nomi *<input class="v11-in" name="name" maxlength="120" required value="' + esc(p ? p.name : '') + '"></label>' +
      '<label class="v11-lb">Artikul<input class="v11-in" name="sku" maxlength="40" placeholder="A-100" value="' + esc(p && p.sku || '') + '"></label>' +
      '<label class="v11-lb">Shtrix-kod<input class="v11-in" name="barcode" inputmode="numeric" maxlength="32" value="' + esc(p && p.barcode || '') + '"></label>' +
      '<label class="v11-lb">Kategoriya<select class="v11-in" name="category"><option value="">— yo‘q —</option>' + cats.map(function (c) { return '<option' + (p && p.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="v11-lb">Valyuta<select class="v11-in" name="cur">' + cs + '</select></label>' +
      (st.canCost !== false ? '<label class="v11-lb">Kirish narxi (bitta)<input class="v11-in" name="buyPrice" inputmode="decimal" value="' + (p && p.buyMinor != null ? fmt(p.buyMinor / sc, 2).replace(/[^\d.]/g, '') : '') + '"></label>' : '') +
      '<label class="v11-lb">Sotish narxi (bitta) *<input class="v11-in" name="sellPrice" inputmode="decimal" required value="' + (p ? fmt(p.sellMinor / sc, 2).replace(/[^\d.]/g, '') : '') + '"></label>' +
      '<label class="v11-lb">Minimal qoldiq<input class="v11-in" name="minQty" inputmode="decimal" value="' + (p ? qtyFmt(p.minMilli).replace(/\s/g, '') : '') + '"></label>' +
      (isNew ? '<label class="v11-lb">Boshlang‘ich qoldiq<input class="v11-in" name="initialQty" inputmode="decimal" placeholder="0"></label>' : '') +
      '<label class="v11-lb">Yetkazib beruvchi<input class="v11-in" name="supplier" maxlength="120" value="' + esc(p && p.supplier || '') + '"></label>' +
      '<label class="v11-lb full">Izoh<input class="v11-in" name="description" maxlength="500" value="' + esc(p && p.description || '') + '"></label>' +
      '</div><div class="v11-msg-err"></div><div class="foot"><button type="button" class="v11-btn" data-act="modal-close">Bekor</button><button type="submit" class="v11-btn primary">Saqlash</button></div>',
      async function (f) {
        var body = { opId: opId('prd') };
        if (p) body.id = p.id;
        ['name', 'sku', 'barcode', 'category', 'cur', 'buyPrice', 'sellPrice', 'minQty', 'initialQty', 'supplier', 'description'].forEach(function (k) {
          var el = f.elements[k]; if (!el) return;       // yo‘q maydon yuborilmaydi — serverda eski qiymat saqlanadi
          var v = el.value;
          if (['buyPrice', 'sellPrice', 'minQty', 'initialQty'].indexOf(k) >= 0 && v !== '') { var n = pnum(v); if (n !== null) v = n; }
          body[k] = v;
        });
        if (!isNew) body.supplier = body.supplier || '';
        if (!body.name || body.name.trim().length < 2) return 'Nomi kamida 2 belgi bo‘lsin';
        if (pnum(body.sellPrice) === null) return 'Sotish narxini kiriting';
        var r = await api('POST', '/product', body);
        if (!r.ok) return errText(r);
        closeModal(); note(isNew ? 'Tovar qo‘shildi' : 'Saqlandi'); await loadAll(); return null;
      });
  }

  /* ---------- formalar ---------- */
  async function formHandler(form) {
    var kind = form.dataset.form;
    var f = form.elements;
    if (kind === 'period') {
      var from = f.from.value, to = f.to.value;
      if (!from || !to) return 'Sanalarni kiriting';
      if (from > to) return 'Boshlanish sanasi tugashidan katta bo‘lmasin';
      V.period.preset = 'custom'; V.period.from = from; V.period.to = to; V.jlimit = 200;
      await loadAll(); return null;
    }
    if (kind === 'cat') {
      var name = (f.name.value || '').trim();
      if (name.length < 2) return 'Kamida 2 belgi';
      var r = await api('POST', '/category', { opId: opId('cat'), kind: form.dataset.kind, name: name });
      if (!r.ok) return errText(r);
      note('Qo‘shildi'); await loadAll(); return null;
    }
    if (kind === 'expense') {
      var amount = pnum(f.amount.value);
      if (!(amount > 0)) return 'Summani kiriting';
      var rx = await api('POST', '/expense', { opId: opId('exp'), amount: amount, cur: f.cur.value, category: f.category.value, method: f.method.value, day: f.day.value, note: f.note.value });
      if (!rx.ok) return errText(rx);
      note('Xarajat saqlandi'); await loadAll(); return null;
    }
    if (kind === 'move') {
      var mk = form.dataset.kind, reason = (f.reason.value || '').trim();
      if (reason.length < 3) return 'Sabab kamida 3 belgi bo‘lsin';
      var body = { opId: opId('mv'), kind: mk, productId: f.productId.value, reason: reason };
      if (mk === 'writeoff') {
        var q = pnum(f.qty.value); if (!(q > 0)) return 'Miqdorni kiriting';
        body.qty = q; if (f.allowNegative && f.allowNegative.checked) body.allowNegative = true;
      } else {
        var c = pnum(f.counted.value); if (c === null || c < 0) return 'Haqiqiy miqdorni kiriting';
        body.counted = c;
      }
      var rm = await api('POST', '/move', body);
      if (!rm.ok) return errText(rm);
      note('Saqlandi'); await loadAll(); return null;
    }
    if (kind === 'cash-start') {
      var amt = pnum(f.amount.value); if (amt === null || amt < 0) return 'Summani to‘g‘ri kiriting';
      var rs = await api('POST', '/cash-start', { opId: opId('cst'), day: f.day.value, cur: f.cur.value, amount: amt });
      if (!rs.ok) return errText(rs);
      note('Boshlang‘ich qoldiq saqlandi'); await loadAll(); return null;
    }
    if (kind === 'cash-adj') {
      var cnt = pnum(f.counted.value); if (cnt === null || cnt < 0) return 'Sanalgan summani kiriting';
      var rj = (f.reason.value || '').trim(); if (rj.length < 3) return 'Sabab kamida 3 belgi';
      var rca = await api('POST', '/cash-adjust', { opId: opId('cad'), cur: f.cur.value, counted: cnt, reason: rj });
      if (!rca.ok) return errText(rca);
      note('Tuzatish saqlandi'); await loadAll(); return null;
    }
    if (kind === 'purchase') {
      var cur = f.cur.value, rows = form.querySelectorAll('[data-line]'), lines = [];
      Array.prototype.forEach.call(rows, function (rw) {
        var pid = rw.querySelector('[name=pid]').value, qty = pnum(rw.querySelector('[name=qty]').value), price = pnum(rw.querySelector('[name=price]').value);
        if (!pid && !qty && !price) return;
        lines.push({ productId: pid, qty: qty, unitPrice: price });
      });
      if (!lines.length) return 'Kamida bitta tovar kiriting';
      if (lines.some(function (l) { return !l.productId; })) return 'Har bir qatorda tovarni tanlang';
      if (lines.some(function (l) { return !(l.qty > 0) || l.unitPrice === null || l.unitPrice < 0; })) return 'Miqdor va narxni to‘g‘ri kiriting';
      var paidRaw = f.paid.value.trim(), paid = paidRaw === '' ? null : pnum(paidRaw);
      if (paidRaw !== '' && paid === null) return 'To‘langan summani to‘g‘ri kiriting';
      var rp = await api('POST', '/purchase', { opId: opId('pur'), cur: cur, lines: lines, paid: paid, method: f.method.value, day: f.day.value, supplier: f.supplier.value, note: f.note.value });
      if (!rp.ok) return errText(rp);
      V.purchRows = null;
      note('Kirim saqlandi'); await loadAll(); return null;
    }
    if (kind === 'ai') {
      var qv = (f.q.value || '').trim();
      if (qv.length < 2) return 'Savolni yozing';
      V.ai.busy = true; render();
      var ra = await api('POST', '/ai', { question: qv });
      V.ai.busy = false;
      if (!ra.ok) return errText(ra);
      V.ai.hist.push({ q: qv, a: ra.data });
      if (V.ai.hist.length > 30) V.ai.hist.splice(0, V.ai.hist.length - 30);
      render();
      return null;
    }
    return null;
  }

  /* ---------- eksport va chop etish ---------- */
  function periodParamsString() { return periodQS(false); }
  async function exportSheet(sheet) {
    var r = await fetch(apiBase() + '/export?sheet=' + encodeURIComponent(sheet) + (sheet === 'products' ? '' : '&' + periodParamsString()), { headers: X.qhead(), cache: 'no-store' }).catch(function () { return null; });
    if (!r || !r.ok) { var d = r ? await r.json().catch(function () { return {}; }) : {}; note(errText({ status: r ? r.status : 0, data: d }), false); return; }
    var blob = await r.blob();
    var cd = r.headers.get('content-disposition') || '';
    var m = /filename="([^"]+)"/.exec(cd);
    var name = m ? m[1] : 'qarzim-' + sheet + '.xlsx';
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    note('Fayl yuklab olindi');
  }
  function printReport() {
    var sm = V.sum; if (!sm) { note('Avval moliya hisobini faollashtiring', false); return; }
    var k = sm.pnl, p = sm.prevPnl, shop = (V.me && V.me.username) || 'Qarzim';
    var rows = [['Daromad (sotuv)', k.revenue, p.revenue], ['Tannarx (COGS)', k.cogs, p.cogs], ['Yalpi foyda', k.grossProfit, p.grossProfit], ['Yo‘qotish va tuzatish', k.losses, p.losses], ['Xarajatlar', k.expenses, p.expenses], ['Sof foyda', k.netProfit, p.netProfit]];
    var html = '<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Moliyaviy hisobot</title><style>' +
      'body{font:13px/1.45 system-ui,Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 4px}.m{color:#555;margin-bottom:18px}' +
      'table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}th.n,td.n{text-align:right}' +
      'h2{font-size:14px;margin:22px 0 4px}.f{margin-top:24px;color:#777;font-size:11px}@page{size:A4;margin:14mm}</style></head><body>' +
      '<h1>Moliyaviy hisobot</h1><div class="m">' + esc(shop) + ' · davr: ' + esc(sm.period.from) + ' — ' + esc(sm.period.to) + ' · UZS</div>' +
      '<table><thead><tr><th>Ko‘rsatkich</th><th class="n">Joriy davr</th><th class="n">Oldingi davr</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="n"><b>' + esc(moneyUzs(r[1])) + '</b></td><td class="n">' + esc(moneyUzs(r[2])) + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<h2>Kassa qoldig‘i (UZS ekvivalenti)</h2><div>' + esc(moneyUzs(sm.cash.uzs.closing)) + '</div>' +
      '<h2>Ochiq qarzlar</h2><div>' + esc(moneyUzs(sm.debts.uzs)) + ' · mijozlar: ' + esc(sm.debts.count) + '</div>' +
      '<div class="f">Qarzim · ' + new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) + ' · Sof foyda = daromad − tannarx − yo‘qotish − xarajatlar</div></body></html>';
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(f);
    f.onload = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { note('Chop etish oynasini ochib bo‘lmadi', false); } setTimeout(function () { f.remove(); }, 1500); };
    f.srcdoc = html;
  }

  /* ---------- Excel import ---------- */
  async function importFile(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { note('Fayl 2 MB dan katta', false); return; }
    var buf = await file.arrayBuffer();
    V.importBuf = buf;
    var r = await api('POST', '/import?dry=1', buf, true);
    if (!r.ok) { note(errText(r), false); return; }
    var d = r.data, errs = d.errors || [];
    openModal('<h3>Excel: oldindan ko‘rish</h3><p class="v11-sub">' + d.total + ' qator · yangi: ' + d.creates + ' · yangilanadi: ' + d.updates + '</p>' +
      (errs.length ? '<div class="v11-banner bad"><div><b>' + errs.length + ' ta xato</b><div class="v11-muted">' + errs.slice(0, 8).map(function (e) { return esc('Qator ' + e.row + ': ' + e.message); }).join('<br>') + '</div></div></div>' : '') +
      '<div class="v11-tw" style="max-height:280px;overflow:auto"><table class="v11-tbl"><thead><tr><th>Qator</th><th>Nomi</th><th>Artikul</th><th>Amal</th><th class="n">Qoldiq</th></tr></thead><tbody>' +
      (d.rows || []).map(function (x) { return '<tr><td>' + x.row + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.sku || '') + '</td><td>' + esc(x.action) + '</td><td class="n">' + esc(x.initialQty || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="v11-msg-err"></div><div class="foot"><button type="button" class="v11-btn" data-act="modal-close">Bekor</button>' +
      '<button type="submit" class="v11-btn primary"' + (errs.length ? ' disabled' : '') + '>Import qilish</button></div>',
      async function () {
        var ri = await api('POST', '/import?opId=' + encodeURIComponent(opId('imp')), V.importBuf, true);
        if (!ri.ok) return errText(ri);
        closeModal(); note('Import qilindi: ' + ri.data.imported + ' ta tovar'); await loadAll(); return null;
      });
  }

  /* ---------- ochish/yopish, hodisalar ---------- */
  function onClick(e) {
    var t = e.target.closest && e.target.closest('[data-nav],[data-act],[data-period],[data-filter-st]');
    if (!t) return;
    if (t.dataset.nav) { e.preventDefault(); go(t.dataset.nav); return; }
    if (t.dataset.filterSt) { e.preventDefault(); V.filters.stock.st = t.dataset.filterSt; render(); return; }
    if (t.dataset.period) { e.preventDefault(); setPeriod(t.dataset.period); return; }
    var act = t.dataset.act;
    if (act === 'modal-close') { closeModal(); return; }
    if (act === 'import-file') return;
    e.preventDefault();
    doAction(act, t);
  }
  function onSubmit(e) {
    var form = e.target;
    if (!form.dataset || !form.dataset.form) return;
    if (form.closest('#v11Modal')) return;
    e.preventDefault();
    runForm(form, function () { return formHandler(form); });
  }
  function onChange(e) {
    var el = e.target;
    if (el.dataset && el.dataset.filter === 'stock-cat') { V.filters.stock.cat = el.value; render(); return; }
    if (el.dataset && el.dataset.group !== undefined) { V.period.group = el.value; loadAll(); return; }
    if (el.dataset && el.dataset.act === 'import-file') { importFile(el); return; }
    if (el.dataset && el.dataset.purchCur !== undefined) {
      // valyuta o‘zgarsa tovar tanlovi tozalanadi (boshqa valyutadagi tovar kirimga tushmasin), miqdor va narx saqlanadi
      captureLines(); V.purchCur = el.value;
      if (V.purchRows) V.purchRows.forEach(function (r) { r.pid = ''; });
      render(); return;
    }
    if (el.dataset && el.dataset.adjPick !== undefined) {
      var p = (V.state.products || []).find(function (x) { return x.id === el.value; });
      var hint = V.root.querySelector('[data-adj-hint]'); if (hint && p) hint.textContent = 'Hozirgi qoldiq: ' + qtyFmt(p.qtyMilli);
      return;
    }
  }
  function onInput(e) {
    var el = e.target;
    var key = el.dataset && el.dataset.filter;
    if (key !== 'stock-q' && key !== 'prod-q') return;
    if (key === 'stock-q') V.filters.stock.q = el.value; else V.filters.products.q = el.value;
    var pos = el.selectionStart;                           // qidiruv kursori yangilashdan keyin joyida qolsin
    render();
    var again = V.root.querySelector('[data-filter=' + key + ']');
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) { /* */ } }
  }
  function onOver(e) {
    var h = e.target.closest && e.target.closest('.hit');
    if (h && V.tips[+h.dataset.tip] !== undefined) tipShow(V.tips[+h.dataset.tip], e);
  }
  function onOut(e) { if (e.target.closest && e.target.closest('.hit')) tipHide(); }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (V.root.querySelector('#v11Modal.open')) { closeModal(); return; }
      close();
    }
  }

  function build() {
    var root = document.createElement('div');
    root.id = 'qdv11'; root.className = 'v11-root'; root.setAttribute('data-theme', V.theme);
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Ombor va moliya');
    root.innerHTML = '<header class="v11-top"><div class="v11-brand"><span class="v11-logo">Q</span><div><b>Qarzim</b><small>Ombor va moliya</small></div></div>' +
      '<div class="v11-top-r"><button type="button" class="v11-ico" data-act="theme" title="Mavzu" aria-label="Mavzuni almashtirish">' + svg(I.moon) + '</button>' +
      '<button type="button" class="v11-btn sm" data-act="refresh" title="Yangilash">' + svg(I.refresh) + '<span class="t">Yangilash</span></button>' +
      '<button type="button" class="v11-btn sm" data-act="close" aria-label="Yopish">' + svg(I.x) + '<span>Yopish</span></button></div></header>' +
      '<div class="v11-body"><nav class="v11-nav" id="v11Nav" aria-label="Bo‘limlar"></nav><main class="v11-main" id="v11Main" tabindex="-1"></main></div>' +
      '<div id="v11Modal" role="dialog" aria-modal="true"></div><div id="v11Tip" class="v11-tip"></div><div id="v11Toast"></div>';
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('mousemove', function (e) { tipMove(e); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.closest && e.target.closest('[data-nav]')) { e.preventDefault(); go(e.target.dataset.nav); } onKey(e); });
    return root;
  }
  function open() {
    if (!V.root) { V.root = build(); document.body.appendChild(V.root); }
    V.root.style.display = 'flex'; V.open = true;
    V.root.querySelector('#v11Main').focus && V.root.querySelector('#v11Main').focus();
    V.loadErr = '';
    if (offline()) { render(); return; }
    loadAll();
  }
  function close() { if (V.root) V.root.style.display = 'none'; V.open = false; if (V.root) closeModal(); }

  window.QDV11 = { open: open, close: close, isOpen: function () { return V.open; } };
  // v10 dagi "Ombor" tugmasi va boshqa joylar uchun
  document.addEventListener('qarzim:open-v11', open);
})();
