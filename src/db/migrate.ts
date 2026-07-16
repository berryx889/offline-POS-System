// Runs the schema on first launch and records a version so later phases can add
// migrations without re-running everything. Idempotent: safe to call every start.

import { native } from "@/native";
import schema from "./schema.sql?raw";
import { seedIfEmpty } from "./seed";
import { setupFts } from "./fts";
import { autoSnapshotIfDue } from "@/backup/service";

const SCHEMA_VERSION = 3;

// Guard against concurrent callers (e.g. React StrictMode invoking the boot
// effect twice) racing the seed and inserting duplicate rows. Everyone shares
// the same in-flight run.
let inFlight: Promise<void> | null = null;

export function migrate(): Promise<void> {
  if (!inFlight) inFlight = runMigrate();
  return inFlight;
}

async function runMigrate(): Promise<void> {
  // The schema uses IF NOT EXISTS throughout, so applying it repeatedly is safe.
  await native.executeScript(schema);

  await native.executeScript(
    "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);"
  );
  const rows = await native.select<{ value: string }>(
    "SELECT value FROM schema_meta WHERE key = ?",
    ["version"]
  );
  const current = rows.length ? parseInt(rows[0].value, 10) : 0;

  // Seed the receipt-number sequence once.
  await native.execute(
    "INSERT OR IGNORE INTO sequences (name, value) VALUES ('receipt', 0), ('sale_seq', 0)"
  );

  // v2: add credit columns to `sales` and widen its payment_method CHECK. Detected
  // by the column's absence so it runs once on upgraded DBs and never on fresh ones
  // (which already have the new schema). customers/customer_ledger come from
  // schema.sql's IF NOT EXISTS above.
  if (await salesNeedsV2()) {
    await rebuildSalesForV2();
  }
  await native.execute(
    "CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)"
  );

  // v3: variants, aliases, selling units, movement history, tax/notes. Each step
  // is detected structurally (missing column / present CHECK) so it runs once on
  // upgraded DBs and never on fresh ones. New TABLES come from schema.sql above.
  if (await missingColumn("products", "family")) await addProductV3Columns();
  await native.execute("CREATE INDEX IF NOT EXISTS idx_products_family ON products(family)");
  if (await missingColumn("sales", "tax_pesewas")) {
    await native.execute("ALTER TABLE sales ADD COLUMN tax_pesewas INTEGER NOT NULL DEFAULT 0");
    await native.execute("ALTER TABLE sales ADD COLUMN note TEXT");
  }
  if (await missingColumn("customers", "customer_type")) {
    await native.execute(
      "ALTER TABLE customers ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'retail'"
    );
  }
  if (await missingColumn("stock_movements", "prev_pieces")) await rebuildMovementsForV3();
  if (await saleItemsHasUnitCheck()) await rebuildSaleItemsForV3();

  if (current < SCHEMA_VERSION) {
    await native.execute(
      "INSERT INTO schema_meta (key, value) VALUES ('version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(SCHEMA_VERSION)]
    );
  }

  await seedIfEmpty();

  // Build the full-text search index (falls back to LIKE if FTS5 is unavailable).
  await setupFts();

  // Daily local snapshot (best-effort; never blocks startup).
  autoSnapshotIfDue().catch(() => {});
}

/** True when `sales` predates v2 (no credit_pesewas column). */
async function salesNeedsV2(): Promise<boolean> {
  return missingColumn("sales", "credit_pesewas");
}

async function missingColumn(table: string, column: string): Promise<boolean> {
  const cols = await native.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return !cols.some((c) => c.name === column);
}

/** v3 product fields are plain nullable adds — no rebuild needed. */
async function addProductV3Columns(): Promise<void> {
  const adds = [
    "sku TEXT",
    "family TEXT",
    "brand TEXT",
    "supplier TEXT",
    "description TEXT",
    "image TEXT",
    "promo_price_pesewas INTEGER",
    "bulk_price_pesewas INTEGER",
    "bulk_min_qty INTEGER",
    "expiry_date TEXT",
    "batch_number TEXT",
  ];
  for (const col of adds) {
    await native.execute(`ALTER TABLE products ADD COLUMN ${col}`);
  }
}

/** True while sale_items still has the v1 CHECK restricting unit to piece/box. */
async function saleItemsHasUnitCheck(): Promise<boolean> {
  const [row] = await native.select<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sale_items'"
  );
  return row != null && row.sql.includes("CHECK");
}

/** Rebuild sale_items without the unit CHECK so custom selling-unit names can be
 *  snapshotted. Same table-rebuild pattern as v2: FK off, copy rows + ids, rename. */
async function rebuildSaleItemsForV3(): Promise<void> {
  await native.execute("PRAGMA foreign_keys = OFF");
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute(`
      CREATE TABLE sale_items_v3 (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit TEXT NOT NULL,
        qty INTEGER NOT NULL,
        unit_price_pesewas INTEGER NOT NULL,
        line_total_pesewas INTEGER NOT NULL,
        pieces_deducted INTEGER NOT NULL
      )`);
    await native.execute(`
      INSERT INTO sale_items_v3 (id, sale_id, product_id, product_name, unit, qty,
        unit_price_pesewas, line_total_pesewas, pieces_deducted)
      SELECT id, sale_id, product_id, product_name, unit, qty,
        unit_price_pesewas, line_total_pesewas, pieces_deducted
      FROM sale_items`);
    await native.execute("DROP TABLE sale_items");
    await native.execute("ALTER TABLE sale_items_v3 RENAME TO sale_items");
    await native.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)");
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await native.execute("PRAGMA foreign_keys = ON");
}

/** Rebuild stock_movements with the v3 reason list + prev/new stock + note.
 *  Old rows keep NULL prev/new (unknown at the time). */
async function rebuildMovementsForV3(): Promise<void> {
  await native.execute("PRAGMA foreign_keys = OFF");
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute(`
      CREATE TABLE stock_movements_v3 (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        change_pieces INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN
          ('sale','void','restock','adjustment','purchase','return',
           'damaged','expired','transfer','opening')),
        reference_id INTEGER,
        note TEXT,
        prev_pieces INTEGER,
        new_pieces INTEGER,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL
      )`);
    await native.execute(`
      INSERT INTO stock_movements_v3 (id, product_id, change_pieces, reason,
        reference_id, note, prev_pieces, new_pieces, user_id, created_at)
      SELECT id, product_id, change_pieces, reason, reference_id, NULL, NULL, NULL,
        user_id, created_at
      FROM stock_movements`);
    await native.execute("DROP TABLE stock_movements");
    await native.execute("ALTER TABLE stock_movements_v3 RENAME TO stock_movements");
    await native.execute(
      "CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_movements(product_id)"
    );
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await native.execute("PRAGMA foreign_keys = ON");
}

/** Rebuild `sales` with the v2 columns + widened payment_method CHECK, preserving
 *  all rows and ids. FK enforcement is off during the swap (standard SQLite
 *  table-rebuild); sale_items/stock_movements re-bind to the renamed table. */
async function rebuildSalesForV2(): Promise<void> {
  await native.execute("PRAGMA foreign_keys = OFF");
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute(`
      CREATE TABLE sales_v2 (
        id INTEGER PRIMARY KEY,
        receipt_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id),
        subtotal_pesewas INTEGER NOT NULL,
        discount_pesewas INTEGER NOT NULL DEFAULT 0,
        total_pesewas INTEGER NOT NULL,
        amount_paid_pesewas INTEGER NOT NULL,
        change_pesewas INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','momo','split','credit')),
        cash_part_pesewas INTEGER NOT NULL DEFAULT 0,
        momo_part_pesewas INTEGER NOT NULL DEFAULT 0,
        momo_reference TEXT,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
        voided_by INTEGER REFERENCES users(id),
        void_reason TEXT,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        credit_pesewas INTEGER NOT NULL DEFAULT 0
      )`);
    await native.execute(`
      INSERT INTO sales_v2 (id, receipt_no, user_id, subtotal_pesewas, discount_pesewas,
        total_pesewas, amount_paid_pesewas, change_pesewas, payment_method, cash_part_pesewas,
        momo_part_pesewas, momo_reference, status, voided_by, void_reason, seq, created_at,
        customer_id, credit_pesewas)
      SELECT id, receipt_no, user_id, subtotal_pesewas, discount_pesewas, total_pesewas,
        amount_paid_pesewas, change_pesewas, payment_method, cash_part_pesewas, momo_part_pesewas,
        momo_reference, status, voided_by, void_reason, seq, created_at, NULL, 0
      FROM sales`);
    await native.execute("DROP TABLE sales");
    await native.execute("ALTER TABLE sales_v2 RENAME TO sales");
    await native.execute("CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)");
    await native.execute("CREATE INDEX IF NOT EXISTS idx_sales_seq ON sales(seq)");
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await native.execute("PRAGMA foreign_keys = ON");
}
