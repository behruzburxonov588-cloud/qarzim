# qarzim
## Cloudflare Workers'ga joylash (server olinguncha vaqtinchalik)

Repozitoriy ildizidagi `wrangler.jsonc` ilovani Cloudflare'ga joylaydi (`npx wrangler deploy`).
- Sahifa fayllari: `qarz-daftar-app-v13-fix2/qarz-daftar-app/` (server kodi, testlar va hujjatlar `.assetsignore` orqali chiqarib tashlanadi).
- `cloudflare/worker.js`: `/` → `qarz-daftar.html`, `/privacy` → maxfiylik sahifasi.
- `cloudflare/cloud.js`: **vaqtinchalik bulut** — Cloudflare D1 bazasi (`qarzim-db`, birinchi deploy'da avtomatik yaratiladi). Login, boshqa telefondan kirish, ikki telefon o'rtasida sinxronlash, xodimlar va rollar, harakatlar jurnali `server.js` dagi qoidalar bilan bir xil ishlaydi (`tests/cloudflare.test.js` tekshiradi).
- Bu rejimda ishlamaydi: SMS markazi, Telegram bot, Ombor/Kassa/Moliya, kunlik bildirishnoma. Ular uchun `server.js` ni Node hostingda ishga tushirish kerak.
- Maxfiylik sahifasi uchun Cloudflare → Settings → Variables: `PRIVACY_OWNER`, `PRIVACY_CONTACT`.

### Serverga ko'chirish (keyin)
D1 dagi `qd_cloud` jadvali (`kind`, `key`, `part`, `value`) `server.js`/Supabase dagi `idx`/`data` yozuvlari bilan bir xil tuzilishda. Parol xeshi D1 da PBKDF2 (`alg: "pbkdf2"`), serverda scrypt — ko'chirishda `server.js` ga PBKDF2 tekshiruvini qo'shish kerak, shunda foydalanuvchilar parolni qayta kiritmasdan kiraveradi.
