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

/// Send raw ESC/POS bytes to the configured printer.
///
/// Phase 1 stub: the real USB/serial write lands in Phase 3 (see pos-prd.md §8).
/// It intentionally returns Ok so that "print failed" never blocks a committed
/// sale — the frontend already treats printing as best-effort.
#[tauri::command]
fn print_receipt(_printer_name: Option<String>, bytes: Vec<u8>) -> Result<(), String> {
    // TODO(phase-3): open the printer by name and write `bytes` over USB/serial
    // using the `escpos` crate. For now, acknowledge so the flow is testable.
    println!("[print_receipt] {} bytes queued (stub)", bytes.len());
    Ok(())
}

/// Pulse the cash drawer connected to the printer's RJ11 port (ESC p).
#[tauri::command]
fn open_cash_drawer(_printer_name: Option<String>) -> Result<(), String> {
    // TODO(phase-3): write the ESC p kick sequence to the printer.
    println!("[open_cash_drawer] pulse (stub)");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            hash_pin,
            verify_pin,
            print_receipt,
            open_cash_drawer
        ])
        .run(tauri::generate_context!())
        .expect("error while running CounterTop POS");
}
