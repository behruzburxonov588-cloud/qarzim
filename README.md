# qarzim
## Cloudflare Workers'ga joylash

Repozitoriy ildizidagi `wrangler.jsonc` Cloudflare'ga ilovani statik sahifa sifatida joylaydi (`npx wrangler deploy`).
- Fayllar: `qarz-daftar-app-v13-fix2/qarz-daftar-app/` (server kodi, testlar va hujjatlar `.assetsignore` orqali chiqarib tashlanadi).
- `cloudflare/worker.js`: `/` → `qarz-daftar.html`, `/privacy` → maxfiylik sahifasi, `/api/*` → 404.
- Bu rejimda Node server (`server.js`) ishlamaydi: ma'lumot faqat telefonda saqlanadi; bulut, SMS markazi, Telegram, Ombor va bildirishnomalar uchun `server.js` ni Node hostingda ishga tushiring.
- Maxfiylik sahifasi uchun Cloudflare → Settings → Variables: `PRIVACY_OWNER`, `PRIVACY_CONTACT`.
