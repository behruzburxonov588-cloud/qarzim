'use strict';
/* Qarzim — AI yordamchi (qoidalar asosida, serverda). Tashqi model yo'q, kalit kerak emas, ma'lumot tashqariga chiqmaydi.
 * Qoidalar:
 *  - Faqat haqiqiy ma'lumotdan hisoblaydi (ops jurnali va qarz daftari). Raqam o'ylab topilmaydi.
 *  - Ma'lumot yetmasa — shuni aytadi. Taxminlar "taxminiy" deb belgilanadi.
 *  - Faqat o'qish: moliyaviy yozuvni o'zgartira olmaydi.
 *  - Kirish ruxsatlari va do'kon izolyatsiyasi chaqiruvchi tomonda tekshiriladi (ai huquqi).
 */
const O = require('./ops');
const H = O.helpers;

const EXAMPLES = [
  'Bugun qancha sof foyda qildim?',
  'Qaysi mahsulotim eng ko‘p foyda keltiryapti?',
  'Qaysi mijozlarning qarzi kechikmoqda?',
  'Omborda qaysi mahsulotlar tugayapti?',
  'Bu oy xarajatlarim qancha bo‘ldi?',
  'Qaysi mahsulotni ko‘proq sotib olishim kerak?',
  'Bu oy o‘tgan oy bilan solishtirganda qanday?',
  'Qarzlar o‘sib bormoqdami?',
  'Kassada qancha pul bor?',
  'Bugungi xulosa',
];

/** Matnni taqqoslash uchun soddalashtiradi: apostrof va belgilar olib tashlanadi. */
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[‘’ʻʼ`'´]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const fmt = (minor) => {
  const v = Math.round(minor || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + s + ' so‘m';
};
const fmtQty = (milli) => (milli / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }).replace(/,/g, ' ');
const pct = (a, b) => (b ? Math.round((a - b) / Math.abs(b) * 100) : null);

function intentOf(q) {
  const t = norm(q);
  const has = (...w) => w.some((x) => t.includes(x));
  if (!t) return 'empty';
  if (has('kassa', 'naqd pul', 'pul qancha', 'qoldiq')) return 'cash';
  if (has('kechik', 'muddati otgan', 'muddati o tgan', 'tolamagan', 'tolovni kechik')) return 'overdue';
  if (has('osib', 'ortib', 'kopay', 'oshib')) return 'growing_debts';
  if (has('omborda', 'tugay', 'kam qol', 'qoldiq kam', 'tugab', 'zaxira')) return 'low_stock';
  if (has('sotib olish', 'kop sotib', 'kop olish', 'buyurtma', 'qayta buyur', 'qaytadan sotib')) return 'restock';
  if (has('xarajat', 'chiqim', 'harajat')) return 'expenses';
  if (has('solishtir', 'otgan oy', 'oldingi oy', 'otgan hafta', 'taqqos')) return 'compare';
  if ((has('mahsulot', 'tovar') && has('foyda', 'daromad', 'kop sotil', 'eng')) || has('top mahsulot', 'eng foydali')) return 'top_products';
  if (has('sof foyda', 'foyda', 'daromad', 'sotuv', 'savdo') && has('bugun', 'kun')) return 'profit_today';
  if (has('sof foyda', 'foyda', 'daromad') && has('oy', 'oylik')) return 'profit_month';
  if (has('qarz', 'qarzdor', 'qarzlar')) return 'debts';
  if (has('xulosa', 'kunlik', 'hisobot', 'umumiy', 'holat', 'bugun')) return 'summary';
  return 'unknown';
}

/**
 * Savolga javob. ctx: { now, rates, clients (qarz daftari: blob clients) }.
 * Qaytaradi: { ok, intent, title, text, bullets[], notes[], estimate, activated }
 */
function answer(ops, question, ctx) {
  const intent = intentOf(question);
  const now = ctx.now, today = H.dayOf(now), rates = ctx.rates || {};
  const out = { ok: true, intent, title: '', text: '', bullets: [], notes: [], estimate: false, activated: !!ops.activeFrom };
  if (intent === 'unknown' || intent === 'empty') {
    out.title = 'Savolni tushunmadim';
    out.text = 'Quyidagi savollardan birini so‘rang yoki savolni boshqacha yozing.';
    out.bullets = EXAMPLES;
    return out;
  }
  if (!ops.activeFrom && intent !== 'debts' && intent !== 'overdue' && intent !== 'growing_debts' && intent !== 'low_stock') {
    out.title = 'Moliya hisobi hali faollashtirilmagan';
    out.text = 'Foyda, xarajat va kassa hisob-kitobi uchun avval «Moliyaviy hisobotlar» bo‘limida hisobni faollashtiring. Shundan keyin raqamlar paydo bo‘ladi.';
    return out;
  }
  const month = today.slice(0, 8) + '01';
  const prevMonthEnd = H.addDays(month, -1);
  const prevMonthStart = prevMonthEnd.slice(0, 8) + '01';
  const d30 = H.addDays(today, -29);

  if (intent === 'profit_today') {
    const p = O.pnl(ops, today, today);
    out.title = 'Bugungi natija';
    out.text = `Bugun sof foyda: ${fmt(p.netProfit)}.`;
    out.bullets = [
      `Daromad (sotuv): ${fmt(p.revenue)}`,
      `Tannarx (sotilgan tovar): ${fmt(p.cogs)}`,
      `Xarajatlar: ${fmt(p.expenses)}`,
      `Yo‘qotish (yaroqsiz, inventarizatsiya): ${fmt(p.losses)}`,
      `Sotuvlar soni: ${p.sales}`,
    ];
    if (p.unlinkedSales) out.notes.push(`${p.unlinkedSales} ta sotuv tovarga bog‘lanmagan — ularning tannarxi hisobga kirmagan, foyda ortiqcha ko‘rinishi mumkin.`);
    if (p.sales < 3) out.notes.push('Bugun sotuv kam — xulosa hali to‘liq emas.');
    return out;
  }
  if (intent === 'profit_month' || intent === 'summary') {
    const pd = O.pnl(ops, today, today), pm = O.pnl(ops, month, today);
    out.title = intent === 'summary' ? 'Kunlik va oylik xulosa' : 'Oylik foyda';
    out.text = `Bu oy (${month} — ${today}) sof foyda: ${fmt(pm.netProfit)}. Bugun: ${fmt(pd.netProfit)}.`;
    out.bullets = [
      `Oy bo‘yicha daromad: ${fmt(pm.revenue)}`,
      `Tannarx: ${fmt(pm.cogs)}; yalpi foyda: ${fmt(pm.grossProfit)}`,
      `Xarajatlar: ${fmt(pm.expenses)}; yo‘qotish: ${fmt(pm.losses)}`,
      `Kassa kirimi (tasdiqlangan): ${fmt(pm.cashIn)}`,
    ];
    if (pm.unlinkedSales) out.notes.push(`${pm.unlinkedSales} ta sotuv tovarga bog‘lanmagan.`);
    if (pm.missingRate) out.notes.push(`${pm.missingRate} ta yozuvda kurs yo‘q — ularning UZS summasi hisobga kirmagan.`);
    if (intent === 'summary') {
      const debt = O.debtSummary(ctx.clients, rates, today);
      out.bullets.push(`Qarzlar (UZS, joriy kurs): ${fmt(debt.uzs)}; kechikkan: ${debt.overdue.length} ta mijoz`);
      const st = O.stockSummary(ops, rates);
      out.bullets.push(`Ombor qiymati (taxminiy, joriy kurs): ${fmt(st.valueUzs)}; kam qolgan: ${st.low}, tugagan: ${st.out}`);
    }
    if (pm.sales < 5) out.notes.push(`Bu oy ${pm.sales} ta sotuv bor — ma’lumot kam, xulosa noaniq.`);
    return out;
  }
  if (intent === 'top_products') {
    const rows = O.topProducts(ops, d30, today).filter((r) => r.revenue || r.cogs);
    out.title = 'Eng foydali tovarlar (so‘nggi 30 kun)';
    if (!rows.length) { out.text = 'So‘nggi 30 kunda tovarga bog‘langan sotuv topilmadi.'; out.notes.push('Sotuvda tovarni tanlang — shunda foyda hisoblanadi.'); return out; }
    out.text = `Eng ko‘p foyda keltirgan tovar: ${rows[0].name} (${fmt(rows[0].profit)}).`;
    out.bullets = rows.slice(0, 5).map((r, i) => `${i + 1}. ${r.name} — foyda ${fmt(r.profit)}, daromad ${fmt(r.revenue)}, sotilgan ${fmtQty(r.qtySold)}`);
    const negative = rows.filter((r) => r.profit < 0);
    if (negative.length) out.notes.push(`${negative.length} ta tovar zarar bilan sotilgan: ${negative.map((r) => r.name).join(', ')}.`);
    return out;
  }
  if (intent === 'overdue') {
    const debt = O.debtSummary(ctx.clients, rates, today);
    out.title = 'Muddati o‘tgan qarzlar';
    if (!debt.overdue.length) { out.text = 'Muddati o‘tgan qarzli mijoz yo‘q.'; return out; }
    out.text = `${debt.overdue.length} ta mijozning qarzi muddati o‘tgan.`;
    out.bullets = debt.overdue.slice(0, 10).map((c) => `${c.name} — ${fmtMoney(c.balanceMinor, c.cur)} (muddat: ${c.dueDate})`);
    if (debt.overdue.length > 10) out.notes.push(`Yana ${debt.overdue.length - 10} ta mijoz bor. Hisobotda to‘liq ro‘yxat.`);
    return out;
  }
  if (intent === 'growing_debts') {
    const debt = O.debtSummary(ctx.clients, rates, today);
    out.title = 'O‘sayotgan qarzlar (so‘nggi 30 kun)';
    if (!debt.growing.length) { out.text = 'So‘nggi 30 kunda qarzi oshgan mijoz topilmadi.'; return out; }
    out.text = `${debt.growing.length} ta mijozning qarzi so‘nggi 30 kunda oshgan.`;
    out.bullets = debt.growing.slice(0, 10).map((c) => `${c.name} — +${fmtMoney(c.growth30Minor, c.cur)}, joriy qarz ${fmtMoney(c.balanceMinor, c.cur)}`);
    return out;
  }
  if (intent === 'debts') {
    const debt = O.debtSummary(ctx.clients, rates, today);
    out.title = 'Qarzlar holati';
    out.text = `Qarzdor mijozlar: ${debt.count} ta. Jami (UZS, joriy kurs bo‘yicha taxminan): ${fmt(debt.uzs)}.`;
    out.bullets = Object.entries(debt.perCurrency).map(([c, v]) => `${c}: ${fmtMoney(v, c)}`);
    out.bullets.push(`Muddati o‘tgan: ${debt.overdue.length} ta mijoz`);
    if (debt.uzsMissing) out.notes.push(`${debt.uzsMissing} ta valyuta kursi topilmadi — ular jamiga kirmagan.`);
    out.estimate = Object.keys(debt.perCurrency).some((c) => c !== 'UZS');
    if (out.estimate) out.notes.push('UZS ekvivalenti joriy kurs bo‘yicha — taxminiy.');
    return out;
  }
  if (intent === 'low_stock') {
    const st = O.stockSummary(ops, rates);
    out.title = 'Ombor holati';
    const lows = st.rows.filter((r) => r.status === 'low'), outs = st.rows.filter((r) => r.status === 'out');
    if (!lows.length && !outs.length) { out.text = 'Hozircha kam qolgan yoki tugagan tovar yo‘q.'; return out; }
    out.text = `Tugagan: ${outs.length} ta, kam qolgan: ${lows.length} ta.`;
    out.bullets = [...outs.map((r) => `TUGAGAN — ${r.name} (qoldiq ${fmtQty(r.qtyMilli)})`), ...lows.map((r) => `KAM — ${r.name}: ${fmtQty(r.qtyMilli)} (minimal ${fmtQty(r.minMilli)})`)];
    if (st.negative) out.notes.push(`${st.negative} ta tovarda manfiy qoldiq bor — inventarizatsiya qiling.`);
    return out;
  }
  if (intent === 'restock') {
    const sold = O.topProducts(ops, d30, today);
    const st = O.stockSummary(ops, rates);
    const soldBy = new Map(sold.map((r) => [r.productId, r.qtySold]));
    const rows = [];
    for (const r of st.rows) {
      const q = soldBy.get(r.id) || 0;
      if (q <= 0 || r.status === 'out') { if (r.status === 'out' && q > 0) rows.push({ r, q, days: 0 }); continue; }
      const perDay = (q / 1000) / 30;                         // birlik/kun (so'nggi 30 kun o'rtachasi)
      const days = (r.qtyMilli / 1000) / perDay;
      if (days < 14) rows.push({ r, q, days });
    }
    rows.sort((a, b) => a.days - b.days);
    out.title = 'Qaysi tovarni ko‘proq olish kerak';
    out.estimate = true;
    if (!rows.length) { out.text = 'Hozircha qayta buyurtma kerak bo‘lgan tovar ko‘rinmaydi (sotuv tezligi va qoldiqqa ko‘ra).'; out.notes.push('Taxmin so‘nggi 30 kunlik sotuvga asoslangan.'); return out; }
    out.text = 'Quyidagi tovarlar taxminan 2 hafta ichida tugashi mumkin (taxminiy):';
    out.bullets = rows.slice(0, 8).map(({ r, q, days }) => days ? `${r.name} — qoldiq ${fmtQty(r.qtyMilli)}, 30 kunda ${fmtQty(q)} sotilgan, taxminan ${Math.max(0, Math.round(days))} kunga yetadi` : `${r.name} — tugagan, 30 kunda ${fmtQty(q)} sotilgan`);
    out.notes.push('Bu taxmin: sotuv tezligi o‘zgarsa natija ham o‘zgaradi. Buyurtma qarorini o‘zingiz qabul qiling.');
    return out;
  }
  if (intent === 'expenses') {
    const cur = O.pnl(ops, month, today).expenses;
    const prev = O.pnl(ops, prevMonthStart, prevMonthEnd).expenses;
    out.title = 'Xarajatlar';
    out.text = `Bu oy xarajatlar: ${fmt(cur)}. O‘tgan oy: ${fmt(prev)}${pct(cur, prev) !== null && prev ? ` (${pct(cur, prev) >= 0 ? '+' : ''}${pct(cur, prev)}%)` : ''}.`;
    const byCat = new Map();
    for (const e of ops.entries) {
      if (e.type !== 'expense' && !(e.type === 'reversal' && e.reversedKind === 'expense')) continue;
      if (e.day < month || e.day > today || e.amountUzsMinor == null) continue;
      byCat.set(e.category || '—', (byCat.get(e.category || '—') || 0) + e.amountUzsMinor);
    }
    out.bullets = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: ${fmt(v)}`);
    const spikes = [];
    for (const [c, v] of byCat) {
      let pv = 0;
      for (const e of ops.entries) if (e.type === 'expense' && e.category === c && e.day >= prevMonthStart && e.day <= prevMonthEnd && e.amountUzsMinor != null) pv += e.amountUzsMinor;
      if (pv === 0 || v >= pv * 1.5) spikes.push(`${c}: ${fmt(v)}${pv ? ` (o‘tgan oy ${fmt(pv)})` : ' (o‘tgan oyda yo‘q)'}`);
    }
    if (spikes.length) out.notes.push('Keskin oshgan yoki yangi xarajat turlari: ' + spikes.join('; ') + '.');
    if (!byCat.size) out.notes.push('Bu oy xarajat kiritilmagan.');
    return out;
  }
  if (intent === 'compare') {
    const cur = O.pnl(ops, month, today), prev = O.pnl(ops, prevMonthStart, prevMonthEnd);
    out.title = 'Oylar solishtirmasi';
    out.text = `Daromad: ${fmt(cur.revenue)} (o‘tgan oy ${fmt(prev.revenue)}${pct(cur.revenue, prev.revenue) !== null && prev.revenue ? `, ${pct(cur.revenue, prev.revenue) >= 0 ? '+' : ''}${pct(cur.revenue, prev.revenue)}%` : ''}).`;
    out.bullets = [
      `Sof foyda: ${fmt(cur.netProfit)} (o‘tgan oy ${fmt(prev.netProfit)})`,
      `Xarajatlar: ${fmt(cur.expenses)} (o‘tgan oy ${fmt(prev.expenses)})`,
      `Sotuvlar: ${cur.sales} ta (o‘tgan oy ${prev.sales} ta)`,
    ];
    out.notes.push(`Bu oy hali tugamagan — ${today} gacha bo‘lgan ma’lumot.`);
    return out;
  }
  if (intent === 'cash') {
    const c = O.cashReport(ops, today, today, rates);
    out.title = 'Kassa qoldig‘i';
    if (!c.configured) { out.text = 'Kassa boshlang‘ich qoldig‘i kiritilmagan.'; return out; }
    out.text = `Kassada (UZS ekvivalenti): ${fmt(c.uzs.closing)}.`;
    out.bullets = Object.entries(c.byCurrency).map(([cc, v]) => `${cc}: ${fmtMoney(v.closing, cc)}; kutilayotgan to‘lov: ${v.pendingCount} ta`);
    out.notes.push('Qarz kassaga kirmaydi — faqat qabul qilingan va tasdiqlangan to‘lovlar hisobga olinadi.');
    return out;
  }
  out.title = 'Savolni tushunmadim';
  out.text = 'Quyidagilardan birini so‘rang:';
  out.bullets = EXAMPLES;
  return out;
}
function fmtMoney(minor, cur) {
  if (cur === 'UZS') return fmt(minor);
  const v = (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
  return `${v} ${cur}`;
}

module.exports = { answer, intentOf, norm, EXAMPLES, fmt };
