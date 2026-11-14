# Qarzim — install, deploy and launch notes

This package is Qarzim v11. It has no npm dependencies. The server is one Node.js file (`server.js`) with modules in `lib/`. The app is `qarz-daftar.html`, with the v11 screens in `v11/`. Admin tools are at `/admin`.

## 1. What is in the package

| File | Purpose |
|---|---|
| `server.js` | HTTP server, cloud sync API, roles, audit log, backups, SMS/call/Telegram, support reports, inventory and finance API (v11) |
| `lib/` | v11 server modules: inventory and finance core (`ops.js`), HTTP handlers (`ops-http.js`), rule-based AI assistant (`ai.js`), Excel reader and writer (`xlsx.js`) |
| `qarz-daftar.html` | The whole web app (PWA): ledger, dashboard, Hisobot, help, settings, demo mode, and the Ombor entry |
| `v11/` | v11 screens: Boshqaruv paneli, Ombor, Tovarlar, Tovar kirimi, Tovar chiqimi, Kassa, Daromad va xarajatlar, Moliyaviy hisobotlar, AI yordamchi (`app.js`, `app.css`) |
| `admin.html` (served at `/admin`) | Owner-operator page: news, orders, accounts, backup status, problem reports |
| `env.example.txt` | Template for all environment variables. Copy it to `env.txt` on the server |
| `.gitignore` | Keeps `env.txt`, `data.json`, backups and receipts out of git |
| `manifest.webmanifest`, `sw.js`, `icons/`, `.well-known/` | PWA install and Android link files |
| `privacy.html`, `README.md`, `PUBLISHING.md`, `supabase.sql`, `package.json` | Documentation and legal page, plus the Supabase schema. `package.json` has `npm test` |
| `tests/` | Test suites: server, v11 library, v11 HTTP |
| `CHANGES.md` | List of modified and added files, with the v11 changes at the top |

`env.txt` is **not** in this package. It held live secrets, so it was excluded from the deliverable. See §7.

## 2. Requirements

- Node.js 18 or newer (tested on Node 22).
- A Linux server with a persistent disk for the data file and backups.
- HTTPS in front of the app (Caddy, nginx, or your host's load balancer). PWA install, service workers, push notifications and the phone-call webhook need HTTPS.

## 3. Run locally (for a quick test)

```bash
cp env.example.txt env.txt            # then edit: at least ADMIN_KEY and DATA_FILE
node server.js                        # open http://localhost:3000
npm test                              # optional: 93 tests (server, v11 library, v11 HTTP)
```

Without `env.txt`, the app still runs. Data goes to `data.json` next to `server.js`. Use that only for testing.

## 4. Deploy on a server

1. Create the folders and a service user:
   ```bash
   sudo useradd --system --home /opt/qarz-daftar qarz || true
   sudo mkdir -p /opt/qarz-daftar /var/lib/qarz-daftar /var/backups/qarz-daftar
   sudo cp -r ./* /opt/qarz-daftar/
   sudo chown -R qarz:qarz /var/lib/qarz-daftar /var/backups/qarz-daftar
   ```
2. Create `/opt/qarz-daftar/env.txt` from `env.example.txt`. Fill in `ADMIN_KEY` (32+ random characters, for example `openssl rand -hex 32`), `DATA_FILE=/var/lib/qarz-daftar/data.json`, `BACKUP_DIR=/var/backups/qarz-daftar`, `APP_URL=https://your-domain`, and `SUPPORT_CONTACT`. Then lock it down: `chmod 600 env.txt && chown qarz: env.txt`.
3. Run it as a service, for example `/etc/systemd/system/qarz-daftar.service`:
   ```ini
   [Unit]
   Description=Qarzim
   After=network-online.target

   [Service]
   User=qarz
   WorkingDirectory=/opt/qarz-daftar
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   # Set TRUST_PROXY=1 in env.txt when a reverse proxy is in front.

   [Install]
   WantedBy=multi-user.target
   ```
   Then run `sudo systemctl enable --now qarz-daftar`.
4. Put HTTPS in front. A minimal Caddy site block:
   ```
   qarz.example.uz {
     reverse_proxy 127.0.0.1:3000
   }
   ```
   Then set `TRUST_PROXY=1` in `env.txt` and restart the service.
5. Check the deployment:
   - `https://your-domain/api/app-info` should return your `SUPPORT_CONTACT`.
   - `https://your-domain/admin` should ask for `ADMIN_KEY`. The Zaxira card should show "Ishlamoqda" after the first automatic backup. The server takes one at startup.

Only one server process may run on a given `DATA_FILE`. A second instance refuses to start, by design.

## 5. Backups and restore

- Automatic backups are written to `BACKUP_DIR` every `BACKUP_INTERVAL_HOURS` (default 6), and one is taken at startup. The newest `BACKUP_KEEP` files (default 40) are kept.
- Copy `BACKUP_DIR` to another machine or storage at least daily. A backup on the same disk does not protect against disk loss.
- Inventory and finance data (v11) is stored inside each shop's account record in the data file. It is therefore included in every backup and restore. In file mode, deleting an account also removes its inventory and finance data.
- Owners see the backup status in the app (Sozlamalar → Yordam va nazorat → Zaxira holati). Admins see it in `/admin` and can trigger a backup.
- Command line:
  ```bash
  node server.js backup                                   # take a backup now
  node server.js backups                                  # list backups
  # Stop the service first. Restore refuses while the server is running.
  sudo systemctl stop qarz-daftar
  node server.js restore /var/backups/qarz-daftar/<file>.json --confirm
  sudo systemctl start qarz-daftar
  ```
  Before a restore, the current state is saved as a `pre-restore` backup.
- Test a restore on a copy of the server before you rely on it. The server test suite covers disaster-recovery restore, but your own process is what counts.

## 6. Upgrading an existing installation

1. Back up `DATA_FILE` and `BACKUP_DIR` (copy them off the server).
2. Stop the service. Replace the app files (`server.js`, `lib/`, `v11/`, `qarz-daftar.html`, `sw.js`, `admin.html`, the rest of the package). **Keep** your `env.txt` and your data file.
3. Start the service. On first start, old local passwords are converted to hashes, the data file moves to schema version 11, and the server records a backup. Existing sales stay debt-only. The v11 finance history begins when the owner activates finance (decision D4, see `CHANGES.md`).
4. Check: log in as owner, open Hisobot, open Sozlamalar → Yordam va nazorat → Harakatlar jurnali, open `/admin` → Muammo xabarlari, and open Moliyaviy hisobotlar and activate finance once.

Rolling back to v10 should keep your data, because v10 ignores the new fields. This has not been tested. Take a backup before you upgrade, so that you can restore it if needed.

## 7. Secrets: action required before launch

The uploaded `env.txt` contained real-looking values for `ADMIN_KEY`, `ESKIZ_PASSWORD`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN` and `CALL_WEBHOOK_KEY`. Those values were shared in the upload, so **rotate all of them** (new admin key, new Eskiz password, new Supabase service key, revoke and re-create the Telegram bot token, new webhook key). Do not reuse the old ones. Never put any of them in an HTML, JS or repository file.

## 8. Environment variables

The full list with comments is in `env.example.txt`. The most important ones:

| Variable | Required | Notes |
|---|---|---|
| `DATA_FILE` | Yes (production) | Path to the data file, outside the code folder |
| `BACKUP_DIR` | Yes (production) | Backup folder, on a persistent disk |
| `ADMIN_KEY` | Yes | Admin page and `/api/admin/*`. Empty = admin disabled |
| `APP_URL` | Yes (production) | Public HTTPS address |
| `TRUST_PROXY` | If behind a proxy | `1` |
| `SUPPORT_CONTACT` | Recommended | Shown in the help center |
| `PRIVACY_OWNER`, `PRIVACY_CONTACT` | Recommended | Filled into `privacy.html` |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` (or `ESKIZ_TOKEN`) | For SMS | SMS is off without them |
| `SMS_CALLBACK_SECRET` | For SMS delivery status | Random 32+ characters |
| `CALL_WEBHOOK_URL`, `CALL_WEBHOOK_KEY` | For calls | Must be HTTPS |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | For Telegram | Optional |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | For Supabase mode | Optional. Enables cloud database and cloud backups |
| `VAPID_SUBJECT` | For web push | Keys are generated automatically and stored in `DATA_FILE` |
| `RATES_URL` | Optional | Central Bank rates source (default cbu.uz) |

v11 adds no environment variables. `QD_TEST` is read by the test suite and by the server's test mode. It also disables the 21:00 cutoff for the evening reminder digest and allows plain `http://127.0.0.1` call-webhook URLs. Never set it in production.

## 9. Roles

| Permission | Owner | Manager | Cashier | Employee |
|---|---|---|---|---|
| View customers and ledger | ✓ | ✓ | ✓ | ✓ |
| Record new debts and payments | ✓ | ✓ | ✓ | ✓ |
| Edit an existing customer or entry | ✓ | ✓ | — | — |
| Delete customers and entries | ✓ | ✓ | — | — |
| Lenders (Qarzlarim) | ✓ | ✓ | — | — |
| Hisobot (reports and exports) | ✓ | ✓ | ✓ | — |
| Activity log | ✓ | ✓ | — | — |
| Backup status (server permission `backup`) | ✓ | ✓ | — | — |
| Staff management | ✓ | — | — | — |
| View products and stock levels (Ombor, Tovarlar), without cost | ✓ | ✓ | ✓ | ✓ |
| See cost prices and stock value | ✓ | ✓ | — | — |
| Add, edit and archive products | ✓ | ✓ | — | — |
| Stock purchases (kirim), write-offs (chiqim) and adjustments | ✓ | ✓ | — | — |
| Kassa: balance and cash journal | ✓ | ✓ | — | — |
| Daromad va xarajatlar: record expenses | ✓ | ✓ | — | — |
| Moliyaviy hisobotlar: P&L, per-employee, journal, reconcile | ✓ | ✓ | — | — |
| AI yordamchi | ✓ | ✓ | — | — |
| Allow negative stock on one sale | ✓ | — | — | — |

Permissions are enforced on the server. Hiding a button in the app is only cosmetic. A staff member's role can be changed at any time, and removing a staff member signs them out on their next load. The negative-stock option is checked against the owner role directly. The `inv_override` name in the server's role list has the same effect, but it is not what the check uses.

## 10. Integration status

Status meanings: **Working** = tested in this build. **Partially configured** = the code path works, but it needs credentials or live verification that was not possible here. **Unavailable** = needs setup before it can do anything.

| Integration | Status | Evidence and what is needed |
|---|---|---|
| Accounts, login, registration (cloud) | Working | Browser tests: registration, login, staff login from another device, role gating, removal signs out |
| Local accounts (no server) | Working | Browser tests: login, registration, legacy plaintext password migrated to hash |
| Ledger sync (cloud) | Working | Server tests: stale devices cannot delete or resurrect customers, PUT without arrays is rejected |
| Roles and permissions | Working | Server tests (role matrix) and browser tests (cashier and employee UI) |
| Activity log | Working | Owner modal loads; server test: staff cannot read it |
| Backups (file mode) | Working | Automatic and manual backup, rotation, startup backup, restore refused while running: server tests and admin test |
| Backups (Supabase mode) | Partially configured | Server tests use a fake PostgREST. Needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` and a live check. v11 data was tested in file mode only |
| Problem reports | Working | Stored, rate-limited (10 per hour per client), admin list escaped. Browser and server tests |
| Demo mode | Working | Browser test: nothing written to shop or auth storage, no 4xx responses, clean exit |
| Dashboard, Hisobot, exports (CSV, print to PDF) | Working | Browser tests: tabs, bars, overdue list with WhatsApp links, CSV with BOM, print |
| Currency conversion | Working | Totals and filters use the view currency. Needs a live rate source to refresh rates |
| Currency rates (cbu.uz) | Partially configured | Works when the server or browser can reach cbu.uz, and falls back to built-in rates otherwise. Not verified live, because the build sandbox blocks outside hosts |
| SMS (Eskiz.uz) | Partially configured | Reports "sent" only when Eskiz returns a message ID. Otherwise "failed" or "retry". Needs `ESKIZ_EMAIL` and `ESKIZ_PASSWORD`. Not sent to a live number from here. Unchanged in v11 |
| Phone-call reminders | Unavailable | Needs an HTTPS `CALL_WEBHOOK_URL`. Reported as made only when the webhook confirms it |
| Telegram reminders | Partially configured | Needs `TELEGRAM_BOT_TOKEN`. Not tested against the live Telegram API |
| Web push | Partially configured | Keys are generated automatically. Needs HTTPS and a user permission. Not tested with a real push service |
| PWA install | Partially configured | Manifest and service worker are present. Installability and offline behaviour were not tested on devices. The service worker caches the app shell only |
| Responsive layout (phone, tablet, desktop) | Working | Screenshots at 390, 820 and 1366 px in light and dark themes, no horizontal overflow. v11 screens checked at 390, 768 and 1440 px |
| Ombor: products, categories, purchases, write-offs, adjustments | Working | Library tests (weighted average cost, stock checks, partial product update). Browser test: product create and validation, purchase rows, write-off, adjustment, stock quantities |
| Sale stock check and rejected-sales queue | Working | HTTP test: shortage returns 409. Browser test: sale is held in the queue, owner restores it with negative stock allowed, or discards it |
| Excel import and export (Ombor, Hisobot) | Working | Library and browser tests: dry run, then commit; exported file opens. Import rollback over HTTP is not tested directly |
| Kassa: opening balance, payments, pending confirmation, cash adjustment | Working | Browser test: pending payment confirmed, cash totals. Library tests |
| Daromad va xarajatlar | Working | Browser test: expense recorded, then reversed, with net and cash totals updated |
| Moliyaviy hisobotlar: P&L, periods, per-employee, journal, reconcile, xlsx | Working | Browser tests: dashboard values checked against stored sales, expenses and payments; xlsx export. Per-employee figures cover only actions after v11 |
| Moliyaviy hisobotlar: print-ready PDF | Partially configured | Uses the browser print dialog. Not tested in this build |
| AI yordamchi | Working | Rule-based Uzbek answers, computed on the server. No external service to configure. Tested through the HTTP and browser suites |
| Demo mode in v11 screens | Working | Empty state with a "Demodan chiqish" button. Browser test: button exits demo and returns to sign-in |
| v11 screens without a server connection | Working (by design) | Shows "Bulut serveriga ulanmagan". Inventory and finance cannot work in browser-only storage |

## 11. Launch-readiness checklist

- [ ] Rotate every secret from the uploaded `env.txt` (§7).
- [ ] `env.txt` is on the server only, with mode 600, and is not in git.
- [ ] HTTPS works, and `TRUST_PROXY=1` is set when behind a proxy.
- [ ] `DATA_FILE` and `BACKUP_DIR` are on a persistent disk outside the code folder.
- [ ] A backup copy is made off the server at least daily, and one restore was rehearsed on a copy.
- [ ] `/api/app-info` returns your support contact.
- [ ] `/admin` shows Zaxira "Ishlamoqda" and the problem reports list.
- [ ] `PRIVACY_OWNER` and `PRIVACY_CONTACT` are filled in, so `privacy.html` is accurate.
- [ ] Decide whether to keep the SMS-credit purchase flow (manual transfer, then admin approval). It was in the original app and was kept unchanged. The spec forbids subscriptions and checkout, so remove it if it counts as pricing.
- [ ] Send one real SMS to your own number, and confirm it arrives. Confirm that a failed send shows as failed in the app.
- [ ] Test the phone-call webhook end to end, if you use calls.
- [ ] Check the layout on a real phone, tablet and desktop, in both themes.
- [ ] Run `npm test` on the server (93 tests).
- [ ] After upgrading to v11, activate finance once as owner, then check a few Moliyaviy hisobotlar figures against your own records.
- [ ] Decide who has the owner role, and remove test accounts.

## 12. Known limitations

- **Local-only password hashing is weak.** Passwords for accounts stored only in the browser are hashed with a non-cryptographic function in the client. Cloud accounts use scrypt on the server. Treat local-only accounts as low-security.
- **Layered code.** Several features were added as wrappers over earlier functions. Some older definitions are now dead code. This works, but it is harder to maintain. A clean-up is recommended after launch.
- **Stale devices.** A device that has not synced can briefly show an old role or customer list. The server still enforces the current role on every request.
- **SMS callback secret is in the callback URL.** Some providers log query strings. Use a long random value, and rotate it if it leaks.
- **Legacy Firebase option.** The cloud dialog still accepts a user-entered Firebase URL. It has no hard-coded endpoint. It is not part of the server-side security model, so prefer the built-in cloud.
- **Optional item not done.** The richer customer profile (history and totals in the detail view) from the spec was not implemented in this pass.
- **Admin key in the browser.** `/admin` keeps the key in session storage for the current tab only. Use it on a trusted computer.
- **Inventory and finance data share the data file (D8).** Watch the size of `data.json`. A separate database table is planned when it passes about 50 MB.
- **Costing method.** Weighted average cost only. FIFO is not implemented.
- **Single shop per owner.** Multi-store reporting is not supported.
- **Per-employee reporting** covers actions after the server stamps them (v11 deploy onward), not older client-written rows.
- **Oversold product with no stock history.** The negative part of such a sale may cost zero.
- **Restoring a rejected sale** can bring back a client who was deleted in the meantime.
- **Restoring a rejected edit** to an existing sale restores the server copy only when that copy exists.
- **Staff accounts on the v11 screens** were tested over HTTP only, not in the browser.
- **The first request on a brand-new account** returns 401 until the first sync completes. The app retries once automatically. The message can appear in the browser console.
- **Supabase mode with v11 data** was not tested.
