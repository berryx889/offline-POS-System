// Full-text search for products (pos-prd.md §10: search < 100ms on a 10k catalog).
// FTS5 is created opportunistically — if the SQLite build lacks it (some sql.js
// dev builds), we fall back to LIKE and the app works exactly the same, slower.

import { native } from "@/native";

let ftsReady = false;

export function isFtsReady(): boolean {
  return ftsReady;
}

/** Create the FTS index + sync triggers and populate it. Safe to call on every
 *  launch. Sets isFtsReady() based on whether FTS5 is available. */
export async function setupFts(): Promise<void> {
  try {
    await native.execute(
      "CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(name, barcode, content='')"
    );
    // Keep the index in sync with the products table.
    await native.execute(
      `CREATE TRIGGER IF NOT EXISTS products_fts_ai AFTER INSERT ON products BEGIN
         INSERT INTO products_fts(rowid, name, barcode) VALUES (new.id, new.name, COALESCE(new.barcode, ''));
       END`
    );
    await native.execute(
      `CREATE TRIGGER IF NOT EXISTS products_fts_ad AFTER DELETE ON products BEGIN
         DELETE FROM products_fts WHERE rowid = old.id;
       END`
    );
    await native.execute(
      `CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products BEGIN
         DELETE FROM products_fts WHERE rowid = old.id;
         INSERT INTO products_fts(rowid, name, barcode) VALUES (new.id, new.name, COALESCE(new.barcode, ''));
       END`
    );
    // Rebuild from the current products (cheap; keeps the index authoritative).
    await native.execute("DELETE FROM products_fts");
    await native.execute(
      "INSERT INTO products_fts(rowid, name, barcode) SELECT id, name, COALESCE(barcode, '') FROM products"
    );
    ftsReady = true;
  } catch {
    ftsReady = false;
  }
}

/** Turn a user query into a safe FTS5 prefix match: `voltic wa` -> `voltic* wa*`. */
export function toFtsQuery(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/["*]/g, "") + "*")
    .join(" ");
}
