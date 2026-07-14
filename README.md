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
- [ ] Phase 3 — Print (ESC/POS, reprints, F9)
- [ ] Phase 4 — Products CRUD, restock, Excel import
- [ ] Phase 5 — Dashboard + end-of-day
- [ ] Phase 6 — Reports, users, audit, voids, MoMo/split
- [ ] Phase 7 — Backups, recovery, performance, installer

## Methodology

This project is built with the **practical-vibe-coding** skill (`.claude/skills/`):
one feature per prompt, verify, commit. Don't start a phase until the previous one
runs end to end.
