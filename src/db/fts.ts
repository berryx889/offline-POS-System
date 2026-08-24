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
    // products_fts is contentless (content=''): it stores no copy of the
    // indexed text, so a plain DELETE/UPDATE against it fails with "cannot
    // DELETE from contentless fts5 table" — SQLite has no way to know which
    // terms to remove. Contentless tables require the special 'delete'
    // command instead, passing the old row's own values back in so FTS5 can
    // find what to unindex.
    //
    // DROP first: an earlier version of these triggers used a plain DELETE
    // (the bug above). CREATE TRIGGER IF NOT EXISTS is a silent no-op against
    // a database that already has a trigger by that name, so without the
    // DROP, any database that ever ran the old buggy version would keep it
    // forever even after this file is fixed.
    await native.execute("DROP TRIGGER IF EXISTS products_fts_ad");
    await native.execute("DROP TRIGGER IF EXISTS products_fts_au");
    await native.execute(
      `CREATE TRIGGER IF NOT EXISTS products_fts_ad AFTER DELETE ON products BEGIN
         INSERT INTO products_fts(products_fts, rowid, name, barcode)
           VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''));
       END`
    );
    await native.execute(
      `CREATE TRIGGER IF NOT EXISTS products_fts_au AFTER UPDATE ON products BEGIN
         INSERT INTO products_fts(products_fts, rowid, name, barcode)
           VALUES ('delete', old.id, old.name, COALESCE(old.barcode, ''));
         INSERT INTO products_fts(rowid, name, barcode) VALUES (new.id, new.name, COALESCE(new.barcode, ''));
       END`
    );
    // Rebuild from the current products (cheap; keeps the index authoritative).
    // 'delete-all' is FTS5's special command for clearing every row; a plain
    // DELETE has the same contentless restriction as above.
    await native.execute("INSERT INTO products_fts(products_fts) VALUES ('delete-all')");
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
