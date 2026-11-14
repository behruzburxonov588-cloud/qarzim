'use strict';
/* Qarzim — haqiqiy .xlsx (Office Open XML) yozish va o'qish. Paketlarsiz: zlib + qo'lda ZIP.
 * Yozish: ZIP "store" (siqilmagan), CRC32, inline string va raqamlar.
 * O'qish: faqat birinchi varaq; ZIP markazi, deflate (inflateRawSync); XML — faqat kerakli teglar.
 * Himoya: hajm va qator chegaralari, DOCTYPE/ENTITY rad etiladi, shifrlangan fayl rad etiladi.
 */
const zlib = require('zlib');

const MAX_FILE = 2 * 1024 * 1024;        // yuklanadigan fayl: 2 MB
const MAX_UNPACKED = 20 * 1024 * 1024;   // ochilgandan keyingi umumiy hajm
const MAX_ROWS = 5000, MAX_COLS = 60, MAX_CELL = 500;

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- yozish ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
/** Formula in'ektsiyasi himoyasi: matn "=", "+", "-", "@" bilan boshlansa, oldiga ' qo'yiladi. */
const guard = (s) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

function cellXml(v, ref, header) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  const text = guard(String(v).slice(0, MAX_CELL));
  return `<c r="${ref}"${header ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}
/**
 * sheets: [{ name, rows: [[...]], widths?: [..], headerRows?: 1 }]
 * Qaytaradi: Buffer (.xlsx)
 */
function writeXlsx(sheets) {
  const parts = [];
  const add = (name, text) => parts.push({ name, data: Buffer.from(text, 'utf8') });
  add('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>');
  add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>');
  add('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>');
  add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
    '</styleSheet>');
  sheets.forEach((s, si) => {
    const rows = (s.rows || []).slice(0, MAX_ROWS + 1);
    const hdr = s.headerRows === undefined ? 1 : s.headerRows;
    const cols = s.widths ? '<cols>' + s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const body = rows.map((r, ri) => {
      const cells = (r || []).slice(0, MAX_COLS).map((v, ci) => cellXml(v, colName(ci) + (ri + 1), ri < hdr)).join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join('');
    const pane = hdr > 0 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + hdr + '" topLeftCell="A' + (hdr + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    add(`xl/worksheets/sheet${si + 1}.xml`, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + pane + cols + '<sheetData>' + body + '</sheetData></worksheet>');
  });
  return zipStore(parts);
}
function zipStore(parts) {
  const locals = [], central = [];
  let offset = 0;
  for (const p of parts) {
    const name = Buffer.from(p.name, 'utf8');
    const crc = crc32(p.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(p.data.length, 18); lh.writeUInt32LE(p.data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, p.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(p.data.length, 20); ch.writeUInt32LE(p.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + p.data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(parts.length, 8); eocd.writeUInt16LE(parts.length, 10); eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...central, eocd]);
}

// ---------- o'qish ----------
function unxml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 && n !== 0 ? String.fromCodePoint(n) : ''; }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
  });
}
/** ZIP markazidan fayllarni ajratadi. Chegaralar va xavfsizlik tekshiruvi bilan. */
function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.length > MAX_FILE) throw new Error('fayl hajmi noto‘g‘ri (2 MB gacha)');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Excel fayli emas (ZIP topilmadi)');
  const count = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16);
  if (count > 200) throw new Error('Fayl tarkibi juda katta');
  const files = {};
  let p = cdOff, total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP markazi buzilgan');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (flags & 0x1) throw new Error('Shifrlangan Excel fayli qabul qilinmaydi');
    total += usize;
    if (total > MAX_UNPACKED) throw new Error('Fayl ochilganda juda katta bo‘ladi');
    if (usize > 0 && csize > 0 && usize / csize > 200) throw new Error('Fayl tuzilishi shubhali');
    if (!/^(xl\/|\[Content_Types\]|_rels\/)/.test(name)) continue;
    if (name.length > 200 || name.includes('..')) throw new Error('Fayl nomi noto‘g‘ri');
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('ZIP ma’lumoti buzilgan');
    const nl = buf.readUInt16LE(lho + 26), el = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + nl + el, lho + 30 + nl + el + csize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = zlib.inflateRawSync(data, { maxOutputLength: usize + 1024 });
    else throw new Error('Qo‘llab-quvvatlanmaydigan siqish usuli');
    files[name] = out.toString('utf8');
  }
  return files;
}
const bad = (s) => /<!DOCTYPE|<!ENTITY/i.test(s);
/** Birinchi varaqni qatorlar massivi sifatida qaytaradi: [[...], ...] (qiymatlar string yoki number). */
function readXlsx(buf) {
  const files = readZip(buf);
  for (const k of Object.keys(files)) if (bad(files[k])) throw new Error('XML xavfsizlik talabiga javob bermaydi');
  const wb = files['xl/workbook.xml'] || '';
  const rels = files['xl/_rels/workbook.xml.rels'] || '';
  const m = /<sheet [^>]*?r:id="([^"]+)"/.exec(wb);
  let target = 'xl/worksheets/sheet1.xml';
  if (m) {
    const r = new RegExp('<Relationship[^>]*Id="' + m[1] + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + m[1] + '"').exec(rels);
    if (r) target = 'xl/' + r[1].replace(/^\/?xl\//, '');
  }
  const sheetXml = files[target];
  if (!sheetXml) throw new Error('Varaq topilmadi');
  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    for (const si of files['xl/sharedStrings.xml'].matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(unxml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    }
  }
  const rows = [];
  for (const rm of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) throw new Error(`Qatorlar soni ${MAX_ROWS} tadan oshmasin`);
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      const ci = ref ? ref[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1 : row.length;
      if (ci >= MAX_COLS) continue;
      const t = /\bt="([^"]+)"/.exec(attrs);
      const type = t ? t[1] : 'n';
      let val = '';
      if (type === 's') { const v = /<v>([\s\S]*?)<\/v>/.exec(inner); val = v ? shared[Number(v[1])] || '' : ''; }
      else if (type === 'inlineStr') { val = unxml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')); }
      else if (type === 'str') { const v = /<v>([\s\S]*?)<\/v>/.exec(inner); val = v ? unxml(v[1]) : ''; }
      else if (type === 'b') { const v = /<v>([\s\S]*?)<\/v>/.exec(inner); val = v && v[1] === '1' ? 'ha' : 'yo‘q'; }
      else { const v = /<v>([\s\S]*?)<\/v>/.exec(inner); if (v) { const n = Number(v[1]); val = Number.isFinite(n) ? n : unxml(v[1]); } }
      while (row.length < ci) row.push('');
      row[ci] = typeof val === 'string' ? val.slice(0, MAX_CELL) : val;
    }
    rows.push(row);
  }
  return rows;
}

module.exports = { writeXlsx, readXlsx, readZip, zipStore, crc32, colName, guard, MAX_FILE, MAX_ROWS };
