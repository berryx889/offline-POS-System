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

### 2.1 Build the installer

```bash
npm run tauri icon path/to/logo.png   # once — generates src-tauri/icons/*
npm run tauri build                    # -> .msi and .exe in src-tauri/target/release/bundle/
```

Targets (`msi`, `nsis`) are already set in `src-tauri/tauri.conf.json`. Auto-update
is off (offline app).

### 2.2 Thermal USB write (the one real stub)

`print_receipt` in `src-tauri/src/lib.rs` currently logs the bytes and returns Ok,
so sales print through the **OS dialog with the HTML receipt** — a first-class
fallback per the PRD. To drive a thermal printer directly, send the ESC/POS bytes
to the installed printer via the Windows spooler (raw passthrough). Reference
implementation to adapt and verify on-device (add the `windows` crate under
`[target.'cfg(windows)'.dependencies]` with the `Win32_Graphics_Printing` and
`Win32_Foundation` features):

```rust
#[cfg(target_os = "windows")]
fn write_raw(printer: &str, bytes: &[u8]) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    let mut name: Vec<u16> = printer.encode_utf16().chain([0]).collect();
    let mut raw: Vec<u16> = "RAW".encode_utf16().chain([0]).collect();
    let mut doc: Vec<u16> = "CounterTop receipt".encode_utf16().chain([0]).collect();

    unsafe {
        let mut h = HANDLE::default();
        OpenPrinterW(PCWSTR(name.as_mut_ptr()), &mut h, None).map_err(|e| e.to_string())?;

        let info = DOC_INFO_1W {
            pDocName: PCWSTR(doc.as_mut_ptr()),
            pOutputFile: PCWSTR::null(),
            pDatatype: PCWSTR(raw.as_mut_ptr()),
        };
        // Level 1. StartDocPrinterW returns a job id (0 = failure).
        if StartDocPrinterW(h, 1, &info) == 0 {
            let _ = ClosePrinter(h);
            return Err("StartDocPrinter failed".into());
        }
        StartPagePrinter(h).map_err(|e| e.to_string())?;

        let mut written = 0u32;
        WritePrinter(h, bytes.as_ptr() as _, bytes.len() as u32, &mut written)
            .map_err(|e| e.to_string())?;

        let _ = EndPagePrinter(h);
        let _ = EndDocPrinter(h);
        let _ = ClosePrinter(h);
    }
    Ok(())
}
```

Then have the `print_receipt` command call `write_raw(name, &bytes)` when a printer
name is provided, keeping the current `Ok` behavior as the fallback so **a print
failure never blocks a committed sale**. The `windows` crate's exact function
signatures drift between versions — compile against the version you pin and adjust
if needed. The cash-drawer pulse (`open_cash_drawer`) uses the same path with the
ESC `p` kick bytes.

### 2.3 Confirm the backup DB path

`src/native/tauri.ts` reads/writes `pos.db` in `appConfigDir()`. Verify the
`tauri-plugin-sql` database actually resolves there on your build (do one
**Back up now** → check the `.ctbk` file, then **Restore** it). If the plugin puts
the file elsewhere, that one path string is the only change.

### 2.4 FTS5

Nothing to do — the bundled SQLite includes FTS5, so `setupFts()` (in
`src/db/fts.ts`) succeeds automatically and search uses the index. (The dev sql.js
build lacks FTS5 and falls back to LIKE; same results, just slower.)

---

## 3. Pre-ship checklist (`pos-prd.md §12` acceptance criteria)

Run these on the real machine with Wi-Fi off and Ethernet unplugged:

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
