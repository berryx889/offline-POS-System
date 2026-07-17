# CounterTop POS — project context & session handoff

**Read this first when picking the project up in a new chat.** It's the decision log
and current state. The other docs each have one job:

| File | Purpose |
|---|---|
| `pos-prd.md` | The full product spec (the reference — sections are cited as §N throughout) |
| `CLAUDE.md` | The working contract: stack, architecture, design tokens, non-negotiable rules |
| `HANDOFF.md` | Windows build guide + the remaining on-device tasks |
| `CONTEXT.md` | ← you are here: what was built, why, and the gotchas |
| `.claude/skills/practical-vibe-coding/` | The build methodology (from the user's PDF) |

---

## 1. Status: feature-complete, v3 built and hardened

Everything in the PRD is built, plus the v1.5, v2, and v3 extras. **54 commits, all
on `main`, working tree clean.** Typecheck + lint pass.

- ✅ Phases 1–7 (the PRD's whole build plan, `pos-prd.md §11`)
- ✅ v1.5 barcode-label printing (§6.3)
- ✅ v2 customer accounts & credit sales (§1) + credit-limit enforcement
- ✅ v3: product variants/families, barcode aliases, custom selling units, smart
  pricing (promo/auto-wholesale/customer-type), checkout hold-resume/tax/notes,
  full inventory movement types, receipt barcode, valuation/slow-mover/alert
  reports, idle-session lock, Excel import/export extended to match — see §3b.
- ✅ A UI refresh to a clean "SiMi Shop" grocery-dashboard look
- ✅ A `/code-review high` pass over the v3 diff surfaced 10 findings; all 9
  worth fixing are **fixed and verified live against the DB** (`d032490`,
  `9bf0e13`) — see §9 for what each was and how it was proven fixed. 1 finding
  (a redundant-SELECT "optimization") was reviewed and deliberately left
  alone — it would trade away a transaction-isolation guarantee for a minor
  perf win; reasoning in §9, not an oversight.
- ⏳ **Windows work is partially prepared, still blocked on real hardware.** The
  thermal-printing Rust code (`7f6f179`) is written and compiles cleanly on
  macOS, but was never compiled for Windows — no Windows target exists in any
  environment this has been worked in. `HANDOFF.md` §2.3 says exactly what's
  unverified and what the first on-device step should be. Icon generation and
  the installer build are untouched — both genuinely need the Tauri CLI
  running on a real Windows box.

## 2. What the app is

A **fully offline** desktop POS for a Ghanaian wholesale-and-retail shop. Tauri v2
(Rust) + React 18 + Vite + TypeScript, local SQLite. No server, no cloud. Runs on a
counter PC in Windows. Money is **integer pesewas** everywhere (never floats).

**Screens:** Login (PIN pad) · Sell · Reprints · Products · Customers · Dashboard ·
End of day · Reports · Settings.

---

## 3. Key decisions (and why) — don't undo these casually

**The native adapter boundary (`src/native/`) is the most important design choice.**
Every platform/data call goes through it. Screens/stores/queries never touch Tauri.
This is why:
- the whole app is buildable and testable on macOS against a **sql.js browser mock**,
- the Tauri→Electron fallback (§3) stays open,
- adding an **online mode later** is a contained change (add `src/native/web.ts`) —
  see the signpost comment in `src/native/index.ts` and the README section.

**Correctness rules that are load-bearing (from the PRD):**
- A sale commits in **one transaction**: sale + items + stock decrements + movements.
  Verified: an over-sell throws `InsufficientStockError` and rolls back with zero
  partial writes.
- Sale lines are **snapshots** (`product_name`, `unit_price_pesewas` copied at sale
  time). Verified: renaming + repricing a product leaves old receipts identical.
- Receipt numbers come from a **sequence**, never the clock.
- Retail (per piece) and wholesale (per box) are **independent numbers** — never
  compute one from the other. Stock always lives in **pieces**.
- Price changes, voids, overrides, PIN resets, day closes → `audit_log`.

**Deliberate implementation choices:**
- **No new dependencies** beyond the PRD's stack. The Code-128 encoder
  (`src/barcode/code128.ts`) and the SVG charts are hand-rolled on purpose.
- **FTS5 is opportunistic**: `src/db/fts.ts` creates it if the SQLite build has it,
  else search falls back to LIKE. The dev sql.js build lacks FTS5, so dev always
  uses LIKE — same results, slower. It activates automatically on the real build.
- **Schema v2 migration** (`src/db/migrate.ts`): adding customer credit needed new
  `sales` columns *and* a widened `payment_method` CHECK. Existing DBs get a
  **table rebuild** (preserving rows/ids, FK-safe), triggered by detecting the
  missing column — not by version number, so it can't run twice or on fresh DBs.
- **Printing is best-effort and never blocks a committed sale.**

### 3b. v3 decisions (variants, smart pricing, hold/resume, movements)

- **Every product row is a sellable *variant*.** `products.family` is an optional
  free-text grouping label ("Milo") that clusters variants ("Milo 20g Sachet",
  "Milo 400g Tin"…) in the Products list and prefills the "+ Variant" flow
  (brand/supplier/category copied from a sibling). There's no separate parent
  "product" table — deliberately, to avoid a join on every read; `family` is
  just a string, so a typo silently creates a new group. If that becomes a real
  problem, promote it to a `product_families` table with an FK.
- **Barcode aliases resolve after the primary barcode** (`findByBarcode` in
  `db/queries/products.ts`): own-barcode lookup first, then a second query
  against `barcode_aliases` only on miss — two round-trips specifically on the
  alias path (most scans hit the fast path in one). Noted as a possible
  hot-path optimization if alias scanning turns out to be common enough to
  matter; not currently a tracked issue.
- **Selling units are a full replace-as-a-set on save** (`db/queries/units.ts`
  `saveUnits`): the drawer's editor deletes all of a product's units and
  reinserts the new list in one transaction, rather than diffing adds/edits/
  removes. Simple and correct; fine at the scale (a handful of units per
  product).
- **Smart pricing is one pure function, not scattered ifs**: `cartStore.ts`
  `pieceRate()`/`unitPrice()` is the single priority chain — admin override >
  per-piece wholesale (wholesale-mode OR qty ≥ threshold) > promo > retail.
  Every other piece of code (receipts, reports) reads the *stored* snapshot on
  `sale_items`, never recomputes pricing — so there's exactly one place this
  logic can be wrong.
- **Cart-level wholesale mode is a `CartLine.wholesale` flag copied onto every
  line**, not a single cart-wide read. `setWholesaleMode` maps over all lines to
  keep them in sync. `TenderPanel`'s credit-customer picker sets this flag from
  the selected customer's type — **fixed in `d032490`** to set it
  unconditionally on every change (including clearing), not just the
  wholesale case; see §9 #1.
- **Held sales are a single opaque JSON blob** (`held_sales.cart_json`, written
  by `db/queries/held.ts`) — the entire `CartLine[]` + discount + wholesale-mode
  is `JSON.stringify`'d, not decomposed into rows. Simple, but held sales still
  aren't queryable in SQL for reporting ("how much is parked right now") —
  a real limitation of this design, not planned to change unless that report
  is actually needed. `takeHeld()` now parses before deleting (fixed in
  `d032490`, §9 #3), so a corrupted row survives instead of vanishing.
- **Every stock change goes through one function**: `db/queries/movements.ts`
  `applyStockMovement()` reads current `stock_pieces`, writes the new value, and
  inserts the `stock_movements` row with `prev_pieces`/`new_pieces` — called by
  `commitSale`, `voidSale`, and `recordStockChange` (purchase/restock/return/
  damaged/expired/transfer/adjustment). The one exception is opening stock in
  `createProduct`, which hand-writes the movement row against a 0 baseline
  *because* the product insert already set `stock_pieces` — calling
  `applyStockMovement` there would double-count. That's intentional, not
  leftover duplication.
- **Tax is a flat percent from Settings**, computed inside `commitSale` on
  `(subtotal − discount)` and stored on the sale row (`tax_pesewas`). The Sell
  screen independently recomputes the same formula for on-screen display before
  the sale commits — the two are currently guaranteed to agree (same pure
  inputs, no async gap), but it's a duplicated formula, not a shared one
  (flagged as a cleanup item, §9).
- **Idle-session lock is one `useEffect`** (`auth/useIdleLock.ts`) that arms a
  `setTimeout` on `mousedown`/`keydown`/`touchstart`/`wheel` and calls
  `sessionStore.logout()` — the existing PIN screen *is* the lock screen, no new
  UI needed. Disabled by default (`idle_lock_minutes = "0"`).

---

## 4. Design system (after the UI refresh)

Reference was a clean green grocery dashboard ("SiMi Shop"). Tokens live in
`tailwind.config.ts` and are documented in `CLAUDE.md`.

- `ledger #27A567` primary green (fills, active nav, prices) · `ledger-deep #1E8A54`
  hover · `leaf #E9F6EE` tint · `paper #F1F6F2` bg · `ink #1C2522` text ·
  `tape #FFFFFF` surfaces · `carbon #3A5FA8` info/focus · `stamp #E0503A` danger ·
  `brass #B98A2F` money accent (change due, today's revenue only)
- **Sidebar**: white, brand at top, icon+label rows, **solid green pill** for active,
  red logout at the bottom.
- **Cards**: `rounded-2xl bg-tape shadow-card` (soft diffuse shadow). One border
  weight app-wide: `border-ink/8`. Small stat cards `rounded-xl`, inputs `rounded-lg`.
- **Product cards** (quick grid + search results): green price + green circular "+".
- **Deliberately preserved as POS-functional, not decoration:** the **receipt tape**
  (IBM Plex Mono, dashed rules, CSS clip-path perforation) and **tabular money**
  everywhere. Don't "clean these up" into sans/plain — a receipt must look like a
  receipt and price columns must align.
- Icons are a hand-rolled inline SVG set (`src/components/Icon.tsx`) — no icon
  library, offline-safe. Emoji were removed on purpose.

---

## 5. How to run

```bash
npm install
npm run dev          # http://localhost:1420 — browser dev mode (no Rust needed)
npm run typecheck    # tsc --noEmit
npm run lint
```

**Seed logins:** Owner / admin / **482913** · Ama / cashier / **1234**

Dev mode uses the **mock adapter**: real `schema.sql` running in sql.js, persisted to
`localStorage` (key `countertop-dev-db`). Clear that key to reset the database.

For the real desktop app (needs Rust): `npm run tauri dev` — see `HANDOFF.md`.

---

## 6. Dev-environment gotchas (hard-won — save yourself the debugging)

These cost real time during the build:

1. **`window.print()` blocks the headless browser.** Auto-print after a sale is
   therefore **skipped when `native.kind === "mock"`** (see `SellScreen.onSaleDone`).
   Real Tauri builds still auto-print. If you script the UI and it hangs, a print
   or `confirm()` dialog is probably open — press Escape.
2. **`confirm()` dialogs also block automation** ("Clear sale", delete product).
3. **Cache-busted dynamic imports create a *separate* module instance.** Doing
   `import('/src/store/cartStore.ts?t=' + Date.now())` gives you a **different
   Zustand store** than the app's — state assertions will silently fail. Import
   without the query string to touch the real store.
4. **sql.js `export()` ends an open transaction.** The mock adapter tracks
   transaction depth and skips persisting mid-transaction (`src/native/mock.ts`).
   This bug originally caused *partial sales* — exactly what the transaction exists
   to prevent. Don't remove that guard.
5. **Screenshots can lag the DOM** after JS-driven navigation. Trust `read_page` /
   `javascript_tool` over a stale frame; re-navigate to force a repaint.
6. **The preview pane is ~800px wide**; the app targets 1280px+. Two-column screens
   (Sell, Customers, Reprints) look cramped in preview — that's the viewport, not
   the design.
7. **React StrictMode double-invokes effects** — `migrate()` is a shared in-flight
   promise so the seed can't race and double-insert.
8. **Vite + sql.js**: don't add sql.js to `optimizeDeps.exclude` — it's UMD and
   needs pre-bundling to get a default export.
9. **Full page `navigate()` drops the Zustand session** (no persistence, by
   design — see §3). If you `navigate()` to reload after a DB mutation made via
   a raw console import, you have to log back in via script/coordinates before
   the next check; assuming you're still authenticated after a reload is a fast
   way to misdiagnose a feature as broken.
10. **The browser console's log buffer persists across `navigate()` reloads**
    (DevTools' own "preserve log" behavior, not this app's). `read_console_messages`
    after several reloads returns a mix of old and new session logs with no
    reload boundary marker — a burst of old entries can look like a live bug
    (e.g. "the same event fired 50 times") when it's just accumulated history.
    Don't trust console-message *counts* across a session; trust the last few
    entries' relative order, or better, clear expectations by checking actual
    app state (DOM/DB) instead of counting log lines.
11. **`setTimeout` in a background/rarely-focused Browser-pane tab is not exact.**
    Verifying the idle-lock timer at exactly the threshold (65s wait for a 60s
    timer) failed once, then passed cleanly at 75s — there's async overhead in
    the wakeup/notification chain (background bash → task notification → tool
    call) that can eat several seconds of margin. Give timer-based features at
    least 15–20% headroom when verifying, not the exact threshold.
12. **The dev sql.js WASM build never actually enforces foreign keys**, even
    though `mock.ts` runs `PRAGMA foreign_keys = ON` at connection-open and
    `migrate.ts` explicitly toggles it around every table rebuild. Confirmed
    two ways: `PRAGMA foreign_keys` always reads back `0` no matter what was
    just set, and — more importantly — inserting a row with a nonexistent
    `product_id` succeeds silently on a completely fresh DB, before any app
    code has touched the pragma at all. This is a property of the bundled
    WASM binary (same shape as the FTS5 gotcha, §3), not a bug in this app's
    code — the pragma calls are still correct and still matter on the real
    Tauri/SQLite build. Don't try to verify FK enforcement by testing it live
    in dev; it will always look broken regardless of the actual code.

---

## 7. Build history (54 commits, in order)

Phases follow `pos-prd.md §11`; each slice was verified in the browser before commit.

- **Phase 1** `c7e9b05` — scaffold, schema+migrate+seed, PIN login, nav rail
- **Phase 2** `56b7a64` `d799719` `fc4986c` — receipt-tape cart & PC/BOX · scan
  capture + quick grid · cash tender + the one-transaction sale
- **Phase 3** `b8c6cc1` `f509724` `00b73ef` — ESC/POS + HTML fallback · Reprints ·
  F9 + Settings printer/test print
- **Phase 4** `f6dadc7` `526a466` `cf914dc` — CRUD + categories + audit · restock ·
  Excel import
- **Phase 5** `a26226f` `6198716` `64ff73b` — live dashboard · SVG chart + top +
  low stock · end-of-day Z-report
- **Phase 6** `c15c717` `cdf7556` `cfc2f4a` — reports + Excel export · MoMo/split +
  voids · users + audit viewer
- **Phase 7** `9244d67` `39cf4e4` `6fe8646` `d49cae5` — backups/restore · recovery
  phrase · shortcuts · FTS5
- **Extras** `147c730` discount + price override · `9cbc739` barcode labels ·
  `8de0b1a` customer credit · `af162cb` credit limits
- **UI** `4cecf34` icon set · `ed986fd` `d9d15ad` `dfae66b` `60921b4` SiMi refresh
- **v3** `43aa3bb` schema (variant fields, aliases, selling units, movement
  history, tax/notes) · `d150ccd` product variants UI (family/brand/supplier/
  SKU/description/expiry/batch/image) · `8d77638` barcode aliases + internal
  code generation · `f9f63be` selling units (custom units, own price/pieces) ·
  `6ea6615` smart pricing (promo, auto-wholesale threshold, wholesale mode,
  customer type) · `f46c399` checkout tax/notes/hold-resume + inventory
  movement types + receipt barcode + valuation/slow-mover/alert reports ·
  `f1346ef` idle-session auto-lock · `ec0cc6b` Excel import/export extended to
  match v3 fields
- **Hardening** `ff3b853` docs (this file, updated for v3) · `d032490` fixed
  and live-verified all 7 correctness bugs from the `/code-review high` pass ·
  `9bf0e13` collapsed the migrate.ts rebuild duplication (initially skipped,
  revisited after the FK-restore fix proved the risk of 3 copies was real) —
  §9 has the detail + what proved each fix correct; 1 finding (a redundant-
  SELECT "optimization") was reviewed and deliberately left alone.
- **Windows prep** `7f6f179` implemented the thermal-printing Rust code
  (HANDOFF.md §2.2/2.3) — compiles clean on macOS (Rust toolchain installed
  this session), never compiled for Windows; see §1 and HANDOFF.md §2.3 for
  exactly what remains unverified.

---

## 8. How to keep working (the methodology)

The user's PDF ("Practical Vibe Coding") was turned into a skill at
`.claude/skills/practical-vibe-coding/`. It's the operating system for this repo:

> **AGENTS.md (here: `CLAUDE.md`) is the source of truth. One task per prompt.
> Constraints protect what's already built. Verify each step before moving on.
> One commit per working feature.**

The loop that produced all 54 commits: **read `CLAUDE.md` → build the smallest
useful slice → typecheck + lint → verify it in the browser → commit with what was
verified → next.** Keep the diff small enough to review at a glance.

## 9. Sensible next steps

**Fixed in `d032490`** — the 7 correctness bugs from the `/code-review high` pass
(`ff3b853`'s §9 had the original unfixed list; kept here as a record of what was
wrong, how it was fixed, and how it was proven fixed — not a to-do list anymore):

1. ~~**Wholesale pricing sticks after picking a wholesale customer**~~ FIXED —
   `TenderPanel.tsx`'s customer `onChange` now calls `setWholesaleMode(...)`
   unconditionally on every selection (including clearing), not just for a
   wholesale pick. Verified live: walked a wholesale → retail → cleared
   selection on Milo 400g Tin and watched the piece price go 50.00 → 55.00 →
   55.00 (previously would have stuck at 50.00 after the first pick).
2. ~~**Two migration atomicity gaps**~~ FIXED — every v3 `ALTER TABLE` is now
   individually guarded; `addProductV3Columns` reads the table's actual
   columns once and only adds what's missing. Verified live: manually dropped
   9 of the 11 v3 product columns and `note` from `sales` (recreating "crashed
   mid-migration"), ran `migrate()` again, confirmed no throw and both tables
   ended up complete.
3. ~~**`takeHeld()` deleted before confirming the JSON parsed`**~~ FIXED —
   parses first now; a corrupted row survives. Verified live: inserted a
   `held_sales` row with `cart_json = '{not valid json'`, called `takeHeld()`,
   confirmed it returned `null` *and* the row was still in the table.
4. ~~**FK enforcement could stay off after a failed rebuild**~~ FIXED — the
   `PRAGMA foreign_keys = ON` restore moved into a `finally` in all three
   rebuild functions.
5. ~~**Resuming a held sale didn't refresh custom selling units`**~~ FIXED —
   `restore()` now calls `hydrateUnits` for every distinct product in the
   resumed cart. Verified live: held a cart with a deliberately empty
   `extraUnits: []` (simulating the async race), resumed it, confirmed the
   line's units were repopulated after `restore()` ran.
6. ~~**Held-sale list total excluded tax`**~~ FIXED — `listHeld()` now takes a
   tax-rate parameter and applies it. Verified live: `listHeld(5)` on the same
   row returned exactly 5% more than `listHeld(0)`.
7. ~~**`lowStockProducts()` used a stale column list`**~~ FIXED at the root —
   `SELECT_PRODUCT` is exported from `products.ts` and reused instead of a
   second hand-copied list. Verified live: a low-stock row now carries every
   v3 `Product` field.

**Also done since (`9bf0e13`):** the `migrate.ts` rebuild-function dedup
(originally listed above as deliberately skipped) was revisited and applied —
`rebuildTable()` is now the one shared implementation `rebuildSalesForV2`/
`rebuildSaleItemsForV3`/`rebuildMovementsForV3` each call with just their own
DDL/column-list data. Verified live and thoroughly, since a bug here corrupts
real sale history: took a DB with a real committed sale (with a note, a
sale_item, a stock_movement), manually downgraded all three tables back to
their pre-rebuild shapes (dropped the v3 columns, restored the old narrower
CHECK on `sale_items`), ran `migrate()` again, and confirmed all three tables
came back to the v3 shape with the original row data byte-for-byte intact
(same receipt number, product name, qty, unit, change_pieces). See gotcha #12
(§6) for an incidental discovery made while verifying this.

**Deliberately left alone** (reviewed, not an oversight):
- The `applyStockMovement` "redundant SELECT" efficiency finding — removing it
  would make `commitSale`'s stock write trust a value read before the
  transaction's write lock, weakening the isolation `BEGIN IMMEDIATE` exists
  for. Not a good trade for a minor perf win.

**Other genuine options:**
- **Finish on Windows** (`HANDOFF.md`) — the installer + thermal USB write. This
  is the only thing between here and shipping.
- **Online mode** — only if the shop ever needs multiple tills sharing data.
  It's a contained change behind `src/native/` (+ a server for auth/DB), *not*
  a rewrite. Note the browser mock's PIN hash is a **dev stub — never ship it
  as real auth**.
