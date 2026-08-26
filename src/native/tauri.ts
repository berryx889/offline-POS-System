// Real platform adapter: SQLite via the Tauri SQL plugin, PIN hashing and printing
// via Rust commands. Used in the installed Windows app.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type { ExecuteResult, NativeAdapter } from "./types";

let dbPromise: Promise<Database> | null = null;

function db(): Promise<Database> {
  // Single file at %APPDATA%/countertop/pos.db (the identifier resolves the app dir).
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:pos.db").then(async (conn) => {
      // Defense in depth: tauri-plugin-sql pools several SQLite connections,
      // and a new one may not inherit this pragma — see the `serialize` note
      // below for the actual fix. Harmless either way.
      await conn.execute("PRAGMA busy_timeout = 5000");
      return conn;
    });
  }
  return dbPromise;
}

// tauri-plugin-sql keeps a pool of SQLite connections; each execute()/select()
// call independently grabs one, with no guarantee two calls share a
// connection. The app commits sales (and a few other writes) as a manual
// multi-statement transaction — BEGIN IMMEDIATE, several statements, COMMIT —
// across separate calls (see db/queries/sales.ts). If anything else (e.g. a
// background react-query refetch) touches the DB concurrently mid-transaction,
// it can land on a *different* pooled connection and collide with the lock the
// transaction is holding, throwing "(code: 5) database is locked". Chaining
// every call through this queue keeps exactly one request in flight app-wide,
// so the pool's one idle connection is what's always reused rather than a
// second one being pulled in concurrently. Never surfaced against the sql.js
// mock, which is a single synchronous in-process connection with no pooling.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function executeScriptImpl(sql: string): Promise<void> {
  const conn = await db();
  // The plugin executes one statement per call; strip `--` comments (both
  // whole-line and trailing) first — a statement preceded by a comment line
  // right after the previous statement's semicolon would otherwise be dropped
  // along with it, and a trailing comment containing a semicolon (e.g. "--
  // per piece; overrides retail") would otherwise split a statement in half.
  // See CONTEXT.md.
  const withoutComments = sql
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await conn.execute(stmt);
  }
}

async function selectImpl<T>(sql: string, params: unknown[]): Promise<T[]> {
  const conn = await db();
  return conn.select<T[]>(sql, params);
}

async function executeImpl(sql: string, params: unknown[]): Promise<ExecuteResult> {
  const conn = await db();
  const res = await conn.execute(sql, params);
  return { rowsAffected: res.rowsAffected, lastInsertId: res.lastInsertId };
}

export const tauriAdapter: NativeAdapter = {
  kind: "tauri",

  executeScript(sql) {
    return serialize(() => executeScriptImpl(sql));
  },

  select<T>(sql: string, params: unknown[] = []) {
    return serialize(() => selectImpl<T>(sql, params));
  },

  execute(sql, params = []) {
    return serialize(() => executeImpl(sql, params));
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

  async exportDatabase() {
    await serialize(() => executeImpl("PRAGMA wal_checkpoint(TRUNCATE)", []));
    return invoke<Uint8Array>("export_database");
  },
  async importDatabase(bytes) {
    await invoke("import_database", { bytes: Array.from(bytes) });
  },
  readBackupFile(path) {
    return invoke<Uint8Array>("read_backup_file", { path });
  },
  writeBackupFile(path, bytes) {
    return invoke("write_backup_file", { path, bytes: Array.from(bytes) });
  },
};
