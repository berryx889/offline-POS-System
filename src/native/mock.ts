// Dev-only adapter: runs the real SQLite schema in the browser via sql.js so
// `npm run dev` shows the full UI without the Rust toolchain. It persists to
// localStorage so a page reload keeps your seeded data.
//
// This is NOT used in the installed app — the Tauri adapter is. PIN hashing here
// is a non-cryptographic stand-in purely so the login flow is exercisable.

import initSqlJs, { type Database } from "sql.js";
// Vite resolves `sql.js` to its browser build (sql-wasm-browser.js); pair it with
// the matching browser wasm so the glue and the binary agree.
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import type { ExecuteResult, NativeAdapter } from "./types";

const STORAGE_KEY = "countertop-dev-db";
let database: Database | null = null;
// sql.js `export()` ends any open transaction, so we must never persist mid-txn.
// Track BEGIN/COMMIT/ROLLBACK to know when it's safe to snapshot to localStorage.
let txnDepth = 0;

async function db(): Promise<Database> {
  if (database) return database;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = localStorage.getItem(STORAGE_KEY);
  database = saved
    ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)))
    : new SQL.Database();
  database.run("PRAGMA foreign_keys = ON;");
  return database;
}

function persist(d: Database): void {
  if (txnDepth > 0) return; // never export while a transaction is open
  const bytes = d.export();
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  localStorage.setItem(STORAGE_KEY, btoa(binary));
}

// Adjust the transaction counter based on the statement about to run.
function trackTxn(sql: string): void {
  const head = sql.trimStart().slice(0, 12).toUpperCase();
  if (head.startsWith("BEGIN")) txnDepth++;
  else if (head.startsWith("COMMIT") || head.startsWith("ROLLBACK")) {
    txnDepth = Math.max(0, txnDepth - 1);
  }
}

export const mockAdapter: NativeAdapter = {
  kind: "mock",

  async executeScript(sql) {
    const d = await db();
    d.run(sql);
    persist(d);
  },

  async select<T>(sql: string, params: unknown[] = []) {
    const d = await db();
    const stmt = d.prepare(sql);
    stmt.bind(params as never[]);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  },

  async execute(sql, params = []): Promise<ExecuteResult> {
    const d = await db();
    trackTxn(sql); // BEGIN bumps depth before persist; COMMIT/ROLLBACK clears it
    d.run(sql, params as never[]);
    const rowsAffected = d.getRowsModified();
    const res = d.exec("SELECT last_insert_rowid() AS id");
    const lastInsertId = res[0]?.values[0]?.[0] as number | undefined;
    persist(d);
    return { rowsAffected, lastInsertId };
  },

  // Dev-only: a stable, reversible-free marker. Real hashing is argon2 in Rust.
  async hashPin(pin) {
    return `dev$${btoa(pin)}`;
  },
  async verifyPin(pin, hash) {
    return hash === `dev$${btoa(pin)}`;
  },

  async printReceipt(bytes) {
    console.info(`[mock printReceipt] ${bytes.length} bytes (dev, no printer)`);
  },
  async openCashDrawer() {
    console.info("[mock openCashDrawer] (dev, no drawer)");
  },

  async exportDatabase() {
    const d = await db();
    return d.export();
  },
  async importDatabase(bytes) {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    database = new SQL.Database(bytes);
    database.run("PRAGMA foreign_keys = ON;");
    persist(database);
  },
};
