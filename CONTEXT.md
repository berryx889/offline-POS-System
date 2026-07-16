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

## 1. Status: feature-complete

Everything in the PRD is built, plus the v1.5 and v2 extras. **38 commits, all on
`main`, pushed to https://github.com/berryx889/offline-POS-System, working tree
clean.** Typecheck + lint pass.

- ✅ Phases 1–7 (the PRD's whole build plan, `pos-prd.md §11`)
- ✅ v1.5 barcode-label printing (§6.3)
- ✅ v2 customer accounts & credit sales (§1) + credit-limit enforcement
- ✅ A UI refresh to a clean "SiMi Shop" grocery-dashboard look
- ⏳ **Only remaining work is on Windows** — see `HANDOFF.md` (installer + thermal
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

---

## 7. Build history (38 commits, in order)

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

---

## 8. How to keep working (the methodology)

The user's PDF ("Practical Vibe Coding") was turned into a skill at
`.claude/skills/practical-vibe-coding/`. It's the operating system for this repo:

> **AGENTS.md (here: `CLAUDE.md`) is the source of truth. One task per prompt.
> Constraints protect what's already built. Verify each step before moving on.
> One commit per working feature.**

The loop that produced all 38 commits: **read `CLAUDE.md` → build the smallest
useful slice → typecheck + lint → verify it in the browser → commit with what was
verified → next.** Keep the diff small enough to review at a glance.

## 9. Sensible next steps

Nothing in the PRD is outstanding. Genuine options:
1. **Finish on Windows** (`HANDOFF.md`) — the installer + thermal USB write. This is
   the only thing between here and shipping.
2. **Hardening** — a `/code-review` pass over the credit/migration code; partial
   credit (pay some now, rest on account).
3. **Online mode** — only if the shop ever needs multiple tills sharing data. It's a
   contained change behind `src/native/` (+ a server for auth/DB), *not* a rewrite.
   Note the browser mock's PIN hash is a **dev stub — never ship it as real auth**.
