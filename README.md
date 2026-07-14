# CounterTop POS

A fully offline desktop point-of-sale app for Ghanaian wholesale & retail shops.
Tauri v2 (Rust) + React + Vite + TypeScript, local SQLite. See `pos-prd.md` for the
full product spec and `CLAUDE.md` for the working build contract.

## Two ways to run

**1. Browser dev (no Rust needed) — fastest loop**
```bash
npm install
npm run dev        # http://localhost:1420
```
In the browser the app uses a dev **mock** native adapter (`src/native/mock.ts`)
that runs the real SQLite schema via sql.js in-memory (persisted to localStorage).
This is enough to build and verify all UI and data flows on any machine.

**2. Full desktop app (Windows target) — needs the Rust toolchain**
```bash
# install Rust: https://rustup.rs  then:
npm install
npm run tauri dev      # launches the real Tauri window + SQLite + printing
npm run tauri build    # produces the .msi / .exe installer
```
Before the first `tauri build`, generate app icons once:
`npm run tauri icon path/to/logo.png`.

## First login

Seed data creates two users:

| User  | Role    | PIN     |
|-------|---------|---------|
| Owner | admin   | 482913  |
| Ama   | cashier | 1234    |

Change these in Settings once that screen lands (Phase 3+).

## Where things live

- `src/native/` — the ONLY code that talks to the platform (SQLite, print, fs).
  Swapping Tauri for Electron would only touch this folder.
- `src/db/` — canonical `schema.sql`, migration/seed, typed query modules.
- `src/screens/` — one folder per screen; screens hold no platform calls.
- `src/components/`, `src/store/`, `src/auth/`, `src/money.ts`, `src/stock.ts`.
- `src-tauri/` — the Rust shell (PIN hashing, ESC/POS printing, cash drawer).

## Build status (per `pos-prd.md §11`)

- [x] **Phase 1 — Skeleton:** scaffold, SQLite schema + migration + seed, PIN login,
      nav rail, routed screens, read-only Products list proving the stack.
- [x] **Phase 2 — Sell:** barcode scan capture + manual search + quick grid, live
      receipt-tape cart with PC/BOX pricing, cash tender with change due, and the
      sale committed in one transaction with stock decrement + movements.
- [x] **Phase 3 — Print:** ESC/POS receipt generation + auto-print with OS/HTML
      fallback, the Reprints screen (search + preview + reprint), F9 reprint-last,
      and Settings printer config with a test print. (Thermal USB write in Rust is
      stubbed — see note below; the HTML/OS-dialog path works cross-platform now.)
- [x] **Phase 4 — Products:** full CRUD with add/edit drawer (independent
      retail/wholesale, scan-to-fill barcode, inline categories), deactivate-vs-
      delete, search/category/low-stock filters, restock (as a stock movement),
      and validated Excel bulk import. Price changes write to the audit log.
- [x] **Phase 5 — Money views:** live dashboard (today's revenue, cash position,
      reverse-chronological feed, hourly SVG chart today-vs-last-week, top products,
      low-stock alerts) refreshing on the sale:completed event; end-of-day screen
      with drawer reconciliation (over/short) and a printed Z-report + day_close.
- [x] **Phase 6 — Admin depth:** reports (date-range summary, by product/category/
      cashier, voided log, stock movements) with multi-sheet Excel export; MoMo &
      split tender; sale voids (manager-override, restores stock, audited); users &
      PINs management; and the audit-log viewer.
- [x] **Phase 7 — Hardening:** backups (manual `.ctbk` to USB + daily auto-snapshot
      keeping the last 14) and restore; recovery phrase with PIN reset from the login
      screen; the full keyboard-shortcut pass (F2/F4/F6/F9/Esc) with on-screen hints;
      and FTS5 product search with a LIKE fallback. Installer + thermal USB write are
      the remaining **on-Windows** steps below.

All seven phases are feature-complete. What's left is inherently on-device.

## Finish on the Windows machine

These need the Rust toolchain and/or real hardware, so they're built-with-notes
here and verified there:

1. **Build the installer:** install Rust (https://rustup.rs), then
   `npm run tauri build` produces the `.msi` / `.exe` (targets already set in
   `src-tauri/tauri.conf.json`). Generate icons once with `npm run tauri icon`.
2. **Thermal USB write:** finish the raw write inside `print_receipt`
   (`src-tauri/src/lib.rs`) — the standard Windows path is OpenPrinter →
   StartDocPrinter → WritePrinter → ClosePrinter. Until then, sales print through
   the OS dialog with the HTML receipt (a first-class fallback per the PRD).
3. **Confirm the backup DB path:** `src/native/tauri.ts` reads/writes `pos.db` in
   the app config dir — verify the SQL plugin resolves there on Windows.
4. **FTS5:** the bundled SQLite includes FTS5, so `setupFts()` will succeed and
   search uses the index automatically (the dev sql.js build falls back to LIKE).

## Methodology

This project is built with the **practical-vibe-coding** skill (`.claude/skills/`):
one feature per prompt, verify, commit. Don't start a phase until the previous one
runs end to end.
