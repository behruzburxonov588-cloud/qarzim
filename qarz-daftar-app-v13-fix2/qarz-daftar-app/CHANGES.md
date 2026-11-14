# Changes in this version

## v13 fix: the chart and logo work even when the stylesheet or icon files do not load

Reported problem: the Pul harakati chart appeared as one large black shape, and the logo was missing. The cause was that the chart styles lived in separate files (`v11/app.css`, `v12/qarzim.css`). When those files did not load on the server or the browser, the chart line was filled black, and the logo and icons failed too.

### What this fix changes

- **Styles inside the page:** the contents of `v11/app.css` and the Qarzim/chart styles are now in `qarz-daftar.html`. The `v12/` folder was removed. `v11/app.css` is kept on disk but is no longer linked.
- **Chart line never filled:** the polyline has `fill="none"` as an attribute, so it stays a line even if the stylesheet is missing.
- **Logo and tab icons embedded:** the logo and the 16 px and 32 px favicons are data URIs in the page, so they show without `/icons/` or `/favicon` requests. The other icon links now use `?v=13`.
- **Ombor button:** the v11 module (`v11/app.js`) is inlined as well. Before, if that file did not load, tapping Ombor did nothing and showed no message. Now the module is in the page, and if it is still missing, the app shows "Ombor yuklanmadi. Sahifani yangilang."
- **Service worker:** the shell cache is `qd-shell-v4`, so browsers drop the old shell.
- **File permissions:** all project files are mode 644 and folders are 755, so the server can read every file in the zip.
- **Tests:** `tests/v12.test.js` is replaced by `tests/v13.test.js`, which checks the embedded styles and logo, the `fill="none"` line, the v13 versions, the v4 cache, the CSP and the icon routes. `npm test` runs 101 checks and all pass.

### How it was checked

- The page was run with every stylesheet, icon, favicon and manifest request blocked. The chart drew a normal line with bars and no black shape, and the logo image loaded.
- `tests/e2e/verify-qarzim.py` passes 29 of 29 checks on desktop and 29 of 29 on mobile.
- The smoke flow for the Hisobot tabs, chart controls, CSV export and overflow passes on desktop and mobile.

## v13 (previous package): chart ranges, historical balance, debt notes, repaid status

Built on v12. Layout, colours and the stored data format are unchanged. No schema change: the new note is stored in the existing `note` field of the debt transaction.

### What v13 changes

- **Pul harakati range filters:** 7 kun, 30 kun, 6 oy and 12 oy, combined with Kunlik, Haftalik and Oylik statistics. Only sensible combinations are enabled (for example, daily bars are not offered for 6 months). Weekly buckets are clipped to the selected window, so totals match the window exactly.
- **Historical vs new debt:** the tap readout is a bridge: previous debt at the start of the period, plus new debt, minus repayments, equals the balance at the end. It also shows the number of entries in the period.
- **Debt entry:** the add form has an optional note (step 5). It is saved on the first debt transaction, and the default label is kept when the note is empty.
- **Status and dates:** a fully repaid person shows a green "to‘langan" tag. Overdue lender rows show the repayment date as well as the days late. The v11 grace-period labels (faol / diqqat / faol emas) are unchanged.
- **Money check:** `tests/e2e/verify-qarzim.py` (Playwright, not part of `npm test`) seeds known debts and repayments, recomputes every chart bucket independently in the browser, and compares the result for every range and granularity. It also drives a real repayment and a real debt entry with a note. It passes on desktop and on a 390 px phone.

### Not changed

- Database structure and stored user data, login and accounts, cloud sync and backups, and the v11 modules.
- The rule that remaining debt is the sum of each person's positive balance. A person who overpays does not reduce other people's debt.

## v12 (this package): Qarzim polish, charts, favicon and mobile

Built on v11. Layout, colours, navigation and the stored data format are unchanged. Accounts, login, cloud sync and backups are not touched, and no new fields are written.

### What v12 changes

- **Pul harakati chart (Hisobot → Boshqaruv):** lent and received amounts are shown as separate bars, and the remaining debt is a separate line. Periods are daily (last 14 days), weekly (last 12 weeks) and monthly (last 12 months), with a Mijozlar / Qarzlarim switch. Tapping a column shows its exact date and amounts. Remaining-debt points are drawn only where the balance is above zero, and the y-axis labels have their own gutter so they do not overlap the grid.
- **Qarzim:** overview totals for borrowed, repaid and remaining amounts; per-person repayment progress; overdue rows highlighted in the existing red; sorting by due date (Muddat); a per-person summary; a running balance in each person's history; and a "Yarmi" chip (half the remaining balance) next to the payment quick-amount chips.
- **Favicon and icons:** `favicon.ico`, `favicon.svg`, and PNG icons at 16 and 32 px, linked with explicit sizes in the page head. The server answers `/favicon.ico` and `/favicon.svg` with the correct MIME types. Asset URLs carry `?v=12`, and the service worker cache is renamed to `qd-shell-v3` so old shells are replaced.
- **Mobile:** the viewport no longer disables pinch zoom. Tap targets are larger, due-date chips use two columns on phones 420 px wide or narrower, and the page has bottom padding so the floating buttons do not hide the last row.
- **Tests:** `tests/v12.test.js` covers the icon routes, the head references, the versioned stylesheet and script, and the viewport setting.

### Not changed

- Database structure and stored user data, login and accounts, cloud sync and backups, and the v11 modules (Ombor, Kassa, Moliya).
- The contents of `v11/app.js` and `v11/app.css`. Only the version query was added.

### Known limits

- Tab icons were not checked visually in this build environment. Check them in Chrome, Edge and Firefox on desktop and on a phone, after clearing the cache once.
- Google Fonts and external exchange-rate sites are unreachable from the build sandbox. Their failures in the test run are not app defects.

## v11 (this package): Ombor, Kassa, Moliya and AI yordamchi

Compared with v10 (the previous package).

### What v11 adds

- **Boshqaruv paneli:** whole-store home screen with KPI tiles and interactive charts. Hisobot is unchanged (D9).
- **Ombor:** products and categories, stock purchases (kirim), write-offs and stock adjustments (chiqim, tuzatish), low-stock and out-of-stock flags, Excel import and export. Costing uses weighted average cost. FIFO is not implemented.
- **Kassa:** opening balance, payments by method (naqd, karta, otkazma, boshqa), pending confirmation for non-cash payments (D6), and cash adjustments.
- **Daromad va xarajatlar:** income and expenses by category, with reversal of wrong entries.
- **Moliyaviy hisobotlar:** profit and loss (revenue minus cost of goods, losses and expenses), periods, comparison with the previous period, per-employee breakdown, journal, reconciliation, Excel export, and a print-ready view.
- **AI yordamchi:** deterministic, rule-based assistant in Uzbek. It runs on the server and sends nothing to an external model (D1).
- **Sale stock check:** a sale that would exceed stock is rejected with HTTP 409. The browser keeps the rejected sale in a queue. The owner can restore it (optionally allowing negative stock, owner only) or discard it.
- **Light and dark themes**, responsive layout for desktop, tablet and phone, Uzbek Latin text throughout.

### Design decisions taken (INTEGRATION_PLAN §8, recommended defaults)

| # | Decision |
|---|---|
| D1 | AI is rule-based, in Uzbek, on the server. No external model, no API key |
| D2 | Finance totals are in UZS, using the exchange rate saved at posting time |
| D3 | Old payments with no method are recorded as `noma’lum`, and count as cash only after finance activation |
| D4 | Finance history starts when the owner activates it. Earlier sales stay debt-only |
| D5 | Demo mode shows an empty state with a "Demodan chiqish" button. No fake numbers |
| D6 | `otkazma` and `boshqa` stay pending until confirmed |
| D7 | Without a server connection, the new modules show a "Bulut serveriga ulanmagan" message |
| D8 | Inventory and finance data are stored in the account record in `data.json`, so they are backed up and restored with everything else. Consider a separate table when the data file passes about 50 MB |
| D9 | Hisobot is unchanged. Boshqaruv paneli is the new whole-store home |
| D10 | Sales may have free-text lines. They do not reduce stock and are marked as unlinked |

### Files modified

| File | What changed |
|---|---|
| `server.js` | `/api/cloud/ops/*` routes (inventory, cash, reports, import and export, AI). New permissions for roles (see DEPLOY.md §9). Sales and payments are posted to the finance journal when a shop record is saved. Finance is projected at startup and hourly. Account schema version 11. `.css` files served as `text/css` |
| `qarz-daftar.html` | Ombor entry in the menu, loads `v11/app.css` and `v11/app.js`. Payment method on the sale form. Rejected-sale queue with banner and restore or discard. Demo bridge for the v11 empty state |
| `sw.js` | Cache name `qd-shell-v2`, so the new app shell replaces the old one |
| `privacy.html` | New bullet for inventory and finance records, and the deletion list now includes them. States that the AI runs on the server |
| `package.json` | `npm test` runs the three node test suites |
| `DEPLOY.md`, `CHANGES.md` | Updated for v11 |

### Files added

| File | Purpose |
|---|---|
| `lib/ops.js` | Inventory and finance core: weighted average cost, projection of sales and payments into the journal, reversals, stock checks, audit trail |
| `lib/ops-http.js` | HTTP handlers for `/api/cloud/ops/*`, role checks, idempotency, Excel import plan |
| `lib/ai.js` | Rule-based Uzbek assistant |
| `lib/xlsx.js` | Excel (.xlsx) reader and writer with no dependencies. Limits: 2 MB upload, 20 MB unpacked, 5,000 rows, 60 columns, 500 characters per cell. Refuses encrypted files, DOCTYPE and ENTITY declarations, and suspicious compression ratios |
| `v11/app.js`, `v11/app.css` | Interface for the nine v11 sections |
| `tests/v11.lib.test.js` | 39 library tests (costing, reversal, projection, P&L, cash, xlsx, AI) |
| `tests/v11.test.js` | 21 HTTP tests for the v11 endpoints and roles |

### Not included in the package

- `env.txt`: contained live secrets. Rotate them (see `DEPLOY.md` §7).
- `data.json`, `backups/`, `receipts/`: real or test data.
- Browser test scripts and repro scripts: they depend on this build environment (paths, ports, Chrome location).

### Verification (this build environment)

- `npm test`: 93 of 93 node tests pass (33 server, 39 library, 21 v11 HTTP).
- Browser tests (headless Chrome, a local temporary server and temporary data only):
  - v11 smoke: 6 of 6. Owner registration, nine sections, no page errors.
  - v11 full flow: 45 of 45. Products and validation, purchases, write-off, adjustment, cash, expense, sale and payment, shortage (409), dashboard values, pending confirmation, expense reversal, reports, Excel export, Excel import (dry run then commit), AI, theme, no horizontal overflow at 768 and 390 px.
  - Rejected sales: 17 of 17. Quarantine after a 409, banner, owner restore with negative stock allowed, discard.
  - v11 demo exit: 6 of 6.
  - Demo mode: 31 of 31. Nothing written to real storage.
  - Cloud: 15 of 15. Accounts and roles: 16 of 16. Admin page: 7 of 7.
- Not verified in this build: print-to-PDF through the browser dialog, staff accounts in the browser for v11 screens (HTTP tests only), Supabase mode for v11 data.

### Known limitations of v11

- An oversold product with no stock history may cost zero on the negative part of a sale.
- Restoring a rejected sale can bring back a client who was deleted in the meantime.
- Restoring a rejected edit to an existing sale restores the server copy only when that copy exists.
- Excel import rollback over HTTP is not tested directly. The library-level path is tested.
- Per-employee figures cover only actions made after this version was deployed.
- Multi-store is not supported. Each owner account maps to one shop.

---

## v10 (previous package)

Compared with the package before it (`original/`).

| File | What changed |
|---|---|
| `qarz-daftar.html` | Dashboard, Hisobot (daily, weekly, monthly, overdue, rankings, export), advanced search and filters, role-based UI, staff roles (owner, manager, cashier, employee), activity log viewer, backup status, help center with tutorials, FAQ and problem report, What's New section, demo mode, dark and light themes, responsive styles, print styles, and local password hashing with migration of old plaintext passwords |
| `server.js` | Support endpoints (`/api/app-info`, `/api/support/report`), admin problem-report list (`/api/admin/reports`), CSP allows the CBU rates request, report storage limit, and a report field check |
| `admin.html` (served at `/admin`) | Backup status card with "Hozir zaxiralash" button, and a problem-report list. All text is escaped |
| `README.md`, `PUBLISHING.md` | One-line pointer at the top to `DEPLOY.md`. The rest is unchanged |
| `icons/` | Replaced with the new Qarzim logo |
| Several files | Brand renamed from "Qarz Daftar" to "Qarzim" in user-visible text. Storage keys, file names and API paths are unchanged, so existing data still loads |
| Sign-in screen | Redesigned card with Kirish / Ro‘yxatdan o‘tish switch, larger fields with icons, and a shorter hero on phones. Element IDs unchanged |
| `icons/logo-mark-160.png` | Wallet mark used in the header, sign-in screen, splash and PIN lock |
| `env.example.txt`, `.gitignore`, `DEPLOY.md`, `CHANGES.md` | Added |

v10 verification: server tests 33 of 33; demo mode 31 of 31; accounts and roles 16 of 16; cloud 15 of 15; admin page 7 of 7; no horizontal overflow at 390, 820 and 1366 px.
