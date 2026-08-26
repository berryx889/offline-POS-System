// Backups (pos-prd.md §4.4). A .ctbk file is the SQLite database. "Back up now"
// saves one to a location the admin picks (USB); auto-snapshots keep the last 14
// locally. Restore replaces the DB and reloads. Boring on purpose.

import { native } from "@/native";

const SNAP_PREFIX = "countertop-snap:";
const LAST_SNAP_KEY = "countertop-last-snapshot";
const KEEP = 14;

function ymd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function backupFileName(): string {
  return `countertop-backup-${ymd()}.ctbk`;
}

/** Save a backup to a location the admin chooses. Returns where it went, or null
 *  if cancelled. */
export async function backupNow(): Promise<string | null> {
  const bytes = await native.exportDatabase();
  const name = backupFileName();

  if (native.kind === "tauri") {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: "CounterTop backup", extensions: ["ctbk"] }],
    });
    if (!path) return null;
    await native.writeBackupFile(path, bytes);
    return path;
  }

  // Browser dev: download the file. Copy into a fresh ArrayBuffer for BlobPart.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

/** Restore from raw .ctbk bytes. The caller reloads the app afterwards.
 *
 *  NOT written to audit_log: importDatabase() overwrites the pos.db file out
 *  from under the live connection, which is only safe again after the
 *  mandatory reload reopens it — a write attempted in between would target a
 *  connection in an undefined state. A real gap (no in-DB trail of "this file
 *  was restored"), not an oversight; fixing it needs the restore trail to
 *  live outside the file being replaced (e.g. an OS-level log), which is out
 *  of scope here. */
export async function restoreFromBytes(bytes: Uint8Array): Promise<void> {
  // A SQLite file starts with "SQLite format 3\0".
  const header = new TextDecoder().decode(bytes.slice(0, 15));
  if (header !== "SQLite format 3") {
    throw new Error("That doesn't look like a CounterTop backup.");
  }
  await native.importDatabase(bytes);
}

// ---- Auto daily snapshots -------------------------------------------------

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Take a local snapshot once per day, keeping the last 14. Dev stores them in
 *  localStorage; the Tauri build writes them to the app data `backups/` folder. */
export async function autoSnapshotIfDue(): Promise<void> {
  if (localStorage.getItem(LAST_SNAP_KEY) === ymd()) return;
  const bytes = await native.exportDatabase();

  if (native.kind === "tauri") {
    try {
      const { writeFile, mkdir, readDir, remove } = await import("@tauri-apps/plugin-fs");
      const { appConfigDir, join } = await import("@tauri-apps/api/path");
      const dir = await join(await appConfigDir(), "backups");
      await mkdir(dir, { recursive: true });
      await writeFile(await join(dir, `countertop-auto-${ymd()}.ctbk`), bytes);
      const files = (await readDir(dir)).filter((f) => f.name?.endsWith(".ctbk")).map((f) => f.name!).sort();
      for (const old of files.slice(0, Math.max(0, files.length - KEEP))) {
        await remove(await join(dir, old));
      }
    } catch {
      /* snapshotting is best-effort */
    }
  } else {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(SNAP_PREFIX)).sort();
    localStorage.setItem(`${SNAP_PREFIX}${ymd()}`, b64(bytes));
    for (const old of keys.slice(0, Math.max(0, keys.length + 1 - KEEP))) {
      if (old !== `${SNAP_PREFIX}${ymd()}`) localStorage.removeItem(old);
    }
  }
  localStorage.setItem(LAST_SNAP_KEY, ymd());
}

export function lastSnapshotDate(): string | null {
  return localStorage.getItem(LAST_SNAP_KEY);
}
