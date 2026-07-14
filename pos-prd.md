# PRD — Offline desktop POS for wholesale & retail shops

**Working name:** CounterTop POS
**Author:** Berry September
**Date:** July 2026
**Target:** Handed to Claude Code as the build spec. Everything Claude Code needs to start is in this document.

---

## 1. What this is

A fully offline desktop point-of-sale application for shops in Ghana that sell both wholesale (by the box/carton) and retail (by the piece). It runs as an installed native app on a Windows PC at the counter. No internet connection is required for any core function: recording sales, printing receipts, reprinting receipts, managing products, and viewing daily performance all work with the network cable unplugged.

This is a sibling to the existing web-based POS (K.B. Boabeng), but it is not a website. It is a desktop app with a local database on the machine.

### Primary goals

1. A cashier can scan a barcode, see the price instantly, take payment, and print a receipt in under 15 seconds per customer.
2. A cashier can complete the same sale with no barcode at all, by searching and adding products manually.
3. Every product carries both a retail price (per piece) and a wholesale price (per box), and the cashier can sell either unit on any line of the cart.
4. The owner can see, live, what has been sold today — count, revenue, top products — and use end-of-day numbers to make stocking and cash decisions.
5. Receipts can be reprinted at any later date by receipt number, date, or amount.
6. Zero cloud dependency. The database lives on the shop's machine. Backups are a file the owner can copy to a USB drive.

### Out of scope for v1

- Multi-branch sync over the internet
- Supplier purchase orders
- Customer accounts / credit sales (the K.B. Boabeng system has this; this app targets cash-and-carry shops — add in v2 if a client asks)
- Online payments (Paystack etc.) — MoMo is recorded as a payment *method* but not processed in-app

---

## 2. Users and roles

| Role | What they do | Auth |
|---|---|---|
| **Cashier** | Sales screen only: scan/add to cart, take payment, print receipt, reprint recent receipts | 4-digit PIN |
| **Admin (owner/manager)** | Everything the cashier can do, plus: products, prices, stock, users, reports, settings, backups, voids | 6-digit PIN + recovery phrase |

Login is a PIN pad, not email/password — there is no server to email a reset link from. The admin sets a recovery phrase at first run that can reset any PIN.

Every sale records which user made it. Voiding a completed sale requires the admin PIN even if a cashier is logged in (manager-override pattern).

---

## 3. Tech stack — the Electron alternative

**Recommendation: Tauri v2.** Frontend in React + Vite (the stack you already work in), backend in Rust with SQLite.

Why Tauri over Electron:

| | Electron | Tauri v2 |
|---|---|---|
| Installer size | 85–120 MB | 5–15 MB |
| RAM at idle | 200–400 MB | 40–90 MB |
| Renderer | Bundled Chromium | System WebView (WebView2 on Windows) |
| Backend | Node.js | Rust (you write almost none of it — plugins cover SQLite, printing, filesystem) |
| Frontend | Any web stack | Any web stack — your React/Vite code moves over unchanged |

Shop PCs in Ghana are often mid-range or old machines. A 40 MB idle footprint versus 300 MB is the difference between a fast counter and a laggy one. Tauri wins on the exact constraint this product has.

The Rust layer is not a real barrier here. The plugins do the native work; the app logic stays in TypeScript:

- `tauri-plugin-sql` — SQLite queries from the frontend
- `tauri-plugin-fs` + `tauri-plugin-dialog` — backup export/import to USB
- `tauri-plugin-printer` or the `escpos` Rust crate — thermal receipt printing (see §8)
- `tauri-plugin-updater` — optional, for when the machine *does* touch the internet

**Fallback:** if a hard blocker appears in Tauri (e.g. a specific printer driver only exposes a Node API), Electron + better-sqlite3 is the escape hatch. The React frontend is identical in both; only the IPC layer changes. Build the frontend so all native calls go through one `src/native/` adapter module to keep that door open.

### Full stack summary

- **Shell:** Tauri v2 (Rust)
- **UI:** React 18 + Vite + TypeScript
- **State:** Zustand (cart, session) + TanStack Query over SQLite reads
- **DB:** SQLite (WAL mode), single file at `%APPDATA%/countertop/pos.db`
- **Styling:** Tailwind CSS with the design tokens in §9
- **Charts:** Pure SVG, same approach as the SMS Analytics page — no chart library
- **Receipt rendering:** ESC/POS byte commands for thermal printers; HTML fallback for A4 printing via the system dialog
- **Target OS:** Windows 10/11 first. Tauri builds macOS/Linux from the same code if ever needed.

---

## 4. Offline architecture

```
┌────────────────────────────────────────────┐
│  Tauri shell (Rust)                        │
│  ┌──────────────┐   ┌───────────────────┐  │
│  │ React app    │──▶│ SQLite (pos.db)   │  │
│  │ (WebView2)   │   │ WAL mode, local   │  │
│  └──────┬───────┘   └───────────────────┘  │
│         │                                  │
│         ├──▶ ESC/POS printer (USB/serial)  │
│         ├──▶ Barcode scanner (HID = types  │
│         │     like a keyboard, no driver)  │
│         └──▶ Backup file (.ctbk) to USB    │
└────────────────────────────────────────────┘
```

Design rules that follow from "offline":

1. **SQLite is the single source of truth.** No API layer, no ports, no localhost server. The frontend queries the DB through the Tauri SQL plugin.
2. **WAL mode + transactions.** A sale (sale row + line items + stock decrements) commits in one transaction. A power cut mid-sale leaves the DB consistent — the sale either exists fully or not at all.
3. **Live feed without a server.** All screens run in one app instance, so "live" = an in-app event bus. When a sale commits, emit `sale:completed`; the dashboard subscribes and re-queries. If a second terminal is ever needed, v2 adds LAN sync (one machine hosts, others connect over the shop's local network — still no internet).
4. **Backups are boring on purpose.** Admin presses "Back up now," picks the USB drive, gets `countertop-backup-2026-07-14.ctbk` (a copy of the SQLite file plus the logo, zipped). Restore is the reverse. The app also auto-snapshots the DB daily to a local `backups/` folder, keeping the last 14.
5. **Clock honesty.** Offline machines drift or get their clocks changed. Stamp every sale with the OS time but also a monotonic sequence number. Receipt numbers come from the sequence (`R-000481`), never from the clock, so reprint lookup survives a wrong clock.

---

## 5. Data model

SQLite schema. Money is stored as integer pesewas (GHS × 100) — never floats.

```sql
users (
  id INTEGER PK,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin','cashier')),
  pin_hash TEXT NOT NULL,          -- argon2
  active INTEGER DEFAULT 1,
  created_at TEXT
)

categories (
  id INTEGER PK,
  name TEXT UNIQUE NOT NULL        -- "Cement", "Roofing", "Provisions", "Drinks"...
)

products (
  id INTEGER PK,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,             -- nullable: not every item has one
  category_id INTEGER FK,
  pieces_per_box INTEGER DEFAULT 1,        -- 24 sachets per box, 1 for loose items
  retail_price_pesewas INTEGER NOT NULL,   -- price per PIECE
  wholesale_price_pesewas INTEGER,         -- price per BOX (nullable = retail only)
  cost_price_pesewas INTEGER,              -- per piece, admin-only, for profit calc
  stock_pieces INTEGER DEFAULT 0,          -- ALL stock tracked in pieces
  low_stock_threshold INTEGER DEFAULT 10,
  active INTEGER DEFAULT 1,
  created_at TEXT, updated_at TEXT
)

sales (
  id INTEGER PK,
  receipt_no TEXT UNIQUE NOT NULL,          -- "R-000481", from sequence
  user_id INTEGER FK,
  subtotal_pesewas INTEGER,
  discount_pesewas INTEGER DEFAULT 0,
  total_pesewas INTEGER,
  amount_paid_pesewas INTEGER,
  change_pesewas INTEGER,
  payment_method TEXT CHECK(payment_method IN ('cash','momo','split')),
  cash_part_pesewas INTEGER,               -- for split payments
  momo_part_pesewas INTEGER,
  status TEXT CHECK(status IN ('completed','voided')) DEFAULT 'completed',
  voided_by INTEGER FK NULL,
  void_reason TEXT NULL,
  created_at TEXT NOT NULL
)

sale_items (
  id INTEGER PK,
  sale_id INTEGER FK,
  product_id INTEGER FK,
  product_name TEXT NOT NULL,       -- snapshot: renames must not rewrite old receipts
  unit TEXT CHECK(unit IN ('piece','box')),
  qty INTEGER NOT NULL,
  unit_price_pesewas INTEGER NOT NULL,   -- snapshot of price at time of sale
  line_total_pesewas INTEGER NOT NULL,
  pieces_deducted INTEGER NOT NULL       -- qty × (unit='box' ? pieces_per_box : 1)
)

stock_movements (
  id INTEGER PK,
  product_id INTEGER FK,
  change_pieces INTEGER,            -- negative for sale, positive for restock/void
  reason TEXT CHECK(reason IN ('sale','void','restock','adjustment')),
  reference_id INTEGER NULL,        -- sale id when applicable
  user_id INTEGER FK,
  created_at TEXT
)

settings (
  key TEXT PK,                      -- business_name, address, phone, logo_path,
  value TEXT                        -- receipt_footer, printer_name, paper_width...
)

audit_log (
  id INTEGER PK,
  user_id INTEGER FK,
  action TEXT,                      -- 'price_change','product_delete','void','pin_reset'...
  detail TEXT,                      -- JSON: {product_id, old, new}
  created_at TEXT
)
```

Two rules the schema encodes:

- **Stock lives in pieces.** Selling 2 boxes of a 24-piece product deducts 48 pieces. Stock display converts back: "3 boxes + 7 pcs".
- **Sale lines are snapshots.** `product_name` and `unit_price_pesewas` are copied at sale time. Renaming a product or changing its price never alters a printed or reprintable receipt.

---

## 6. Feature specification

### 6.1 Sales screen (the cashier's home)

The screen the app opens into after PIN login. It never navigates away during a sale.

**Barcode flow (the fast path):**
1. Scanner is a USB HID device — it types the code and presses Enter. A hidden, always-focused input captures this. No driver work.
2. On scan: product found → added to cart as 1 piece at retail price, row flashes, soft beep. Scanning the same code again increments quantity.
3. Product not found → modal: "Barcode 6009880ton not registered." Admin sees an "Add product now" shortcut; cashier sees "Search manually."
4. Focus management is strict: any click anywhere returns focus to the scan input within 100 ms. A scan must never be lost because someone clicked a button first.

**Manual flow (no barcode):**
- Search box with instant results (name or category, fuzzy, SQLite FTS5). Arrow keys + Enter to add. Mouse/touch also works.
- A "Quick grid" tab shows the 24 most-sold products as large tap targets for the sachet-water-and-bread items nobody scans.

**Cart rules:**
- Each line shows: name, unit selector (**PC / BOX**), qty stepper, unit price, line total.
- Toggling PC→BOX swaps to the wholesale price and recalculates. Products without a wholesale price show the BOX option disabled.
- Qty is editable by typing (cashiers sell 50 pieces at once — steppers alone are punishment).
- Line-level remove. Cart-level "Clear sale" with confirm.
- Admin-only: line price override (records to audit_log). Cashiers cannot change prices.
- Optional whole-sale discount in cedis or %, admin PIN required above a settable threshold.

**Payment:**
1. "Charge GHS 342.50" button opens the tender panel.
2. Method: **Cash**, **MoMo**, or **Split**.
3. Cash: amount-received keypad with quick buttons (exact, 50, 100, 200) → change due in huge type.
4. MoMo: recorded as paid by MoMo (reference field optional). No processing — the shop's MoMo device handles the actual transfer.
5. Split: two fields, cash part + MoMo part, must sum to total.
6. Confirm → one DB transaction (sale + items + stock decrements + movements) → receipt prints automatically → cart clears → focus returns to scan input.

Target: steps 1–6 in under 5 seconds of interaction for an exact-cash sale.

**Keyboard shortcuts:** F2 focus search · F4 charge · F6 toggle last line PC/BOX · F9 reprint last receipt · Esc cancel panel. Cashiers on a keyboard all day learn these in an hour.

### 6.2 Receipts

**Printing:** ESC/POS bytes to a thermal printer (58 mm or 80 mm, set in Settings). Layout:

```
        [LOGO if set]
      K.B. BOABENG CO. LTD
     Sunyani — 024 XXX XXXX
--------------------------------
Receipt: R-000481
Date: 14 Jul 2026  2:41 PM
Cashier: Ama
--------------------------------
Cement 42.5R        2 BOX
  @ 96.00              192.00
Roofing nails 1kg   5 PC
  @ 18.50               92.50
--------------------------------
SUBTOTAL               284.50
DISCOUNT                 0.00
TOTAL              GHS 284.50
CASH                   300.00
CHANGE                  15.50
--------------------------------
   Thank you. No refunds after
        goods leave the shop.
```

- Footer text is a Setting.
- If no thermal printer is configured, fall back to the OS print dialog with an HTML receipt (A4, two receipts per page to save paper).
- "Print failed" never blocks the sale — the sale is already committed; the app offers Retry / Reprint later.

**Reprint:**
- Reprints screen: searchable list of all sales — by receipt number, date range, amount, cashier, or a product name that appears on it.
- Row click → full receipt preview → "Reprint" (adds a `*REPRINT*` line under the date so duplicates are identifiable).
- F9 on the sales screen reprints the most recent receipt without leaving the sale flow.

### 6.3 Products (admin)

Table view: name, barcode, category, stock (shown as "X boxes + Y pcs"), retail price, wholesale price, status. Search + category filter + "low stock" filter.

- **Add/edit product** — drawer form with: name, category (create inline), barcode field with a "scan to fill" mode (focus the field, scan the physical item, done), pieces per box, retail price per PC, wholesale price per BOX, cost price (admin-visible only), opening stock, low-stock threshold.
- **Rename** is just editing name — history preserved via sale-line snapshots and audit_log.
- **Deactivate** instead of delete once a product has sales (delete stays available for zero-sale mistakes). Deactivated products can't be scanned or searched on the sales screen.
- **Restock** — a quantity-in dialog (in boxes or pieces) that writes a `stock_movement`, not a raw field edit.
- **Bulk import** — Excel template (SheetJS, same pattern as the SMS import): name, barcode, category, pieces/box, prices, opening stock. Validates and previews before commit.
- **Barcode label printing (v1.5)** — for shop-generated codes on unlabeled goods: pick products, print Code-128 labels on the thermal printer.

### 6.4 Dashboard — the live feed

Admin's home screen. Everything on it refreshes on the `sale:completed` event, so it moves the moment the cashier finishes a sale.

- **Today strip:** revenue, number of sales, items sold, gross profit (revenue − cost of items sold; hidden for cashiers).
- **Live feed:** reverse-chronological ticker of today's sales — time, receipt no., cashier, total, method. A new sale slides in at the top. Click → receipt preview.
- **Cash position:** expected cash in drawer (cash sales − change) vs MoMo total, side by side. This is the number the owner reconciles against the physical drawer at closing.
- **Hourly sales:** SVG bar chart, 7 am–9 pm, today vs same weekday last week as a ghost bar behind it.
- **Top 10 products today** by revenue, with units sold.
- **Low stock alerts:** products at or below threshold, restock shortcut.

### 6.5 Reports

Date-range picker (today / this week / this month / custom):

- Sales summary: revenue, sales count, average sale, profit, cash vs MoMo split
- Sales by product and by category (table + SVG chart)
- Sales by cashier
- Voided sales log with reasons
- Stock movement history per product
- Export any report to Excel (SheetJS) for the accountant

### 6.6 End of day

A closing ritual, one screen: today's totals, expected drawer cash, a field for counted cash, computed over/short, top products, and a "Print day summary" button (thermal Z-report). Closing does not lock anything — it records a `day_close` audit entry with the counted figure.

### 6.7 Settings

Business name, address, phone, logo (file picker → stored in app data, printed on receipts and shown on login), receipt footer text, printer selection + paper width + test print, currency display (GHS fixed for v1), users management (add cashier, reset PIN, deactivate), backup now / restore / auto-backup status, recovery phrase reset (admin).

---

## 7. Wholesale vs retail — exact behavior

This is the product's reason to exist, so the rules are spelled out:

1. A product's canonical stock unit is the **piece**. `pieces_per_box` defines the box.
2. Retail price = per piece. Wholesale price = per box. They are independent numbers — wholesale is *not* computed as pieces × retail × discount. The owner sets both (a box of 24 at GHS 2.50/pc retail might be GHS 52 wholesale, not 60).
3. Any cart line is either PC or BOX. A customer buying 3 boxes and 5 loose pieces of the same product = two lines. This keeps receipts unambiguous.
4. Stock validation happens in pieces at charge time: selling 2 boxes (48 pcs) with 40 in stock is blocked with "Only 1 box + 16 pcs available." Admin can override (records to audit_log) for shops that tolerate negative stock while they catch up on counting.
5. The receipt prints the unit next to qty (`2 BOX`, `5 PC`) so wholesale customers can check their invoice against the price they negotiated.

---

## 8. Hardware

| Device | Interface | Notes |
|---|---|---|
| Barcode scanner | USB HID (keyboard emulation) | Any GHS 150–400 scanner works. Zero driver code. Must be configured to send Enter as suffix (factory default on nearly all). |
| Thermal printer | USB / serial, ESC/POS | Target the ESC/POS command set, not a specific brand — covers Xprinter, Epson TM series, and the generic 58/80 mm units sold in Ghana. Implement via the `escpos` Rust crate exposed as a Tauri command `print_receipt(bytes)`. |
| Cash drawer | RJ11 into the printer | One ESC/POS pulse command (`ESC p`) opens it after a cash sale. Setting: on/off. |
| The PC | Windows 10/11 | Min spec: 4 GB RAM, any 64-bit CPU. The app must feel instant on this. |


---

## 9. UI/UX design specification

### 9.1 Design direction

The app borrows its identity from the two paper objects every Ghanaian wholesale shop already runs on: the green columnar ledger book and the thermal receipt roll. The interface should feel like those objects made fast — not like a SaaS dashboard template, and not like a consumer app. It is used 10 hours a day at arm's length, under bright shop lighting, often by someone standing. Every choice below follows from that.

Three hard constraints before aesthetics:

1. **Numbers are the content.** Every money figure in the app uses tabular (fixed-width) numerals so columns of prices align and totals can be compared at a glance.
2. **Light theme only in v1.** Shops are bright; dark UIs wash out and look broken next to a sunlit doorway.
3. **Touch targets ≥ 48 px, primary actions ≥ 56 px.** Some counters will get a touchscreen; all of them get hurried fingers.

### 9.2 Color tokens

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F4F6F5` | App background — cool off-white, like counter paper |
| `ledger` | `#0E5A45` | Primary. Nav rail, primary buttons, brand. From the green ledger book |
| `ledger-deep` | `#093F30` | Hover/pressed states of primary |
| `ink` | `#1C2522` | All body text |
| `tape` | `#FFFFFF` | The receipt-tape cart and receipt previews only |
| `carbon` | `#3A5FA8` | Informational: MoMo tags, links, focus rings — carbon-copy blue |
| `stamp` | `#C0392B` | Destructive + alerts: void, low stock, over/short — rubber-stamp red |
| `brass` | `#B98A2F` | One accent, used sparingly: today's revenue figure, change due |

Rules: `ledger` is the only saturated color allowed in quantity. `stamp` and `brass` appear only where they mean something (danger, money). No gradients anywhere. Elevation is a 1 px `ink`-at-8% border plus a soft shadow, nothing heavier.

### 9.3 Typography

| Role | Face | Notes |
|---|---|---|
| UI + headings | **Archivo** | Grotesque with real weight range. Headings at 600, sentence case. Bundled locally — no Google Fonts CDN, the app is offline |
| Money + receipt tape | **IBM Plex Mono** | Every cedi amount in the app, and the entire receipt-tape component. Its lining figures read like the thermal print they become |
| Data tables | Archivo with `font-variant-numeric: tabular-nums` | Product lists, reports |

Scale: 13 / 15 (body) / 18 / 24 / 34 / 48. The 48 is reserved for two moments: **change due** after a cash payment, and **today's revenue** on the dashboard. Those two numbers are the loudest things in the app.

### 9.4 Signature element — the live receipt tape

The cart is not a table with borders. It is rendered as the actual receipt: a white `tape` strip, IBM Plex Mono, dashed rules, a zig-zag perforated bottom edge (CSS clip-path), with the shop's name at the top. Each scan appends a line to the tape with a 150 ms slide-and-settle. What the cashier builds on screen is, visually, what the customer walks away holding — the print step is just the tape leaving the screen.

The same tape component renders receipt previews in Reprints and sale detail everywhere else. One component, three uses.

### 9.5 Layout

Persistent left nav rail, 72 px, icons + labels, `ledger` background: Sell · Reprints · Products · Dashboard · Reports · Settings. Cashiers see Sell and Reprints only. Active user chip and logout pinned at the bottom.

**Sales screen:**

```
┌──────┬──────────────────────────────┬────────────────────┐
│ nav  │  [scan input — always live]  │   K.B. BOABENG     │
│ rail │  ┌ search ──────────────┐    │  ──────────────    │
│      │  │ results / quick grid │    │  Cement 42.5R      │
│      │  │ (24 big tiles)       │    │   2 BOX @96  192.00│
│      │  │                      │    │  Nails 1kg         │
│      │  │                      │    │   5 PC @18.50 92.50│
│      │  └──────────────────────┘    │  ─ ─ ─ ─ ─ ─ ─ ─   │
│      │                              │  TOTAL   GHS 284.50│
│      │                              │ ┌────────────────┐ │
│      │                              │ │ CHARGE 284.50  │ │  ← 56px, ledger green
│      │                              │ └────────────────┘ │
└──────┴──────────────────────────────┴───────∿∿∿∿∿∿───────┘
                                            (perforation)
```

Tender panel slides over the tape column, not a centered modal — the cashier's eye never leaves the right edge. Change due renders at 48 px in `brass`.

**Dashboard:** today strip across the top (revenue in `brass` at 48 px), then a two-column body — left: hourly SVG bars and top products; right: the live feed styled as small tape stubs sliding in, and the cash-position card (expected drawer vs MoMo).

**Products:** dense table, 44 px rows, sticky header, right-side drawer for add/edit. Low-stock rows get a `stamp` dot, not a red row wash.

### 9.6 Motion and feedback

- Scan success: tape line slides in + one 80 ms background flash on the line + short beep (Web Audio, no asset file). Scan failure: horizontal shake on the scan input + lower-pitch tone. Sound toggle in Settings.
- Live-feed entries slide down 12 px and fade in.
- Nothing else animates. `prefers-reduced-motion` disables all of it.
- Every focusable element gets a 2 px `carbon` focus ring — the app must be fully driveable by keyboard because that is how fast cashiers use it.

### 9.7 Empty and error states

Written as directions, not moods:

- Empty cart tape: "Scan an item or press F2 to search."
- No products yet (fresh install): "Add your first product, or import from Excel." with both buttons.
- Printer unreachable: "Receipt R-000481 is saved. Printer not responding — check the USB cable, then press Retry."
- Barcode unknown: shows the scanned code verbatim so the admin can register it without rescanning.

---

## 10. Non-functional requirements

- Cold start to login screen < 3 s on a 4 GB machine.
- Scan-to-cart-line < 150 ms.
- Search results < 100 ms on a 10,000-product catalog (FTS5 index).
- All writes transactional; the app must survive power loss with no partial sales.
- PINs hashed (argon2). DB file readable only by the OS user account; SQLCipher encryption is a v2 option, not v1.
- Every price change, void, override, and PIN reset lands in `audit_log`.
- Installer: single `.msi` / `.exe` via Tauri bundler. Auto-update off by default (offline).

---

## 11. Build phases for Claude Code

**Phase 1 — Skeleton (prove the stack):** Tauri v2 + React + Vite scaffold, SQLite plugin wired, schema migration on first run, PIN login, nav rail, seed data script.
**Phase 2 — Sell:** sales screen, scan capture, search + quick grid, cart with PC/BOX logic, cash tender, sale transaction, stock decrement.
**Phase 3 — Print:** ESC/POS receipt over USB, test-print in Settings, HTML fallback, Reprints screen, F9.
**Phase 4 — Products:** CRUD, categories, scan-to-fill barcode, restock dialog, Excel import.
**Phase 5 — Money views:** dashboard with live feed, hourly chart, top products, cash position; end-of-day screen and Z-report.
**Phase 6 — Admin depth:** reports + Excel export, users management, audit log viewer, voids, MoMo/split tender.
**Phase 7 — Hardening:** backups (manual + auto), restore, recovery phrase, keyboard-shortcut pass, low-spec performance pass, installer.

Each phase ends with the app runnable and demoable. Do not start a phase until the previous one works end to end.

---

## 12. Acceptance criteria (v1 done means)

1. With Wi-Fi off and Ethernet unplugged: log in, scan 5 items, sell 2 of them as boxes, take split cash/MoMo payment, print the receipt, and see the dashboard update — all successfully.
2. Kill the app's power mid-payment; on restart the sale either exists completely (with receipt reprintable) or not at all. Stock matches whichever happened.
3. Rename a product and change its price; a receipt from before the change reprints byte-identical to the original apart from the `*REPRINT*` marker.
4. Sell down to below a product's threshold; the dashboard flags it within one second.
5. A new cashier with no training completes a 3-item manual (no-barcode) sale in under 60 seconds.
6. Back up to a USB stick, wipe the app data folder, restore from the stick, and reprint last week's receipt.
