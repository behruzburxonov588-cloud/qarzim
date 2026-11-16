/* LOVE WORLD — content editor: edit every personal text, preview locally, export content.js */
(function () {
  'use strict';
  const OVERRIDE_KEY = 'loveworld.content.override';
  const PROGRESS_KEY = 'loveworld.progress.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const base = clone(window.LOVE_CONTENT || {});
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null'); } catch (e) { /* ignore */ }
  let data = stored ? Object.assign(clone(base), stored) : clone(base);
  let dirty = false;

  const ICONS = ['heart', 'star', 'moon', 'ring', 'music', 'sun', 'gift', 'infinity', 'camera', 'flower'];
  const SCHEMA = [
    { id: 'asosiy', title: 'Asosiy', desc: 'Ismlar va birga bo‘lgan sana. {herName} va {myName} matnlarda avtomatik almashtiriladi.', fields: [
      { k: 'herName', label: 'Uning ismi (sayt kim uchun)', type: 'text' },
      { k: 'myName', label: 'Sizning ismingiz (imzo)', type: 'text' },
      { k: 'startDate', label: 'Birga bo‘lgan kun va vaqt', type: 'datetime' },
      { k: 'siteTitle', label: 'Sayt nomi', type: 'text' },
      { k: 'entranceSubtitle', label: 'Kirish sahifasidagi jumla', type: 'text' }
    ] },
    { id: 'musiqa', title: 'Musiqa', desc: 'Bo‘sh qoldirsangiz, sehrli musiqa qutisi kuyi avtomatik chalinadi. O‘z qo‘shig‘ingiz uchun mp3 faylni music/ papkasiga qo‘yib, nomini yozing.', fields: [
      { k: 'music.src', label: 'Qo‘shiq fayli (masalan: music/qoshiq.mp3)', type: 'text', ph: 'music/bizning-qoshiq.mp3' },
      { k: 'music.volume', label: 'Ovoz balandligi', type: 'range', min: 0.1, max: 1, step: 0.05 }
    ] },
    { id: 'sarguzasht', title: 'Sirli parol', desc: 'Uchta darvoza topishmog‘i. Har to‘g‘ri javob bitta "sehrli so‘z" beradi; so‘zlar birga yakuniy parolni hosil qiladi.', fields: [
      { k: 'adventure.intro', label: 'Kirish matni', type: 'textarea' },
      { k: 'adventure.gates', label: 'Darvozalar', type: 'group', item: 'Darvoza', min: 1, max: 5,
        tpl: { title: 'Yangi darvoza', question: '', answers: [], hint: '', reward: '' },
        fields: [
          { k: 'title', label: 'Sarlavha', type: 'text' },
          { k: 'question', label: 'Topishmoq', type: 'textarea' },
          { k: 'answers', label: 'To‘g‘ri javoblar (vergul bilan)', type: 'csv', ph: 'yulduz, yulduzlar' },
          { k: 'hint', label: 'Maslahat', type: 'text' },
          { k: 'reward', label: 'Sehrli so‘z (parol bo‘lagi)', type: 'text' }
        ] },
      { k: 'adventure.lanternText', label: 'Fonar bosqichi matni', type: 'textarea' },
      { k: 'adventure.password', label: 'Yakuniy parol', type: 'text', check: 'password' },
      { k: 'adventure.passwordHint', label: 'Parol uchun izoh', type: 'text' }
    ] },
    { id: 'sabablar', title: '15 sabab', desc: 'Har bir sabab — bitta muhrlangan maktubcha. Soni istalgancha bo‘lishi mumkin (sarlavha avtomatik o‘zgaradi).', fields: [
      { k: 'reasons', label: 'Sabablar', type: 'list', item: 'Sabab', min: 1, max: 40 },
      { k: 'reasonsOutro', label: 'Hammasi ochilgandan keyingi so‘z', type: 'text' }
    ] },
    { id: 'xotiralar', title: 'Xotiralar kitobi', desc: 'Rasmni yuklang (fayl ichiga joylanadi) yoki photos/ papkasidagi fayl nomini yozing.', fields: [
      { k: 'bookTitle', label: 'Kitob nomi', type: 'text' },
      { k: 'memories', label: 'Sahifalar', type: 'group', item: 'Xotira', min: 1, max: 24,
        tpl: { date: '', title: 'Yangi xotira', text: '', photo: '', icon: 'heart' },
        fields: [
          { k: 'date', label: 'Sana', type: 'text' },
          { k: 'title', label: 'Sarlavha', type: 'text' },
          { k: 'text', label: 'Matn', type: 'textarea' },
          { k: 'photo', label: 'Rasm', type: 'image' },
          { k: 'icon', label: 'Rasm bo‘lmasa — bezak belgisi', type: 'select', options: ICONS }
        ] }
    ] },
    { id: 'maktub', title: 'Sevgi maktubi', desc: 'Maktub yozuv mashinkasi kabi harfma-harf paydo bo‘ladi.', fields: [
      { k: 'letter.greeting', label: 'Murojaat', type: 'text' },
      { k: 'letter.paragraphs', label: 'Xatboshilar', type: 'list', item: 'Xatboshi', min: 1, max: 20 },
      { k: 'letter.closing', label: 'Yakuniy so‘z', type: 'text' },
      { k: 'letter.signature', label: 'Imzo', type: 'text' }
    ] },
    { id: 'viktorina', title: 'Viktorina', desc: 'Savollar va javob variantlari. To‘g‘ri javob raqamini 1 dan boshlab yozing (bir nechta bo‘lsa: 3, 4).', fields: [
      { k: 'quiz.passPercent', label: 'O‘tish uchun kerakli foiz', type: 'number', min: 0, max: 100 },
      { k: 'quiz.questions', label: 'Savollar', type: 'group', item: 'Savol', min: 1, max: 20,
        tpl: { q: '', options: ['', '', '', ''], correct: 0, note: '' },
        fields: [
          { k: 'q', label: 'Savol', type: 'text' },
          { k: 'options', label: 'Variantlar', type: 'list', item: 'Variant', min: 2, max: 6, compact: true },
          { k: 'correct', label: 'To‘g‘ri javob raqami', type: 'correct' },
          { k: 'note', label: 'To‘g‘ri javobdan keyingi izoh', type: 'text' }
        ] }
    ] },
    { id: 'sozlar', title: 'So‘z sehri', desc: 'Aralashtiriladigan so‘zlar (2–9 harf eng yaxshi ishlaydi).', fields: [
      { k: 'words', label: 'So‘zlar', type: 'group', item: 'So‘z', min: 1, max: 12, tpl: { word: '', hint: '' },
        fields: [
          { k: 'word', label: 'So‘z', type: 'text' },
          { k: 'hint', label: 'Ishora', type: 'text' }
        ] }
    ] },
    { id: 'jumboq', title: 'Jumboq rasmi', desc: 'Bo‘sh qolsa, ismlaringiz yozilgan sehrli rasm chiziladi. Kvadrat rasm eng yaxshisi.', fields: [
      { k: 'puzzleImage', label: 'Jumboq rasmi', type: 'image' }
    ] },
    { id: 'sirli', title: 'Sirli xona', desc: 'Shamlar yonganda ochiladigan sir va sovg‘a qutisidagi sevgi kuponlari.', fields: [
      { k: 'secret.message', label: 'Eng katta sir', type: 'textarea' },
      { k: 'secret.coupons', label: 'Sevgi kuponlari', type: 'list', item: 'Kupon', min: 1, max: 16 }
    ] },
    { id: 'final', title: 'Buyuk final', desc: 'Kinematik qatorlar, savol va yakuniy so‘z.', fields: [
      { k: 'finale.lines', label: 'Kino qatorlari', type: 'list', item: 'Qator', min: 1, max: 14 },
      { k: 'finale.question', label: 'Asosiy savol', type: 'text' },
      { k: 'finale.yes', label: '"Ha" tugmasi', type: 'text' },
      { k: 'finale.no', label: '"Yo‘q" tugmasi (u qochib ketadi)', type: 'text' },
      { k: 'finale.noTaunts', label: '"Yo‘q" qochganda chiqadigan yozuvlar', type: 'list', item: 'Yozuv', min: 1, max: 10, compact: true },
      { k: 'finale.finalMessage', label: 'Yakuniy so‘z', type: 'text' },
      { k: 'finale.finalSignature', label: 'Imzo', type: 'text' }
    ] }
  ];

  /* ── path helpers ── */
  const get = (path, obj = data) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const set = (path, val) => {
    const ks = path.split('.');
    let o = data;
    ks.slice(0, -1).forEach((k, i) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[k];
    });
    o[ks[ks.length - 1]] = val;
    markDirty();
  };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʻʼ`'´"«».,!?;:()\-–—_\s]/g, '');

  /* ── rendering ── */
  function fieldHTML(f, path) {
    const v = get(path);
    const id = 'f_' + path.replace(/\./g, '_');
    const label = `<label class="ed-label" for="${id}">${esc(f.label)}</label>`;
    switch (f.type) {
      case 'text':
        return `<div class="ed-field">${label}<input class="field" id="${id}" data-path="${path}" value="${esc(v)}" placeholder="${esc(f.ph || '')}">${f.check ? `<p class="ed-check" data-check="${f.check}"></p>` : ''}</div>`;
      case 'textarea':
        return `<div class="ed-field">${label}<textarea class="field" id="${id}" data-path="${path}" rows="3">${esc(v)}</textarea></div>`;
      case 'number':
        return `<div class="ed-field ed-narrow">${label}<input class="field" type="number" id="${id}" data-path="${path}" data-num="1" min="${f.min}" max="${f.max}" value="${esc(v)}"></div>`;
      case 'range':
        return `<div class="ed-field">${label}<div class="ed-range"><input type="range" id="${id}" data-path="${path}" data-num="1" min="${f.min}" max="${f.max}" step="${f.step}" value="${esc(v == null ? 0.55 : v)}"><output>${Math.round((v == null ? 0.55 : v) * 100)}%</output></div></div>`;
      case 'datetime':
        return `<div class="ed-field">${label}<input class="field" type="datetime-local" id="${id}" data-path="${path}" value="${esc(String(v || '').slice(0, 16))}"></div>`;
      case 'select':
        return `<div class="ed-field">${label}<select class="field" id="${id}" data-path="${path}">${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
      case 'csv':
        return `<div class="ed-field">${label}<input class="field" id="${id}" data-path="${path}" data-csv="1" value="${esc((v || []).join(', '))}" placeholder="${esc(f.ph || '')}"></div>`;
      case 'correct': {
        const arr = Array.isArray(v) ? v : [v];
        return `<div class="ed-field ed-narrow">${label}<input class="field" id="${id}" data-path="${path}" data-correct="1" value="${esc(arr.map((n) => (+n || 0) + 1).join(', '))}" placeholder="1"></div>`;
      }
      case 'image': {
        const isData = String(v || '').startsWith('data:');
        return `<div class="ed-field">${label}
          <div class="ed-image">
            <span class="ed-thumb">${v ? `<img src="${esc(v)}" alt="">` : '<i>Rasm yo‘q</i>'}</span>
            <div class="ed-image-ctl">
              <input class="field" id="${id}" data-path="${path}" value="${isData ? '' : esc(v)}" placeholder="${isData ? 'Yuklangan rasm (fayl ichida)' : 'photos/1.jpg'}">
              <div class="ed-row">
                <label class="btn btn-ghost btn-sm ed-upload">Rasm yuklash<input type="file" accept="image/*" data-upload="${path}" hidden></label>
                ${v ? `<button class="btn btn-ghost btn-sm" type="button" data-clear="${path}">Olib tashlash</button>` : ''}
              </div>
            </div>
          </div></div>`;
      }
      case 'list': {
        const arr = Array.isArray(v) ? v : [];
        return `<div class="ed-field ed-list" data-list="${path}">${label}
          ${arr.map((s, i) => `<div class="ed-li"><span class="ed-n">${i + 1}</span>
            ${f.compact ? `<input class="field" data-path="${path}.${i}" value="${esc(s)}">` : `<textarea class="field" data-path="${path}.${i}" rows="2">${esc(s)}</textarea>`}
            <span class="ed-li-btns">
              <button type="button" class="ed-mini" data-move="${path}|${i}|-1" title="Yuqoriga" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="ed-mini" data-move="${path}|${i}|1" title="Pastga" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="ed-mini del" data-del="${path}|${i}" title="O‘chirish" ${arr.length <= (f.min || 0) ? 'disabled' : ''}>✕</button>
            </span></div>`).join('')}
          ${arr.length < (f.max || 99) ? `<button type="button" class="btn btn-ghost btn-sm ed-add" data-add="${path}">+ ${esc(f.item || 'Qo‘shish')} qo‘shish</button>` : ''}
          <p class="ed-count">${arr.length} ta</p></div>`;
      }
      case 'group': {
        const arr = Array.isArray(v) ? v : [];
        return `<div class="ed-group" data-list="${path}"><p class="ed-label">${esc(f.label)}</p>
          ${arr.map((item, i) => `<fieldset class="ed-item"><legend>${esc(f.item)} ${i + 1}</legend>
            <span class="ed-li-btns ed-item-btns">
              <button type="button" class="ed-mini" data-move="${path}|${i}|-1" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="ed-mini" data-move="${path}|${i}|1" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="ed-mini del" data-del="${path}|${i}" ${arr.length <= (f.min || 0) ? 'disabled' : ''}>✕</button>
            </span>
            ${f.fields.map((sf) => fieldHTML(sf, `${path}.${i}.${sf.k}`)).join('')}
          </fieldset>`).join('')}
          ${arr.length < (f.max || 99) ? `<button type="button" class="btn btn-ghost btn-sm ed-add" data-add="${path}">+ ${esc(f.item)} qo‘shish</button>` : ''}
        </div>`;
      }
    }
    return '';
  }
  const findField = (path) => {
    for (const s of SCHEMA) for (const f of s.fields) if (f.k === path) return f;
    for (const s of SCHEMA) for (const f of s.fields) if (f.type === 'group') for (const sf of f.fields) {
      const m = path.match(new RegExp('^' + f.k.replace(/\./g, '\\.') + '\\.(\\d+)\\.' + sf.k + '$'));
      if (m) return sf;
    }
    return null;
  };

  function renderSection(sec) {
    const el = $(`#sec-${sec.id}`);
    el.innerHTML = `<header class="ed-sec-head"><h2>${esc(sec.title)}</h2><p>${esc(sec.desc)}</p></header>${sec.fields.map((f) => fieldHTML(f, f.k)).join('')}`;
    checks();
  }
  function render() {
    $('#edNav').innerHTML = SCHEMA.map((s) => `<a href="#sec-${s.id}">${esc(s.title)}</a>`).join('');
    $('#edForm').innerHTML = SCHEMA.map((s) => `<section class="ed-sec glass" id="sec-${s.id}"></section>`).join('');
    SCHEMA.forEach(renderSection);
    status();
  }
  const sectionOf = (path) => SCHEMA.find((s) => s.fields.some((f) => path === f.k || path.startsWith(f.k + '.')));

  function checks() {
    const pwEl = $('[data-check="password"]');
    if (!pwEl) return;
    const rewards = ((data.adventure && data.adventure.gates) || []).map((g) => g.reward).filter(Boolean);
    const pw = data.adventure && data.adventure.password;
    const ok = norm(pw) === norm(rewards.join(' '));
    pwEl.className = 'ed-check ' + (ok ? 'ok' : 'warn');
    pwEl.textContent = ok
      ? `✓ Parol sehrli so‘zlar bilan mos: ${rewards.join(' + ')}`
      : `Eslatma: parol darvozalardagi sehrli so‘zlardan (${rewards.join(' + ') || '—'}) iborat bo‘lsa, topish osonroq. Hozirgi parol ham ishlaydi.`;
  }

  /* ── events ── */
  const form = () => $('#edForm');
  function onInput(e) {
    const t = e.target;
    const path = t.dataset.path;
    if (!path) return;
    let v = t.value;
    if (t.dataset.num) v = v === '' ? 0 : +v;
    if (t.dataset.csv) v = v.split(',').map((s) => s.trim()).filter(Boolean);
    if (t.dataset.correct) {
      const nums = v.split(/[,\s]+/).map((s) => parseInt(s, 10) - 1).filter((n) => n >= 0);
      v = nums.length > 1 ? nums : nums[0] || 0;
    }
    if (t.type === 'range') { const o = t.parentElement.querySelector('output'); if (o) o.textContent = Math.round(v * 100) + '%'; }
    const f = findField(path);
    if (f && f.type === 'image' && !v && String(get(path) || '').startsWith('data:')) return; // keep uploaded image
    set(path, v);
    if (path.startsWith('adventure.')) checks();
  }
  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add) {
      const path = b.dataset.add, f = findField(path);
      const arr = (get(path) || []).slice();
      arr.push(f && f.tpl ? clone(f.tpl) : '');
      set(path, arr);
      rerender(path);
    } else if (b.dataset.del) {
      const [path, i] = b.dataset.del.split('|');
      const arr = (get(path) || []).slice();
      arr.splice(+i, 1);
      set(path, arr);
      rerender(path);
    } else if (b.dataset.move) {
      const [path, i, d] = b.dataset.move.split('|');
      const arr = (get(path) || []).slice(), a = +i, z = a + +d;
      if (z < 0 || z >= arr.length) return;
      [arr[a], arr[z]] = [arr[z], arr[a]];
      set(path, arr);
      rerender(path);
    } else if (b.dataset.clear) {
      set(b.dataset.clear, '');
      rerender(b.dataset.clear);
    }
  }
  function rerender(path) {
    const sec = sectionOf(path);
    if (!sec) return;
    const y = window.scrollY;
    renderSection(sec);
    window.scrollTo(0, y);
  }
  function onFile(e) {
    const t = e.target;
    if (!t.dataset.upload || !t.files || !t.files[0]) return;
    const path = t.dataset.upload;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1000, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        set(path, c.toDataURL('image/jpeg', 0.84));
        rerender(path);
        toast('Rasm qo‘shildi');
      };
      img.onerror = () => toast('Bu rasmni o‘qib bo‘lmadi');
      img.src = reader.result;
    };
    reader.readAsDataURL(t.files[0]);
  }

  /* ── actions ── */
  function markDirty() { dirty = true; status(); }
  function status() {
    const s = $('#edStatus');
    if (!s) return;
    const size = new Blob([JSON.stringify(data)]).size;
    s.innerHTML = `${dirty ? '<b class="warn">Saqlanmagan o‘zgarishlar</b>' : stored ? 'Brauzerda saqlangan tahrir ishlatilmoqda' : 'Asl content.js ko‘rsatilmoqda'} · ${(size / 1024).toFixed(0)} KB`;
  }
  function save() {
    try {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data));
      stored = data;
      dirty = false;
      status();
      return true;
    } catch (e) {
      toast('Brauzer xotirasi to‘ldi (rasmlar juda katta). content.js ni yuklab oling — u cheklovsiz ishlaydi.', 6000);
      return false;
    }
  }
  function download() {
    const stamp = new Date().toLocaleString('uz-UZ');
    const text = `/*\n * LOVE WORLD — shaxsiy matnlar fayli.\n * editor.html orqali yaratildi: ${stamp}\n * Bu faylni love-world papkasidagi content.js o‘rniga qo‘ying.\n */\nwindow.LOVE_CONTENT = ${JSON.stringify(data, null, 2)};\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript;charset=utf-8' }));
    a.download = 'content.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('content.js yuklab olindi — uni love-world papkasiga qo‘ying');
  }
  let tt;
  function toast(msg, ms = 3200) {
    const t = $('#edToast');
    t.textContent = msg;
    t.classList.add('in');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('in'), ms);
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    form().addEventListener('input', onInput);
    form().addEventListener('change', (e) => { onFile(e); if (e.target.tagName === 'SELECT') onInput(e); });
    form().addEventListener('click', onClick);
    $('#edSave').addEventListener('click', () => { if (save()) toast('Saqlandi! Sayt shu brauzerda yangi matnlar bilan ochiladi.'); });
    $('#edPreview').addEventListener('click', () => { if (save()) window.open('index.html', '_blank'); });
    $('#edDownload').addEventListener('click', download);
    $('#edRevert').addEventListener('click', () => {
      if (!confirm('Brauzerdagi barcha tahrirlar o‘chirilib, content.js dagi asl matnlar qaytariladi. Davom etasizmi?')) return;
      localStorage.removeItem(OVERRIDE_KEY);
      stored = null;
      data = clone(base);
      dirty = false;
      render();
      toast('Asl matnlar qaytarildi');
    });
    $('#edUnlock').addEventListener('click', () => {
      let p = {};
      try { p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (e) { /* ignore */ }
      p.unlocked = true;
      p.adv = { step: 99 };
      p.keys = {};
      ['yurak-ovchisi', 'juftliklar', 'viktorina', 'yulduzlar', 'jumboq', 'soz-sehri', 'kupidon'].forEach((k) => (p.keys[k] = true));
      p.secret = Object.assign({ coupons: [], wishes: [] }, p.secret || {}, { opened: true, candles: true });
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
      toast('Barcha bo‘limlar shu brauzerda ochildi (oldindan ko‘rish uchun)');
    });
    $('#edReset').addEventListener('click', () => {
      if (!confirm('Shu brauzerdagi o‘yin taraqqiyoti (kalitlar, ochilgan sabablar va h.k.) tozalanadi. Davom etasizmi?')) return;
      localStorage.removeItem(PROGRESS_KEY);
      toast('Taraqqiyot tozalandi — sarguzasht boshidan boshlanadi');
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  });
})();
