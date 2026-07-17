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

## 1. Status: feature-complete, v3 built, one review pass outstanding

Everything in the PRD is built, plus the v1.5, v2, and v3 extras. **47 commits, all
on `main`, working tree clean.** Typecheck + lint pass.

- ✅ Phases 1–7 (the PRD's whole build plan, `pos-prd.md §11`)
- ✅ v1.5 barcode-label printing (§6.3)
- ✅ v2 customer accounts & credit sales (§1) + credit-limit enforcement
- ✅ v3: product variants/families, barcode aliases, custom selling units, smart
  pricing (promo/auto-wholesale/customer-type), checkout hold-resume/tax/notes,
  full inventory movement types, receipt barcode, valuation/slow-mover/alert
  reports, idle-session lock, Excel import/export extended to match — see §3b.
- ✅ A UI refresh to a clean "SiMi Shop" grocery-dashboard look
- ⚠️ **A `/code-review high` pass over the v3 diff surfaced 10 findings (7 real
  bugs, 3 cleanup) that are documented but *not yet fixed* — see §9 for the
  list. The most serious are a stuck-wholesale-pricing bug and two migration
  atomicity gaps that can brick the app on power loss mid-upgrade.**
- ⏳ **Windows-only work is still pending** — see `HANDOFF.md` (installer + thermal
  USB write). Both genuinely need the Rust toolchain / real hardware.

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
  against `barcode_aliases` only on miss. Two round-trips on the alias path —
  flagged in code review as a hot-path inefficiency (§9), not yet fixed.
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
  keep them in sync. **Known gap (unfixed):** `TenderPanel`'s credit-customer
  picker sets this flag `true` for a wholesale customer but never sets it back
  to `false` — see finding #1 in §9.
- **Held sales are a single opaque JSON blob** (`held_sales.cart_json`, written
  by `db/queries/held.ts`) — the entire `CartLine[]` + discount + wholesale-mode
  is `JSON.stringify`'d, not decomposed into rows. Simple, but it means (a) held
  sales aren't queryable in SQL for reporting ("how much is parked right now"),
  and (b) `takeHeld()` deletes the row *before* confirming the JSON parses —
  both flagged in code review, not yet fixed (§9).
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

---

## 7. Build history (47 commits, in order)

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
- **Hardening (in progress)** a `/code-review high` pass over the v3 diff ran
  and reported 10 findings (§9) — the review itself is done, the fixes are not.

---

## 8. How to keep working (the methodology)

The user's PDF ("Practical Vibe Coding") was turned into a skill at
`.claude/skills/practical-vibe-coding/`. It's the operating system for this repo:

> **AGENTS.md (here: `CLAUDE.md`) is the source of truth. One task per prompt.
> Constraints protect what's already built. Verify each step before moving on.
> One commit per working feature.**

The loop that produced all 47 commits: **read `CLAUDE.md` → build the smallest
useful slice → typecheck + lint → verify it in the browser → commit with what was
verified → next.** Keep the diff small enough to review at a glance.

## 9. Sensible next steps

**Outstanding from the `/code-review high` pass on the v3 diff** (unfixed as of
`ec0cc6b`) — ranked most severe first, each verified against the actual code, not
just trusted from the reviewer:

1. **Wholesale pricing sticks after picking a wholesale customer**
   (`screens/Sell/TenderPanel.tsx:255`) — the credit-customer dropdown's
   `onChange` calls `setWholesaleMode(true)` for a wholesale customer but never
   `(false)` for a retail one or on clearing the selection. Can under-charge a
   later retail sale in the same cart session. **Fix: derive wholesale-mode from
   the selected customer at commit time instead of mutating cart state from a
   dropdown handler**, or add the missing `else setWholesaleMode(false)`.
2. **Two migration atomicity gaps that can brick the app on power loss**
   (`db/migrate.ts:56` and `:96`) — the sales `tax_pesewas`/`note` columns and
   the 11 product v3 columns are each added via multiple un-transacted
   `ALTER TABLE` calls under a single guard check. A crash between statements
   leaves the guard permanently wrong: either every sale fails forever ("no
   column named note") or the app crash-loops on boot (`ALTER ADD COLUMN sku`
   re-run → "duplicate column name"). **Fix: guard each ALTER individually with
   its own `missingColumn` check**, not one check per group.
3. **`takeHeld()` deletes before confirming the JSON parses**
   (`db/queries/held.ts:70`) — a corrupted `cart_json` row is deleted first,
   *then* `JSON.parse` throws; the parked sale is unrecoverably lost with no
   error shown. **Fix: parse first, delete only on success.**
4. **FK enforcement can stay off for a session after a failed table rebuild**
   (`db/migrate.ts:151`, `rebuildSaleItemsForV3`/`rebuildMovementsForV3`) — the
   catch block re-throws before the trailing `PRAGMA foreign_keys = ON` runs.
   **Fix: put the pragma restore in a `finally`.**
5. Resuming a held sale doesn't call `hydrateUnits` for its lines
   (`store/cartStore.ts:249`) — a narrow race (hold immediately after adding a
   custom-unit product) can strand a resumed line without its selling units.
6. `listHeld()`'s preview total excludes tax (`db/queries/held.ts:53`) —
   cosmetic, but misleads the cashier about what a held sale will actually
   charge once resumed.
7. `analytics.ts` `lowStockProducts()` wasn't updated with the v3 `Product`
   columns — currently latent (Dashboard doesn't read the missing fields yet).
8. Two cleanup items: an extra DB round-trip per line in the sale-commit loop
   (`applyStockMovement`'s SELECT duplicates work `commitSale` already did), and
   three copy-pasted table-rebuild functions in `migrate.ts` that a shared
   `rebuildTable()` helper would collapse into one (and would have made #4 a
   one-place fix instead of three).

**Other genuine options:**
9. **Finish on Windows** (`HANDOFF.md`) — the installer + thermal USB write. This
   is the only thing between here and shipping, once the above is fixed.
10. **Online mode** — only if the shop ever needs multiple tills sharing data.
    It's a contained change behind `src/native/` (+ a server for auth/DB), *not*
    a rewrite. Note the browser mock's PIN hash is a **dev stub — never ship it
    as real auth**.
