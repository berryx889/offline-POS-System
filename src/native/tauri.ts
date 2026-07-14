// Real platform adapter: SQLite via the Tauri SQL plugin, PIN hashing and printing
// via Rust commands. Used in the installed Windows app.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { readFile, writeFile, remove } from "@tauri-apps/plugin-fs";
import { appConfigDir, join } from "@tauri-apps/api/path";
import type { ExecuteResult, NativeAdapter } from "./types";

let dbPromise: Promise<Database> | null = null;

function db(): Promise<Database> {
  // Single file at %APPDATA%/countertop/pos.db (the plugin resolves the app dir).
  if (!dbPromise) dbPromise = Database.load("sqlite:pos.db");
  return dbPromise;
}

export const tauriAdapter: NativeAdapter = {
  kind: "tauri",

  async executeScript(sql) {
    const conn = await db();
    // The plugin executes one statement per call; split on statement boundaries.
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
  },

  async select<T>(sql: string, params: unknown[] = []) {
    const conn = await db();
    return conn.select<T[]>(sql, params);
  },

  async execute(sql, params = []): Promise<ExecuteResult> {
    const conn = await db();
    const res = await conn.execute(sql, params);
    return { rowsAffected: res.rowsAffected, lastInsertId: res.lastInsertId };
  },

  hashPin(pin) {
    return invoke<string>("hash_pin", { pin });
  },
  verifyPin(pin, hash) {
    return invoke<boolean>("verify_pin", { pin, hash });
  },
  printReceipt(bytes, printerName) {
    return invoke<void>("print_receipt", {
      printerName: printerName ?? null,
      bytes: Array.from(bytes),
    });
  },
  openCashDrawer(printerName) {
    return invoke<void>("open_cash_drawer", { printerName: printerName ?? null });
  },

  // The plugin-sql database file lives in the app config dir as pos.db. NOTE:
  // confirm this path on the Windows build; if the plugin resolves elsewhere,
  // this is the one string to adjust.
  async exportDatabase() {
    const dir = await appConfigDir();
    const path = await join(dir, "pos.db");
    return readFile(path);
  },
  async importDatabase(bytes) {
    const dir = await appConfigDir();
    const path = await join(dir, "pos.db");
    await writeFile(path, bytes);
    // Drop WAL sidecars so the restored main file is authoritative on reopen.
    for (const side of ["pos.db-wal", "pos.db-shm"]) {
      try {
        await remove(await join(dir, side));
      } catch {
        /* sidecar may not exist */
      }
    }
    // The caller relaunches the app so the sql plugin reopens the new file.
  },
};
