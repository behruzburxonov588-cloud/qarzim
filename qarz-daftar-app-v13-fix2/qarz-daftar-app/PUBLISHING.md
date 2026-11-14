# Play Market va App Store'ga chiqarish

> **Eslatma:** server va deploy bo'yicha yangi ko'rsatmalar `DEPLOY.md` da. Chiqarishdan oldin `DEPLOY.md` dagi "Launch-readiness checklist" bandlarini bajaring.

## 0. Avval bilib qo'ying (halol ogohlantirish)
1. **Ilova ichida to'lov yo'q.** SMS o'z SIM kartangizdan ketadi, kredit sotilmaydi, shuning uchun Apple/Google to'lov (IAP/Billing) talabi sizga tegmaydi. Ilova bepul bo'lsa yoki obuna qo'ymasangiz, bu qism oson.
2. **Apple "minimal funksionallik" (4.2).** Faqat sayt o'rovi bo'lgan ilovalar rad etilishi mumkin. Bildirishnoma, oflayn ishlash, kamera/fayl kabi qurilma imkoniyatlari qo'shilsa omadingiz oshadi.
3. "Xatosiz" kafolat bera olmayman: men brauzerda sinadim. Haqiqiy telefonlarda (SMS ilovasi ochilishi, Face ID) va do'kon tekshiruvidan o'tkazib ko'rish shart.
4. O'zbekistonlik dasturchi Google Play'da pullik/savdo funksiyalaridan foydalana oladimi — Google Play Console'da tekshiring (Apple'da ham soliq/bank ma'lumotlari kerak).

## 1. Serverni internetga qo'yish (shart)
- **Ma'lumot ham shu serverda saqlanadi** (`data.json`), shuning uchun server doim ishlab turishi va zaxiralanishi shart. O'zbekistondagi VPS tavsiya etiladi (shaxsiy ma'lumotlarni mamlakat ichida saqlash talabi; yurist bilan tekshiring).
- Serverni `https` li hostingga qo'ying (VPS: Node 18+, `node server.js`, Nginx/Caddy orqali HTTPS). Kompyuteringizda emas, doim ishlab turishi kerak.
- `env.txt`: `ADMIN_KEY` (uzun maxfiy), `PRIVACY_OWNER`, `PRIVACY_CONTACT`, `TELEGRAM_BOT_TOKEN`, `TRUST_PROXY=1` (proksi orqasida), (Eskiz kerak emas).
- `data.json` ni muntazam zaxiralang (server har 6 soatda `.bak` yozadi, lekin boshqa joyga ham nusxa oling).
- Tekshiring: `https://SIZNING-SAYT/privacy` ochiladi.

## 2. Eng oson yo'l: PWA (do'konsiz)
Telefonda saytni oching → "Bosh ekranga qo'shish". Manifest, ikonkalar va oflayn rejim tayyor. Avval shundan boshlab, mijozlar bilan sinab ko'ring.

## 3. Android (Google Play)
**Variant A — TWA (Bubblewrap):** kompyuteringizda Node + JDK + Android SDK kerak.
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://SIZNING-SAYT/manifest.webmanifest
bubblewrap build
```
Chiqqan `.aab` ni Play Console'ga yuklang. Keyin imzo barmoq izini (SHA-256) `/.well-known/assetlinks.json` ga yozing (fayl serverda tayyor shablon; ichidagi package nomi va SHA ni almashtiring).
**Variant B — Capacitor** (iOS bilan bir xil kod): pastga qarang.

## 4. iOS (App Store) — Mac, Xcode va Apple Developer ($99/yil) kerak
```
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Qarzim" uz.qarzdaftar.app --web-dir=www
mkdir www && cp qarz-daftar.html www/index.html
```
`www/index.html` ichida `window.QD_API_BASE='https://SIZNING-SAYT'` ni qo'ying (ilova serverga shu manzil orqali ulanadi; server `capacitor://localhost` ga CORS ruxsat beradi). Keyin `npx cap add ios && npx cap open ios`, Xcode'da imzolab App Store Connect'ga yuklang. Ikonka: `icons/store-1024.png`.
Eslatma: Capacitor ichida brauzer push (VAPID) ishlamaydi; native bildirishnoma uchun `@capacitor/push-notifications` + Firebase/APNs alohida sozlanadi (bu qo'shimcha ish).

## 5. Do'kon sahifasi ro'yxati
- Maxfiylik siyosati URL: `https://SIZNING-SAYT/privacy`.
- Google "Data safety" va Apple "Privacy nutrition": telefon raqami, ism, qarz yozuvlari saqlanadi; SMS foydalanuvchining o'z telefonidan yuboriladi; uchinchi tomon — Telegram (ixtiyoriy).
- Hisobni ilova ichida o'chirish: bor (Sozlamalar → Hisobni o'chirish). Google ham, Apple ham shuni talab qiladi.
- Skrinshotlar (telefon o'lchamida), qisqa va to'liq tavsif, yosh reytingi, aloqa emaili.
- Apple uchun sinov hisobi (login/parol) review izohiga yozing.
- Mijozlarga SMS yuborish uchun ularning roziligi: ilovada "SMS yubormaslik" belgisi bor; mahalliy qonunchilikni tekshiring.

## 6. Tavsiya etilgan tartib
1. Hostingga qo'yish.
2. PWA bilan 5–10 do'konchida sinov.
3. Android TWA → Play Market (odatda osonroq).
4. Natijaga qarab iOS.
