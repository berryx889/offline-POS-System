// CounterTop POS — Tauri backend.
//
// The frontend does almost everything through the SQL plugin. Rust only owns the
// three things the browser cannot do: hash PINs with argon2, push raw ESC/POS
// bytes to a thermal printer, and pop the cash drawer. Keep this file small.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Hash a PIN with argon2id. Returns the encoded PHC string to store in `users.pin_hash`.
#[tauri::command]
fn hash_pin(pin: String) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

/// Verify a PIN against a stored argon2 hash.
#[tauri::command]
fn verify_pin(pin: String, hash: String) -> Result<bool, String> {
    let parsed = PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok())
}

/// Send `bytes` to a printer by name via the Windows print spooler's RAW
/// datatype — the standard way to push preformatted (ESC/POS) bytes straight
/// through without the spooler trying to interpret them as a document.
///
/// UNVERIFIED: written against the documented Win32 Printing API and the
/// `windows` crate's typical signatures for this crate/toolchain pairing, but
/// never compiled or run — this machine has no Windows target. Run `cargo
/// build` on the real Windows box first and treat any signature mismatch as
/// expected, not a sign something else is wrong; the `windows` crate's exact
/// function signatures do drift between versions.
#[cfg(target_os = "windows")]
fn write_raw(printer: &str, bytes: &[u8]) -> Result<(), String> {
    use windows::core::{PCWSTR, PWSTR};
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
            pDocName: PWSTR(doc.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(raw.as_mut_ptr()),
        };
        // Level 1. StartDocPrinterW returns a job id (0 = failure).
        if StartDocPrinterW(h, 1, &info) == 0 {
            let _ = ClosePrinter(h);
            return Err("StartDocPrinter failed".into());
        }
        StartPagePrinter(h).ok().map_err(|e| e.to_string())?;

        let mut written = 0u32;
        WritePrinter(h, bytes.as_ptr() as _, bytes.len() as u32, &mut written)
            .ok()
            .map_err(|e| e.to_string())?;

        let _ = EndPagePrinter(h);
        let _ = EndDocPrinter(h);
        let _ = ClosePrinter(h);
    }
    Ok(())
}

/// Send raw ESC/POS bytes to the configured printer.
///
/// On Windows with a printer name configured, writes straight to the spooler
/// (RAW passthrough). Otherwise — no printer configured, or a non-Windows
/// build (macOS dev, or before the printer is set up) — logs and returns Ok
/// so the frontend's HTML/OS-dialog fallback (pos-prd.md §6.2) is what the
/// cashier sees; a printer problem must never block an already-committed sale.
#[tauri::command]
fn print_receipt(printer_name: Option<String>, bytes: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(name) = printer_name.as_deref() {
            return write_raw(name, &bytes);
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = &printer_name;

    println!(
        "[print_receipt] {} bytes queued (no printer configured, or non-Windows build)",
        bytes.len()
    );
    Ok(())
}

/// Pulse the cash drawer wired to the printer's RJ11 port. Sends the exact
/// same ESC p kick bytes the frontend embeds inline in a receipt
/// (`src/receipt/escpos.ts`'s `openDrawer` option) as a standalone write, for
/// callers that want to kick the drawer without printing a receipt.
#[tauri::command]
fn open_cash_drawer(printer_name: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // ESC p 0 t1 t2 — pulse drawer pin 2. Keep in sync with escpos.ts.
        const DRAWER_KICK: [u8; 5] = [0x1b, 0x70, 0x00, 0x19, 0xfa];
        if let Some(name) = printer_name.as_deref() {
            return write_raw(name, &DRAWER_KICK);
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = &printer_name;

    println!("[open_cash_drawer] pulse (no printer configured, or non-Windows build)");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            hash_pin,
            verify_pin,
            print_receipt,
            open_cash_drawer
        ])
        .run(tauri::generate_context!())
        .expect("error while running CounterTop POS");
}
