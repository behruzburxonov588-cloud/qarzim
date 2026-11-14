"""Browser check for the Qarzim v13 chart, status and debt-entry changes.

Needs Python Playwright with Chrome installed; it is not part of `npm test`.
Usage (start the app first, on a clean data file):
  PORT=3600 DATA_FILE=/tmp/qd-e2e/data.json node server.js
  python3 tests/e2e/verify-qarzim.py http://127.0.0.1:3600/ desk 0   # desktop 1280x800
  python3 tests/e2e/verify-qarzim.py http://127.0.0.1:3600/ mob 1    # phone 390x844
Use a fresh server for each run: the test account is created on first run.
All data is synthetic and exists only in the throwaway browser session.
Screenshots go to $QD_SHOTS (default /tmp/qd-shots).
"""
import sys, os
from playwright.sync_api import sync_playwright
BASE, LABEL, MOBILE = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
W, H = (390, 844) if MOBILE else (1280, 800)
OUT = os.environ.get('QD_SHOTS', '/tmp/qd-shots'); os.makedirs(OUT, exist_ok=True)
PASS, FAIL = [], []
def check(name, ok, detail=''):
    (PASS if ok else FAIL).append(f"{name}{(' — ' + str(detail)) if detail != '' else ''}")

SEED = """() => {
  S.vcur = 'UZS';
  const ago = (d, h = 12) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.getTime(); };
  const iso = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toLocaleDateString('sv-SE'); };
  const tr = (id, type, amount, d, note) => ({ id, type, amount, note, date: iso(d), ts: ago(d) });
  S.clients = [
    { id: 'c_aziz', name: 'Aziz Karimov', phone: '+998901112233', cur: 'UZS', dueDate: null,
      transactions: [tr('t1', 'debt', 500000, 10, 'Un'), tr('t2', 'payment', 200000, 3, '')] },
    { id: 'c_madina', name: 'Madina Rahimova', phone: '+998935551122', cur: 'UZS', dueDate: null,
      transactions: [tr('t3', 'debt', 1200000, 40, 'Gilam'), tr('t4', 'payment', 1200000, 1, '')] },
    { id: 'c_sherzod', name: 'Sherzod Tursunov', phone: '', cur: 'UZS', dueDate: iso(1),
      transactions: [tr('t5', 'debt', 80000, 0, 'Non')] },
  ];
  S.lenders = [ { id: 'l_bobur', name: 'Bobur aka', phone: '+998911000001', cur: 'UZS', dueDate: null,
      transactions: [tr('t6', 'debt', 350000, 5, '')] } ];
  saveShopData();
  return S.clients.length;
}"""

COMPARE = """() => {
  const key = (ts) => new Date(ts).toLocaleDateString('sv-SE');
  const prevDay = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv-SE'); };
  const all = S.clients;
  const remAt = (iso) => { let tot = 0; all.forEach(c => { let b = 0; c.transactions.forEach(t => { if (key(t.ts) <= iso) b += t.type === 'debt' ? t.amount : -t.amount; }); if (b > 0) tot += b; }); return tot; };
  return QC.qcCard.B.map(b => {
    let lent = 0, recv = 0, cnt = 0;
    all.forEach(c => c.transactions.forEach(t => { const k = key(t.ts); if (k >= b.from && k <= b.to) { cnt++; if (t.type === 'debt') lent += t.amount; else recv += t.amount; } }));
    return { from: b.from, to: b.to,
      got: { lent: b.lent, recv: b.recv, cnt: b.cnt, open: b.open, rem: b.rem },
      exp: { lent, recv, cnt, open: remAt(prevDay(b.from)), rem: remAt(b.to) } };
  });
}"""

def compare(page, label):
    rows = page.evaluate(COMPARE)
    bad = []
    for r in rows:
        g, e = r['got'], r['exp']
        for k in ('lent', 'recv', 'cnt', 'open', 'rem'):
            if g[k] != e[k]:
                bad.append(f"{r['from']}..{r['to']} {k} got={g[k]} exp={e[k]}")
        if g['open'] + g['lent'] - g['recv'] != g['rem']:
            bad.append(f"{r['from']} bridge {g['open']}+{g['lent']}-{g['recv']}!={g['rem']}")
    check(f"chart buckets match independent recomputation [{label}] ({len(rows)} buckets)", not bad, '; '.join(bad[:3]))
    return rows

def digits(s): return ''.join(ch for ch in s if ch.isdigit())

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    ctx = b.new_context(viewport={'width': W, 'height': H}, is_mobile=MOBILE, has_touch=MOBILE)
    pg = ctx.new_page(); errs = []; overflow = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and not any(s in m.text for s in ('ERR_TUNNEL', '404', 'fonts.googleapis', 'cbu.uz')) else None)
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_selector('#authForm'); pg.click('#toRegister')
    pg.fill('#authUser', 'verify_' + LABEL); pg.fill('#authPass', '123456'); pg.click('#authSubmit')
    pg.wait_for_selector('.bottom-tabs', timeout=10000)

    pg.evaluate(SEED); pg.wait_for_timeout(200)
    pg.locator('.bottom-tabs').get_by_text('Mijozlar').click(); pg.wait_for_timeout(700)

    # overview totals on Mijozlar (Berilgan qarz / Qaytarilgan / Qolgan / jami kishilar)
    pg.wait_for_timeout(1300)
    vals = {k: digits(pg.locator('#' + k).inner_text()) for k in ('statBorrow', 'statRepaid', 'statRem', 'statCount')}
    check('overview: borrowed total = 1 780 000', vals['statBorrow'] == '1780000', vals)
    check('overview: repaid total = 1 400 000', vals['statRepaid'] == '1400000', vals)
    check('overview: remaining = 380 000', vals['statRem'] == '380000', vals)
    check('overview: 3 people', vals['statCount'] == '3', vals)

    # status tags: active / overdue / fully repaid
    def row_tag(name):
        row = pg.locator('.client-row', has_text=name).first
        tag = row.locator('.client-balance .tag')
        return (tag.inner_text().strip(), tag.get_attribute('class'))
    t_aziz, t_madina, t_sherzod = row_tag('Aziz Karimov'), row_tag('Madina Rahimova'), row_tag('Sherzod Tursunov')
    check('status: Aziz is active (qarzi bor)', t_aziz[0] == 'qarzi bor', t_aziz)
    check('status: Madina is fully repaid (to‘langan, green)', t_madina[0] == 'to‘langan' and 'paid' in (t_madina[1] or ''), t_madina)
    row_s = pg.locator('.client-row', has_text='Sherzod Tursunov').first
    check('status: Sherzod is overdue (highlighted row, grace label kept)', 'is-overdue' in (row_s.get_attribute('class') or '') and t_sherzod[0] in ('faol', 'diqqat', 'faol emas', "muddati o'tgan"), t_sherzod)
    due_txt = pg.locator('.client-row', has_text='Sherzod Tursunov').first.locator('.due-pill').inner_text()
    check('card: overdue row shows the repayment date', 'muddat' in due_txt and digits(due_txt) != '', due_txt.replace('\n', ' '))

    # Qarzlarim overview
    pg.locator('.bottom-tabs').get_by_text('Qarzlarim').click(); pg.wait_for_timeout(1300)
    lv = {k: digits(pg.locator('#' + k).inner_text()) for k in ('statBorrow', 'statRepaid', 'statRem')}
    check('Qarzlarim overview: borrowed 350 000 / remaining 350 000', lv['statBorrow'] == '350000' and lv['statRem'] == '350000' and lv['statRepaid'] == '0', lv)

    # Hisobot chart: every range x granularity combination against independent math
    pg.locator('.bottom-tabs').get_by_text('Hisobot').click(); pg.wait_for_timeout(900)
    pg.locator('[data-rep="dash"]').click(); pg.wait_for_timeout(500)
    combos = [(7, 'day'), (30, 'day'), (30, 'week'), (180, 'month'), (180, 'week'), (365, 'month')]
    for rng, gran in combos:
        pg.locator(f'[data-qcrange="{rng}"]').click(); pg.wait_for_timeout(150)
        btn = pg.locator(f'[data-qcper="{gran}"]')
        if btn.is_disabled(): pg.locator(f'[data-qcrange="{rng}"]').click()
        btn.click(); pg.wait_for_timeout(250)
        rows = compare(pg, f'{rng} days, {gran}')
        if rng == 365:
            cover = (rows[-1]['to'] == rows[-1]['to'])
    # disabled granularities for each range
    pg.locator('[data-qcrange="180"]').click(); pg.wait_for_timeout(150)
    check('6 oy: daily granularity disabled', pg.locator('[data-qcper="day"]').is_disabled())
    pg.locator('[data-qcrange="365"]').click(); pg.wait_for_timeout(150)
    check('12 oy: only monthly is enabled', pg.locator('[data-qcper="day"]').is_disabled() and pg.locator('[data-qcper="week"]').is_disabled() and not pg.locator('[data-qcper="month"]').is_disabled())

    # 7-day daily window: first bucket is exactly today minus 6 days, and the readout matches the tapped column
    pg.locator('[data-qcrange="7"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-qcper="day"]').click(); pg.wait_for_timeout(250)
    B = pg.evaluate("() => QC.qcCard.B.map(b => ({from:b.from,to:b.to,lent:b.lent,recv:b.recv,open:b.open,rem:b.rem,cnt:b.cnt}))")
    check('7 kun: 7 daily buckets', len(B) == 7, len(B))
    col = pg.locator('#qcCard .qc-col')
    idx = 3
    col.nth(idx).click(); pg.wait_for_timeout(200)
    read = pg.locator('#qcRead').inner_text()
    want = f"{B[idx]['open']:,}".replace(',', ' ')
    check('tap readout shows historical balance for the tapped day', want in read, want)
    check('tap readout labels historical vs new debt', 'Oldingi qarz' in read and 'Yangi berilgan qarz' in read and 'Davr oxirida qolgan' in read)
    pg.locator('#qcCard .qc-col').nth(len(B) - 1).click(); pg.wait_for_timeout(200)
    last = B[-1]
    read2 = pg.locator('#qcRead').inner_text()
    check('today readout: historical 300 000, new 80 000, closing 380 000', all(x in read2 for x in ('300 000', '80 000', '380 000')), read2.replace('\n', ' | ')[:160])
    pg.screenshot(path=f"{OUT}/{LABEL}-chart-7d.png", full_page=False)

    # Real UI: partial repayment for Aziz (500k - 200k - 100k = 200k left)
    pg.locator('.bottom-tabs').get_by_text('Mijozlar').click(); pg.wait_for_timeout(500)
    pg.locator('.client-row[data-id="c_aziz"]').click(); pg.wait_for_selector('#detailOverlay', timeout=5000); pg.wait_for_timeout(500)
    pg.click('[data-mode="payment"]'); pg.wait_for_timeout(150)
    pg.fill('#txAmount', '100000'); pg.click('#txForm button[type="submit"]'); pg.wait_for_timeout(500)
    aziz_bal = pg.evaluate("() => { const c = S.clients.find(x => x.id === 'c_aziz'); return c.transactions.reduce((s,t)=>s + (t.type==='debt'?t.amount:-t.amount),0); }")
    check('partial repayment: Aziz balance 200 000 after 100 000 payment', aziz_bal == 200000, aziz_bal)
    pg.evaluate("() => closeModals()"); pg.wait_for_timeout(500)
    pg.locator('.bottom-tabs').get_by_text('Mijozlar').click(); pg.wait_for_timeout(1300)
    rem2 = digits(pg.locator('#statRem').inner_text())
    check('after repayment: overview remaining = 280 000', rem2 == '280000', rem2)
    pg.locator('.bottom-tabs').get_by_text('Hisobot').click(); pg.wait_for_timeout(900)
    pg.locator('[data-rep="dash"]').click(); pg.wait_for_timeout(400)
    pg.locator('[data-qcrange="7"]').click(); pg.wait_for_timeout(150); pg.locator('[data-qcper="day"]').click(); pg.wait_for_timeout(250)
    compare(pg, 'after repayment')
    pg.locator('.bottom-tabs').get_by_text('Mijozlar').click(); pg.wait_for_timeout(500)

    # Real UI: new debt with optional note and repayment date
    pg.click('#addBtn'); pg.wait_for_selector('#newName'); pg.wait_for_timeout(200)
    check('add form has the optional note field', pg.locator('#newNote').count() == 1)
    pg.fill('#newName', 'Test Un'); pg.fill('#newDebt', '150000'); pg.fill('#newNote', 'Un 25 kg'); pg.click('#addSubmit'); pg.wait_for_timeout(400)
    note_saved = pg.evaluate("() => { const c = S.clients.find(x => x.name === 'Test Un'); return c ? c.transactions[0].note + '|' + c.transactions[0].amount : 'missing'; }")
    check('add form: note saved on the new debt', note_saved == 'Un 25 kg|150000', note_saved)
    pg.click('#addBtn'); pg.wait_for_selector('#newName'); pg.wait_for_timeout(200)
    pg.fill('#newName', 'Test Bosh'); pg.fill('#newDebt', '50000'); pg.click('#addSubmit'); pg.wait_for_timeout(400)
    def_note = pg.evaluate("() => { const c = S.clients.find(x => x.name === 'Test Bosh'); return c.transactions[0].note; }")
    check('add form: empty note keeps the default label', def_note.startswith("Boshlang"), def_note)

    pg.screenshot(path=f"{OUT}/{LABEL}-list.png", full_page=False)
    ov = pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check('no horizontal overflow', ov <= 0, ov)
    check('no page errors', not errs, errs[:3])
    b.close()

print(f"[{LABEL}] PASS {len(PASS)}  FAIL {len(FAIL)}")
for x in PASS: print('  ok  ', x)
for x in FAIL: print('  FAIL', x)
