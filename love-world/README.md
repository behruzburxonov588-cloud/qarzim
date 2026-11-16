# 💖 LOVE WORLD — Sayyora uchun sehrli olam

Bu sevgilingiz uchun maxsus yaratilgan, o‘zbek tilidagi interaktiv romantik sayt. Hech qanday server, dastur yoki o‘rnatish talab qilinmaydi: `index.html` faylini brauzerda ochish kifoya.

## Saytda nimalar bor

| Bo‘lim | Tavsif |
|---|---|
| **Sehrli kirish** | Yulduzli osmon, oy, «LOVE WORLD» yozuvi va ochiladigan sehrli eshik. Musiqa bilan yoki jimjitlikda kirish mumkin. |
| **Sirli parol sarguzashti** | 3 ta topishmoq-darvoza → fonar bilan qorong‘i bog‘da oltin kalitni topish → yakuniy qulf. Har darvoza bitta «sehrli so‘z» beradi (SEN + VA + MEN), ular birga parolni hosil qiladi. |
| **Sehrli olam xaritasi** | Barcha bo‘limlar, kalitlar soni va «Biz birgamiz» jonli hisoblagichi (kun, soat, daqiqa, soniya). |
| **7 ta o‘yin** | Yurak ovchisi · Xotira juftliklari · Sevgi viktorinasi · Yulduzlar turkumi · Sehrli jumboq · So‘z sehri · Kupidon o‘qi. Har biri bitta sehrli kalit beradi. |
| **15 sabab** | «Seni sevishimning 15 sababi» — mumli muhrlar ortidagi qo‘lyozma maktubchalar. |
| **Xotiralar kitobi** | Haqiqiy varaqlanadigan 3D kitob (kompyuterda ikki sahifa, telefonda bitta), rasmlar bilan. |
| **Sevgi maktubi** | Mum muhrini sindirish → konvert ochiladi → maktub yozuv mashinkasi kabi yoziladi. |
| **Sirli xona** | 7 ta kalit bilan ochiladi: 7 sham, yashirin sir, sovg‘a qutisi, sevgi kuponlari va «Orzular bankasi». |
| **Buyuk final** | Kinematik sahna: hikoya qatorlari, yulduzlar oqimi, zarrachalardan yasalgan yurak, ismlar, savol («Yo‘q» tugmasi qochib ketadi 😄) va mushaklar. |

Qo‘shimcha: musiqa (o‘z qo‘shig‘ingiz yoki avtomatik sehrli kuy), ovoz effektlari, «yengil animatsiya» rejimi, taraqqiyot avtomatik saqlanadi (brauzerda), telefon va kompyuterga to‘liq moslashgan.

## Shaxsiylashtirish

### 1-usul: tahrirlash sahifasi (oson)
1. `editor.html` ni brauzerda oching.
2. Ism, sana, topishmoqlar, 15 sabab, xotiralar (rasm yuklash ham mumkin), maktub, viktorina, so‘zlar, kuponlar va final matnlarini o‘zgartiring.
3. **«Saqlash va ko‘rish»** — sayt shu brauzerda yangi matnlar bilan ochiladi. **«Hammasini ochib ko‘rish»** o‘yinlarni o‘ynamasdan barcha bo‘limlarni ko‘rsatadi.
4. **«content.js ni yuklab olish»** — yuklangan faylni `love-world/content.js` o‘rniga qo‘ying.
5. Yuborishdan oldin shu brauzerda **«O‘yin taraqqiyotini tozalash»** ni bosing.

> Tahrirlar avval faqat *sizning* brauzeringizda saqlanadi. Sevgilingizning telefonida ko‘rinishi uchun yuklab olingan `content.js` ni almashtirish shart.

### 2-usul: `content.js` ni to‘g‘ridan-to‘g‘ri tahrirlash
Faylda har bir maydon o‘zbekcha izoh bilan yozilgan. Faqat qo‘shtirnoq ichidagi matnni o‘zgartiring. `{herName}` va `{myName}` avtomatik ismlarga almashtiriladi.

**Albatta tekshiring:** `myName` (sizning ismingiz — imzolarda chiqadi), `startDate` (birga bo‘lgan kuningiz) va `memories` (xotiralar sanasi va matni).

### Rasmlar va musiqa
- Rasmlarni `photos/` papkasiga qo‘ying va `content.js` dagi xotiraga `photo: "photos/1.jpg"` deb yozing (yoki editor orqali yuklang).
- O‘z qo‘shig‘ingiz: mp3 faylni `music/` papkasiga qo‘ying va `music.src` ga `"music/qoshiq.mp3"` deb yozing. Bo‘sh qolsa, sehrli musiqa qutisi kuyi chalinadi.

## Joylash (internetga chiqarish)

### Cloudflare (tavsiya etiladi)
`love-world/wrangler.jsonc` tayyor: sayt **alohida** `love-world` nomli Worker bo‘lib chiqadi, Qarzim ilovasiga tegmaydi. `editor.html`, testlar va README saytga chiqmaydi (`.assetsignore`).

**A) GitHub orqali (token kerak emas):**
1. Cloudflare → **Workers & Pages → Create → Import a repository** → GitHub’dan `qarzim` ni tanlang.
2. Project name: `love-world`.
3. **Advanced settings → Root directory:** `love-world`. Build command — bo‘sh. Deploy command — `npx wrangler deploy`.
4. **Deploy** ni bosing. Manzil: `https://love-world.<sizning-subdomeningiz>.workers.dev`.
5. Agar `love-world` papkasi hali `main` tarmog‘ida bo‘lmasa, loyiha sozlamalarida (Settings → Build → Branch control) production branch sifatida shu papka bor tarmoqni tanlang.

Shundan keyin GitHub’ga har push qilganingizda sayt avtomatik yangilanadi.

**B) Kompyuterdan:**
```bash
cd love-world
npx wrangler login
npx wrangler deploy
```

### Boshqa variantlar
- **Netlify Drop** (app.netlify.com/drop) — papkani sudrab tashlang, havola tayyor.
- Yoki shunchaki papkani telefonga/kompyuterga ko‘chirib, `index.html` ni oching (editor bilan birga ishlaydi).

Sevgilingizga faqat `index.html` manzilini yuboring (`editor.html` emas — u yerda javoblar ko‘rinadi).

## Tuzilishi

```
love-world/
├── index.html          # sayt
├── content.js          # BARCHA shaxsiy matnlar
├── editor.html         # tahrirlash sahifasi
├── css/style.css       # dizayn tizimi
├── css/editor.css
├── js/core.js          # router, saqlash, ikonlar, osmon, effektlar, oynalar
├── js/audio.js         # generativ musiqa va ovoz effektlari (WebAudio)
├── js/screens/         # kirish, sarguzasht, xarita, sabablar, kitob, maktub, sirli xona, final
├── js/games/           # o‘yin ramkasi + 7 ta o‘yin
├── photos/  music/     # rasmlaringiz va qo‘shig‘ingiz uchun
└── tests/e2e.js        # to‘liq avtomatik test
```

## Test

To‘liq end-to-end test butun sarguzashtni haqiqiy brauzerda o‘tadi: kirish, parol, 7 ta o‘yinning hammasini simulyatsiya qilingan sichqoncha/teginish bilan yutadi, barcha bo‘limlar, sozlamalar, editor, hamda iPhone 13 va Galaxy S9+ o‘lchamlarida tekshiradi va konsol xatolari yo‘qligini talab qiladi.

```bash
npm install --no-save playwright && npx playwright install chromium
node love-world/tests/e2e.js            # hammasi
node love-world/tests/e2e.js desktop    # yoki: phone | editor
SHOTS=./shots node love-world/tests/e2e.js   # skrinshotlar bilan
```
