# Qarzim

> **Yangi versiya:** o'rnatish, deploy, muhit o'zgaruvchilari, rollar va integratsiya holati uchun `DEPLOY.md` ga qarang. Nimalar o'zgarganini `CHANGES.md` da ko'ring. `env.txt` ni hech qachon git ga qo'shmang; shablon — `env.example.txt`.

Do'konchilar uchun qarz daftari. Hamma ma'lumot telefonda saqlanadi. Server ixtiyoriy: u faqat Telegram bot, kunlik bildirishnoma va valyuta kurslari uchun kerak.

## Eng oddiy ishga tushirish
`qarz-daftar.html` ni brauzerda oching. Bu holda ma'lumot faqat shu telefonda saqlanadi (bulut ishlamaydi). Telefon yo'qolsa ma'lumot ketadi, shuning uchun haqiqiy ishlatishda pastdagi serverdan foydalaning.

## Server bilan (bildirishnoma, Telegram, kurslar)
1. [nodejs.org](https://nodejs.org) dan Node.js 18+ o'rnating.
2. VS Code → File → Open Folder → shu papka → Terminal: `npm start`.
3. Brauzerda **http://localhost:3000** oching. ("Go Live" bilan ochmang.)

## Ma'lumot bazasi: telefon yo'qolsa ham saqlanadi
Ilova server orqali ochilsa (`npm start`, yoki hostingga qo'yilgan bo'lsa), ma'lumot **avtomatik** serverga saqlanadi, hech narsa sozlash shart emas.
- Telefon yo'qolsa yoki sinsa: yangi telefonda ilovani oching, **shu login va parol** bilan kiring, hamma mijoz va qarzlar qaytadi.
- Ikki telefondan bir vaqtda ishlasa bo'ladi: o'zgarishlar birlashadi, internet bo'lmasa keyin sinxronlanadi.
- Boshqa do'konlarning ma'lumotini ko'ra olmaydi. Parol serverda scrypt bilan xeshlanadi; noto'g'ri parol ko'p kiritilsa server vaqtincha to'sadi.
- Sozlamalar → Bulutga saqlash: holat va "Hozir saqlash" tugmasi.
- Ma'lumot serverdagi `data.json` faylida turadi. **Uni muntazam zaxiralang** (server o'zi har 6 soatda `.bak` yozadi, lekin boshqa joyga ham nusxa oling). Foydalanuvchilar ko'payganda (yuzlab do'kon) buni haqiqiy bazaga (PostgreSQL) o'tkazish kerak bo'ladi.
- Server O'zbekistondagi hostingda tursa, shaxsiy ma'lumotlarni mamlakat ichida saqlash talabiga mos keladi (yurist bilan tekshiring).

### Supabase'ga ulash (ixtiyoriy)
Ma'lumotni `data.json` o'rniga Supabase bazasida saqlash uchun:
1. [supabase.com](https://supabase.com) da hisob oching, **New project** yarating (ma'lumotlar bazasi parolini yozib qo'ying).
2. Loyiha ichida **SQL Editor → New query**, shu papkadagi `supabase.sql` ni to'liq nusxalab qo'ying va **Run** bosing. (Bir marta.)
3. **Project Settings → API** dan ikkita narsa oling: **Project URL** va **service_role** kalit (`secret`).
4. `env.txt` dagi `SUPABASE_URL=` ga URL, `SUPABASE_SERVICE_KEY=` ga service_role kalitni yozing. Serverni qayta ishga tushiring.
5. Tekshirish: ilovada hisob oching, mijoz qo'shing. Supabase → Table Editor → `qd_cloud` da qatorlar paydo bo'ladi.

**Muhim:** `service_role` kalit juda kuchli, u faqat `env.txt` da (serverda) turadi. Uni ilovaga, GitHub'ga yoki boshqa odamga bermang. Jadvalda RLS yoqilgan, ya'ni ochiq (anon) kalit bilan ma'lumotni o'qib bo'lmaydi. Supabase serverlari chet elda: shaxsiy ma'lumotlarni O'zbekiston ichida saqlash talabini yurist bilan tekshiring.

## SMS qanday ishlaydi
SMS **o'zingizning telefoningiz va SIM kartangiz** orqali ketadi (oylik SMS paketingizdan). Paket sotib olish, kredit va avtomatik yuborish yo'q.
- Mijoz oynasida **SMS eslatma**: ilova tayyor matnni yozib beradi, **SMS yuborish** bosilsa telefoningizning SMS ilovasi shu matn bilan ochiladi, siz "Yuborish" bosasiz. **Qo'ng'iroq** tugmasi ham shu yerda.
- **Eslatmalar** (Mijozlar sahifasidagi qizil qator): muddati o'tgan mijozlar ro'yxati, har biriga SMS va Qo'ng'iroq.
- **Sozlamalar → Xabar matni**: matnni o'zgartirasiz. `{name}` ism, `{amount}` qarz, `{due}` muddat, `{items}` olingan tovarlar, `{phone}` sizning raqamingiz.
- Yuborilgan mijoz belgilanadi, oxirgi eslatma sanasi ko'rinadi.

## Tovar yozish
Mijoz oynasida **+ Tovar yozish**: tovar nomi, soni, bittasining narxi. Jami qarz o'zi hisoblanadi va qarzga yoziladi. Tovar nomlari SMS matniga (`{items}`) va Hisobotdagi "Eng ko'p qarzga ketgan tovarlar"ga tushadi.

## Ism takrorlanmasin
Yangi mijoz ismini yozganda ilova o'xshash ismlarni ko'rsatadi ("Shulardan biri emasmi?"). Bir xil ism bo'lsa, yangi odam ochmasdan o'sha mijozning hisobiga qo'shadi.

## Do'konlar (bir nechta)
Sozlamalar → **Do'konlar**: bir telefonda bir nechta do'kon. Har birining ma'lumoti alohida. Bosib almashtirasiz; PIN qo'yilgan do'konga o'tishda PIN so'raladi. **+ Yangi do'kon qo'shish** yangi hisob ochadi.

## PIN, Face ID, barmoq izi
Sozlamalar → Xavfsizlik → PIN kod va Face ID. 5 marta xato kiritilsa 30 soniya kutiladi. **Hisobdan chiqsangiz, shu hisobning PIN va Face ID'si o'chadi**; qaytib kirish uchun login va parol kerak.

## To'lov va'dasi
Mijoz oynasida "+ To'lov sanasi (va'da)". Va'da kuni ilovani ochganda xabar chiqadi (server bilan bo'lsa, telefonga ham). Sana o'tib qarz qolsa "Va'da buzildi" deb ko'rinadi.

## Hisobot
- **Bu oy natijasi**: oy davomida qancha qarz berildi, qancha qaytdi, farq (plyus yoki minus) va 6 oylik grafik.
- Qarzlar yoshi (qancha vaqtdan beri qaytmagan) va eng ko'p qarzga ketgan tovarlar.
- Kunlik va oylik harakat grafiklari.
Eslatma: bu qarz hisobi. Tovarning tannarxi hisobga olinmaydi, shuning uchun bu "sof foyda" emas.

## Kalkulyator: valyuta va foiz
Kalkulyator oynasida uch bo'lim: **Hisoblash**, **Valyuta** (iPhone kalkulyatoridek: ikki qator, valyutani bosib tanlash, almashtirish tugmasi, masalan 50 $ = 595 000 so'm; kurs Sozlamalardagi kurs) va **Foiz** (A ning B % i, chegirma, ustama, qism necha foiz).

## Valyuta
Sozlamalar → Valyuta: UZS, USD, EUR, RUB, KZT. Kurslar Markaziy bankdan avtomatik yangilanadi (server ishlab tursa, yoki to'g'ridan-to'g'ri); qo'lda ham kiritish mumkin.

## Telegram bot (ixtiyoriy, server kerak)
Mijoz savoli botga tushadi, javobni Sozlamalar → Telegram xabarlari orqali yozasiz. @BotFather orqali bot yarating, tokenni `env.txt` dagi `TELEGRAM_BOT_TOKEN=` ga yozing.

## Maxfiylik va hisobni o'chirish
`/privacy` sahifasi tayyor (`PRIVACY_OWNER`, `PRIVACY_CONTACT` ni to'ldiring; yuristga ko'rsating). Sozlamalar → Hisobni o'chirish barcha ma'lumotni o'chiradi.

## Fayllar
- `qarz-daftar.html` — butun ilova
- `server.js`, `env.txt`, `sw.js`, `manifest.webmanifest`, `icons/` — server va o'rnatiladigan ilova (PWA) fayllari
- `admin.html`, Eskiz qismi — eski SMS-sotuv tizimi. Hozir ishlatilmaydi, `ESKIZ_*` ni to'ldirmasangiz o'chiq turadi.
- `PUBLISHING.md` — Play Market va App Store'ga chiqarish

## Tekshiruv holati
**Sinaldi (brauzer va soxta serverlar bilan):** mijoz qo'shish, o'xshash ism, tovar yozish, SMS matni va tugmalar, eslatmalar ro'yxati, do'konlar almashtirish, PIN va Face ID (virtual qurilma bilan), hisobotlar, hisobni o'chirish, valyuta, to'lov va'dasi.
**Sinalmagan:** haqiqiy telefon SMS ilovasi (iPhone/Android'da matn bilan ochilishini o'zingiz tekshiring), haqiqiy Face ID, Markaziy bankning haqiqiy serveri, haqiqiy Telegram, do'kon tekshiruvi.

## Kunlik eslatma (kirmasa)
Sozlamalar → «Kunlik eslatma» → yoqing. Foydalanuvchi bir kun daftarni ochmasa, kechqurun (17–20 soat, standart 19:00) telefoniga bildirishnoma boradi: nechta mijozning muddati o'tgani va kim bugun to'lashni va'da qilgani. Bugun ilovani ochgan bo'lsa, bezovta qilinmaydi. Serverda ishlaydi (Web Push). Eslatma: iPhone'da avval «Bosh ekranga qo'shish» kerak; Capacitor (Play Market) o'ramida web-push ishlamaydi — u uchun keyinroq FCM kerak bo'ladi. Ilova 1 kundan ko'p kirilmagan bo'lsa, ochilganda «Bugun nima qilish kerak» oynasi chiqadi.

## Yangilanish banneri
`env.txt` da `APP_LATEST_VERSION` (masalan 1.1.0), `PLAY_URL`, `APPSTORE_URL`, `UPDATE_NOTES` ni yozing. Ilova versiyasi (qarz-daftar.html ichida `APP_VERSION`) undan eski bo'lsa, tepada «Yangi versiya chiqdi» chiqadi va Play Market / App Store ga olib boradi. `APP_MIN_VERSION` dan eski bo'lsa — majburiy (yopib bo'lmaydi).

## PIN / parol esdan chiqsa
PIN qo'yganda 6 xonali **tiklash kodi** beriladi (yozib qo'ying). PIN ekranida «Unutdim» → parol yoki tiklash kodi bilan PIN o'chadi. Sozlamalar → «Tiklash kodi» dan yangi kod olish va parol eslatmasini yozish mumkin.

## Eslatma markazi (Sozlamalar → Eslatma markazi)
Oltita bo'lim: SMS markazi, Qo'ng'iroq markazi, SMS sozlamalari, Qo'ng'iroq sozlamalari, To'lovlar, Avto tarix.
- **Avto-SMS:** yoqish/o'chirish, muddatdan necha kun oldin, necha kun keyin, takrorlash oralig'i, eng ko'p eslatma soni, yuborish vaqti, SMS matni (o'zgaruvchilar va jonli ko'rinish). Bir qarz + bir muddat + bir eslatma raqami = faqat bitta SMS (takror yuborilmaydi). Qarzdorlar ro'yxati bulutdagi ma'lumotdan olinadi, ilova alohida sinxronlamaydi.
- **Avto-qo'ng'iroq:** SMS dan keyin N kun o'tgach, belgilangan vaqtdan keyin, tinch soatlardan tashqarida, eng ko'pi bilan N urinish; qarz to'lansa bekor bo'ladi. **Provayder ulanmaguncha qo'ng'iroq yuborilmaydi** (`env.txt` → `CALL_WEBHOOK_URL`, `CALL_WEBHOOK_KEY`). Server provayderga POST qiladi, kontrakt env.txt da yozilgan.
- **Paketlar:** SMS va qo'ng'iroq balansi alohida. Buyurtma → kod → chek yuklash → siz admin sahifada tasdiqlaysiz (`/admin`).
- **Yangiliklar:** admin sahifada e'lon yaratish/tahrirlash/o'chirish, rasm, rejalash (kelajak sana), nechta o'qiganini ko'rish. Foydalanuvchida bosh ekran tepasida yangi e'lon kartasi, "Yangiliklar" sahifasi, o'qilmagan belgisi.
- **Qo'ng'iroqcha:** yangiliklar, kredit kamayishi, to'lov holati, eslatma xatolari; tarix va "o'qildi" belgisi.
- Eslatma: SMS yuborish uchun `env.txt` da Eskiz kaliti kerak (ESKIZ_EMAIL, ESKIZ_PASSWORD).
