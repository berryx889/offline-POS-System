# CounterTop POS — Windows build & handoff

All seven build phases (`pos-prd.md §11`) are **feature-complete and verified in the
browser dev harness**. This document is for the developer finishing the app on a
Windows machine: how to run it natively, the four remaining on-device tasks, and
the pre-ship checklist.

Everything here talks to the platform through **`src/native/`** only — you never
touch a Tauri API from a screen. That's what kept the whole app buildable and
testable on macOS against a sql.js mock; on Windows it runs against real SQLite.

---

## 1. Run it natively

```bash
# one-time: install the Rust toolchain
#   https://rustup.rs   (plus the MSVC build tools on Windows)

npm install
npm run tauri dev       # real Tauri window: SQLite at %APPDATA%/countertop/pos.db
```

First login uses the seeded accounts (change them in Settings):

| User  | Role    | PIN     |
|-------|---------|---------|
| Owner | admin   | 482913  |
| Ama   | cashier | 1234    |

---

## 2. Remaining on-device tasks

### 2.1 Generate real icons (blocks `tauri dev` too, not just the build)

```bash
npm run tauri icon path/to/logo.png   # once — generates src-tauri/icons/*
```

`tauri.conf.json` already points at `src-tauri/icons/{32x32,128x128,128x128@2x}.png`
and `icon.ico`, and **`cargo check`/`tauri dev` fail outright without them** —
`tauri::generate_context!()` opens the icon files at compile time, not just at
bundle time. `src-tauri/icons/` is gitignored on purpose (see 2.2) — there is
nothing there until you run this.

### 2.2 Build the installer

```bash
npm run tauri build   # -> .msi and .exe in src-tauri/target/release/bundle/
```

Targets (`msi`, `nsis`) are already set in `src-tauri/tauri.conf.json`. Auto-update
is off (offline app).

### 2.3 Thermal USB write — code is written, **compiles on macOS, unverified on Windows**

`print_receipt` and `open_cash_drawer` in `src-tauri/src/lib.rs` now call
`write_raw()` (Windows spooler RAW passthrough) when a printer name is configured
and the build target is Windows; the `windows` crate is pinned in
`src-tauri/Cargo.toml` under `[target.'cfg(windows)'.dependencies]`, version
`"0.58"`, with `Win32_Graphics_Printing` + `Win32_Foundation`. `Cargo.lock` is
committed so this resolves to the exact same versions when you build.

**This was written and reasoned through carefully, but never compiled for
Windows** — there's no Windows machine in the environment it was written in, so
`cargo check`/`cargo build` only ran (cleanly) against the non-Windows code
path. The `windows` crate's exact function/struct signatures drift across
versions; if `cargo build` on your machine fails inside `write_raw`, that's an
expected first-contact issue, not a sign something else is wrong — adjust the
call to match whatever `0.58` (or the version that actually resolves) exposes,
or bump the pin. **First step on the Windows box: `cd src-tauri && cargo build`
before anything else**, so a signature mismatch surfaces immediately instead of
mid-testing.

Fallback behavior is unchanged and still the safety net: no printer name
configured, or a non-Windows build → logs and returns `Ok`, so sales print
through the OS dialog / HTML receipt fallback. **A print failure still never
blocks a committed sale** — `write_raw`'s `Err` only reaches the frontend's
existing HTML-fallback catch in `receipt/print.ts`, it doesn't propagate
anywhere that could fail a sale.

### 2.4 Confirm the backup DB path

`src/native/tauri.ts` reads/writes `pos.db` in `appConfigDir()`. Verify the
`tauri-plugin-sql` database actually resolves there on your build (do one
**Back up now** → check the `.ctbk` file, then **Restore** it). If the plugin puts
the file elsewhere, that one path string is the only change.

### 2.5 FTS5

Nothing to do — the bundled SQLite includes FTS5, so `setupFts()` (in
`src/db/fts.ts`) succeeds automatically and search uses the index. (The dev sql.js
build lacks FTS5 and falls back to LIKE; same results, just slower.)

---

## 3. Pre-ship checklist (`pos-prd.md §12` acceptance criteria)

Run these on the real machine with Wi-Fi off and Ethernet unplugged:

- [ ] `cd src-tauri && cargo build` succeeds — the thermal-printing code (2.3)
      has never been compiled for Windows; this is the first real signal it's
      syntactically correct for the `windows` crate version that resolves.
- [ ] Log in, scan 5 items, sell 2 as boxes, take a split cash/MoMo payment, print
      the receipt, and watch the dashboard update.
- [ ] Kill power mid-payment; on restart the sale exists fully (reprintable) or not
      at all, and stock matches. (The sale commits in one transaction — verified in
      dev via the rollback test.)
- [ ] Rename a product and change its price; a receipt from before reprints
      identical apart from the `*REPRINT*` marker (sale-line snapshots).
- [ ] Sell a product below its threshold; the dashboard flags it within a second.
- [ ] A new cashier completes a 3-item no-barcode sale in under 60 seconds.
- [ ] Back up to a USB stick, wipe `%APPDATA%/countertop`, restore, reprint last
      week's receipt.
- [ ] Set a recovery phrase, then reset a forgotten PIN from the login screen.
- [ ] Run `npm run typecheck` and `npm run lint` — both clean (they are today).
- [ ] Build the production binary and run the full primary flow on real hardware.

---

## 4. How this was built

Feature by feature with the **practical-vibe-coding** skill (`.claude/skills/`):
one task per prompt, verify, commit — one commit per working slice. `CLAUDE.md` is
the working contract; `pos-prd.md` is the full spec. Keep to that rhythm for any
new work.
