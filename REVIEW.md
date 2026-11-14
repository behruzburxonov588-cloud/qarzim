# Qarzim — kod va dizayn tekshiruvi

Tekshirilgan: `server.js`, `lib/*`, `admin.html`, `sw.js`, `qarz-daftar.html` (≈4000 qator JS va CSS). Ilova brauzerda telefon (390 px) va kompyuter (1280 px) o'lchamida ishga tushirildi.
`npm test` — 101 ta tekshiruvning hammasi o'tadi, lekin quyidagi muammolarning ko'pini testlar ushlamaydi.

Yo'llar `qarz-daftar-app-v13-fix2/qarz-daftar-app/` papkasiga nisbatan.

## 🔴 Jiddiy xatolar

1. **Sana funksiyalari haqiqiy telefonlarda buziladi.** `todayStr().slice(0,10)` ISO sana deb ishlatiladi (`qarz-daftar.html:2000, 2051, 2288, 3474, 3487`), aslida u `"14/11/2026"` ko'rinishida chiqadi. To'liq lokal ma'lumotli brauzerda tekshirildi:
   - muddati o'tgan va'da "buzildi" o'rniga "kutilmoqda" bo'lib qoladi;
   - va'da sanasi tugmalari `NaN-NaN-NaN` beradi;
   - to'lov formasidagi sana maydoni bo'sh chiqadi, o'tgan sana bilan yozish oyning ayrim kunlaridagina ishlaydi;
   - "bugun to'lash kuni" eslatmasi hech qachon chiqmaydi.

   Testlarda ko'rinmagan, chunki test brauzerida `uz-UZ` lokal ma'lumoti yo'q va u tasodifan ISO formatini qaytaradi. Yechim: hamma joyda `todayISO()`.
2. **Hisobni o'chirish serverda ishlamaydi** (`qarz-daftar.html:3415`). So'rov `X-Qd-User`/`X-Qd-Auth` sarlavhalarisiz yuboriladi → 401, xato jimgina yutiladi. Ilova "Hisob o'chirildi" deydi, ma'lumot serverda qoladi va qayta kirilsa qaytadi.
3. **Admin sahifasida summa noto'g'ri o'qiladi** (`admin.html:32`). HTML ichidagi `/\\D/g` raqam bo'lmagan belgini emas, `\D` matnini qidiradi. "500 000" → `parseInt` = 500 → 3 ta SMS krediti.
4. **`data.json` buzilsa, butun baza o'chadi** (`server.js:87`). JSON xatosida server bo'sh DB bilan ishga tushadi va birinchi `save()` faylni bo'sh holat bilan qayta yozadi. "Fayl yo'q" va "fayl buzilgan" holatlari ajratilishi kerak.
5. **Katta so'rovlarda o'zbekcha harflar buzilishi mumkin** (`server.js:690`). `readBody` da `s += c` har bo'lakni alohida matnga aylantiradi; ko'p baytli harf bo'lak chegarasiga tushsa, buziladi. Bo'laklarni `Buffer` sifatida yig'ish kerak.
6. **`/api/sms/settings` istalgan so'rovda sozlamalarni tiklaydi** (`server.js:1133`). Metod tekshirilmaydi; GET yoki to'liq bo'lmagan POST avto-SMS/qo'ng'iroqni o'chiradi va `contact_phone` ni bo'shatadi.
7. **Chek fayli topilmasa, so'rov osilib qoladi** (`server.js:1073`). Sarlavhalar fayl tekshirilishidan oldin yuboriladi, `createReadStream` xatosi ushlanmaydi.

## 🟠 O'rta darajadagi muammolar

8. **Kassa qoldig'i o'tgan davr uchun noto'g'ri** (`lib/ops.js:705`): `cashReport().uzs.closing` davr oxirini hisobga olmaydi, `byCurrency.closing` oladi.
9. **AI "qoldiq kam" savolini kassa deb tushunadi** (`lib/ai.js`, `intentOf`).
10. **AI xato bersa, "Yuborish" tugmasi o'chiq qoladi** (`qarz-daftar.html:5343`).
11. **Esc Ombor panelini yopmaydi** — `onKey` hech qayerga ulanmagan.
12. **Kutilayotgan to'lovlarda mijoz nomi o'rniga ichki ID chiqadi** (`:4958`, `r.refClient`).
13. **Demo rejim aslida saqlaydi** — V4 `saveShopData` da `S.demo` tekshiruvi yo'q.
14. **FAQ noto'g'ri va'da beradi** (`:4246`): tiklashdan oldin zaxira olinmaydi; tiklash faylda yo'q yozuvlarni bulut orqali hamma qurilmadan o'chiradi.
15. **Takroriy so'rovdan himoya ishlamaydi** — `opId` har yuborishda yangi; qayta bosilsa xarajat/kirim ikki marta yoziladi.
16. **Sinxronlash qotib qolishi mumkin** — `cloudSync` dagi `fetch` larda vaqt chegarasi yo'q (`busy=true` qoladi).
17. **403 dan keyin ma'lumot ajralib qoladi** — rad etilgan o'zgarish telefonda qoladi, serverga yetmaydi.
18. **Saqlanmagan sotuvlar qayta yuborilishi mumkin** — `mergeItems` da tranzaksiya serverdagi eski nusxa bilan ustma-ust yoziladi.
19. **SMS takrorlanishi mumkin** (`server.js:314, 319`) — takror tekshiruvi 2000 tagacha qisqartiriladigan `a.log` ga tayanadi.
20. **Har API so'rovida sinxron `scryptSync`** — server ishini bloklaydi.
21. **CORS'da `DELETE` yo'q** (`server.js:1285`) — Capacitor ilovasida xodimni o'chirish ishlamaydi.
22. **Xavfsizlik:** parol "xeshi" tez `cyrb53` va u o'zi login vazifasini bajaradi (`localStorage` da); PIN (4 xona) va tiklash kodi (6 xona) shu xesh bilan; eng qisqa parol 4 belgi.
23. **Turli valyutalar qo'shib yuboriladi** — "X kundan beri kirmagansiz" jami summasi, `debtSummary`, `computeMonthly`.
24. **Excel importida qator raqami noto'g'ri** (`lib/xlsx.js`) — bo'sh qatorlar tashlanadi; `<row/>` keyingi qatorni "yutishi" mumkin.
25. **Kvitansiya 1000 px dan uzun bo'lsa, pasti kesiladi** (`makeReceipt`).
26. **Narx maydonlari:** ayrim maydonlarda (`newDebt` va boshqalar) kasr/tekshiruv qayta ko'rib chiqilishi kerak.

## 🟡 Dizayn va UX

27. **Bir xil qarz turli ishora bilan:** bosh sahifada "+1 250 000", Hisobot → "Mijozlar faolligi" da "−1 250 000 so'm" (`qdTxRow`).
28. **Raqamlar qatorlarga bo'linadi:** "0 / 1 250 / 000 so'm", "2026- / 11-14" — `&nbsp;` kerak.
29. **Shriftlar aralash:** kartochka va grafik matni JetBrains Mono, qolgani Plus Jakarta.
30. **Sana formati turlicha:** "14-noyabr, 2026", "2026-11-14 • 15:30", "14.11", "14/11/2026".
31. **Telefon raqami formatlanmagan:** "901112233".
32. **$ ekvivalenti hamma joyda**, foydalanuvchi faqat so'm ishlatsa ham.
33. **"Qolgan qarz" grafigi chalg'itadi** — 0 → 1.25 mln qiya chiziq.
34. **Hisobot tablari kesiladi** ("Mu…"), aylantirish belgisi yo'q.
35. **Kalkulyator tugmasi kartochka ustiga tushadi**, ikki suzuvchi tugma ustma-ust.
36. **Ombor paneli boshqa uslubda:** alohida mavzu (sukut bo'yicha qorong'i), logo o'rniga "Q" harfi.
37. **Versiya uch xil:** "Qarzim · v4", `APP_VERSION='1.0.0'`, hujjatlarda v13; `theme-color` doim qora.
38. **Klaviatura/a11y:** `#userChip` oddiy `div`; `.mk-sw` `span`, `tabindex` yo'q; mavzu tugmasida `aria-label` yo'q; toastda `aria-live` yo'q.
39. **Kurs zaxira qiymatlari qotirilgan** (`RATE_DEF`, USD 11 900), foydalanuvchi bilmaydi.
40. **Matnlar mos emas:** PIN tugmasi / FAQ / README turlicha; README "paket yo'q" deydi, Eslatma markazi paket sotadi; to'lovda ham "Olingan sana"; Ombor hisobotida do'kon nomi doim "Qarzim" (`/me` `username` qaytarmaydi).
41. **Kunlik eslatma soati uch xil:** standart 19/10, oraliq 6–20/8–20, interfeysda 17–20.

## ⚪ Kod sifati

42. **Qatlam-qatlam o'zgartirishlar** (V4…V10, v11): `fmt`, `render`, `renderReportSection` 2–4 marta qayta yozilgan; 14 ta `MutationObserver` butun `body` ni kuzatadi; "so'm" regex bilan almashtiriladi — sekin va mo'rt.
43. **Ishlatilmaydigan kod:** `avatarGrad` dagi `return` dan keyingi qism, `if(1)return`, bo'sh `syncNow`/`decoSms`, coral/teal tokenlari, `lev`.
44. **Hisobot:** `qdPeriodSum` har kun uchun barcha yozuvlarni qayta o'giradi; xarajat turlari faqat oxirgi 200 jurnal qatoridan hisoblanadi.
45. **Mayda:** `URL.createObjectURL` bo'shatilmaydi; `wipeLocal` ayrim kalitlarni qoldiradi; admin yangilik rasmini o'chira olmaydi; `.env` izohlari qiymatga qo'shiladi.

## Tavsiya etilgan tartib

Avval 1–7, keyin 27–30 va 8–15-bandlar.
