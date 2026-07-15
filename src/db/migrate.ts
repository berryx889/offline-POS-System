// Runs the schema on first launch and records a version so later phases can add
// migrations without re-running everything. Idempotent: safe to call every start.

import { native } from "@/native";
import schema from "./schema.sql?raw";
import { seedIfEmpty } from "./seed";
import { setupFts } from "./fts";
import { autoSnapshotIfDue } from "@/backup/service";

const SCHEMA_VERSION = 2;

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
  const cols = await native.select<{ name: string }>("PRAGMA table_info(sales)");
  return !cols.some((c) => c.name === "credit_pesewas");
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
