// Real platform adapter: SQLite via the Tauri SQL plugin, PIN hashing and printing
// via Rust commands. Used in the installed Windows app.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
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
};
