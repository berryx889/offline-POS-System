// Runs the schema on first launch and records a version so later phases can add
// migrations without re-running everything. Idempotent: safe to call every start.

import { native } from "@/native";
import schema from "./schema.sql?raw";
import { seedIfEmpty } from "./seed";
import { setupFts } from "./fts";
import { autoSnapshotIfDue } from "@/backup/service";

const SCHEMA_VERSION = 4;

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

  // v3: variants, aliases, selling units, movement history, tax/notes. Each
  // column is detected and added individually (not as an all-or-nothing group)
  // so a crash between ALTERs leaves a resumable state instead of a DB that's
  // permanently missing a column the app now assumes exists. New TABLES come
  // from schema.sql above.
  await addProductV3Columns();
  await native.execute("CREATE INDEX IF NOT EXISTS idx_products_family ON products(family)");
  if (await missingColumn("sales", "tax_pesewas")) {
    await native.execute("ALTER TABLE sales ADD COLUMN tax_pesewas INTEGER NOT NULL DEFAULT 0");
  }
  if (await missingColumn("sales", "note")) {
    await native.execute("ALTER TABLE sales ADD COLUMN note TEXT");
  }
  if (await missingColumn("customers", "customer_type")) {
    await native.execute(
      "ALTER TABLE customers ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'retail'"
    );
  }
  if (await missingColumn("stock_movements", "prev_pieces")) await rebuildMovementsForV3();
  if (await saleItemsHasUnitCheck()) await rebuildSaleItemsForV3();

  // v4: branches, granular roles/permissions, stock transfers, sync queue.
  // branches/stock_transfers/sync_queue tables themselves come from schema.sql
  // above; what's left is widening users.role (a CHECK, so it needs the same
  // rebuild-in-place approach as v2/v3) and adding branch_id to the tables a
  // branch scopes.
  if (await usersRoleNeedsV4()) await rebuildUsersForV4();
  if (await missingColumn("products", "branch_id")) {
    await native.execute("ALTER TABLE products ADD COLUMN branch_id INTEGER REFERENCES branches(id)");
  }
  if (await missingColumn("sales", "branch_id")) {
    await native.execute("ALTER TABLE sales ADD COLUMN branch_id INTEGER REFERENCES branches(id)");
  }
  await native.execute("CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id)");
  await native.execute("CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id)");
  await native.execute("CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id)");
  await ensureMainBranchAndBackfill();
  await native.execute(
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('vendor_name', 'September Incorporation'), ('support_phone', '024-18-96-012')"
  );
  await ensureLicenseDefault(current);

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

/** v3 product fields are plain nullable adds — no rebuild needed. Each column is
 *  checked against the table's actual current columns (one read) so a run
 *  interrupted partway through — power loss between two ALTERs — resumes
 *  correctly next launch instead of either re-adding an existing column
 *  ("duplicate column name") or, worse, silently never adding the rest. */
async function addProductV3Columns(): Promise<void> {
  const adds: [name: string, ddl: string][] = [
    ["sku", "sku TEXT"],
    ["family", "family TEXT"],
    ["brand", "brand TEXT"],
    ["supplier", "supplier TEXT"],
    ["description", "description TEXT"],
    ["image", "image TEXT"],
    ["promo_price_pesewas", "promo_price_pesewas INTEGER"],
    ["bulk_price_pesewas", "bulk_price_pesewas INTEGER"],
    ["bulk_min_qty", "bulk_min_qty INTEGER"],
    ["expiry_date", "expiry_date TEXT"],
    ["batch_number", "batch_number TEXT"],
  ];
  const existing = new Set(
    (await native.select<{ name: string }>("PRAGMA table_info(products)")).map((c) => c.name)
  );
  for (const [name, ddl] of adds) {
    if (!existing.has(name)) await native.execute(`ALTER TABLE products ADD COLUMN ${ddl}`);
  }
}

/** True while sale_items still has the v1 CHECK restricting unit to piece/box. */
async function saleItemsHasUnitCheck(): Promise<boolean> {
  const [row] = await native.select<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sale_items'"
  );
  return row != null && row.sql.includes("CHECK");
}

/** SQLite can't widen a CHECK or drop one via ALTER, so a schema change to an
 *  existing constraint means: build the new shape as a temp table, copy the old
 *  rows in, drop the old table, rename the temp one into place. Every v2/v3
 *  rebuild (sales, sale_items, stock_movements) is this exact same shape with
 *  FKs off and full rollback — written once here instead of three times so the
 *  transaction-safety logic (and any future fix to it) only has to be right in
 *  one place. */
interface RebuildSpec {
  /** Table being rebuilt in place. */
  table: string;
  /** Column definitions for the temp table (no `CREATE TABLE` wrapper). */
  createColumns: string;
  /** Destination column list for the copy — usually the temp table's own columns. */
  insertColumns: string;
  /** Source expression list for the copy — literals (e.g. `NULL`, `0`) fill columns
   *  the old table didn't have. */
  insertSelect: string;
  /** Statements to run once the temp table has taken the original's name. */
  afterRename: string[];
}

async function rebuildTable(spec: RebuildSpec): Promise<void> {
  const tmp = `${spec.table}_rebuild`;
  await native.execute("PRAGMA foreign_keys = OFF");
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute(`CREATE TABLE ${tmp} (${spec.createColumns})`);
    await native.execute(
      `INSERT INTO ${tmp} (${spec.insertColumns}) SELECT ${spec.insertSelect} FROM ${spec.table}`
    );
    await native.execute(`DROP TABLE ${spec.table}`);
    await native.execute(`ALTER TABLE ${tmp} RENAME TO ${spec.table}`);
    for (const stmt of spec.afterRename) await native.execute(stmt);
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  } finally {
    // Always restore FK enforcement, even on failure — otherwise a rebuild
    // error silently leaves referential integrity unchecked for the rest of
    // the session instead of failing loudly.
    await native.execute("PRAGMA foreign_keys = ON");
  }
}

/** Rebuild sale_items without the unit CHECK so custom selling-unit names can be
 *  snapshotted. */
async function rebuildSaleItemsForV3(): Promise<void> {
  const columns =
    "id, sale_id, product_id, product_name, unit, qty, unit_price_pesewas, " +
    "line_total_pesewas, pieces_deducted";
  await rebuildTable({
    table: "sale_items",
    createColumns: `
      id INTEGER PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price_pesewas INTEGER NOT NULL,
      line_total_pesewas INTEGER NOT NULL,
      pieces_deducted INTEGER NOT NULL`,
    insertColumns: columns,
    insertSelect: columns,
    afterRename: ["CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)"],
  });
}

/** Rebuild stock_movements with the v3 reason list + prev/new stock + note.
 *  Old rows keep NULL prev/new (unknown at the time). */
async function rebuildMovementsForV3(): Promise<void> {
  await rebuildTable({
    table: "stock_movements",
    createColumns: `
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
      created_at TEXT NOT NULL`,
    insertColumns:
      "id, product_id, change_pieces, reason, reference_id, note, prev_pieces, new_pieces, user_id, created_at",
    insertSelect:
      "id, product_id, change_pieces, reason, reference_id, NULL, NULL, NULL, user_id, created_at",
    afterRename: [
      "CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_movements(product_id)",
    ],
  });
}

/** Rebuild `sales` with the v2 columns + widened payment_method CHECK, preserving
 *  all rows and ids; sale_items/stock_movements re-bind to the renamed table. */
async function rebuildSalesForV2(): Promise<void> {
  await rebuildTable({
    table: "sales",
    createColumns: `
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
      credit_pesewas INTEGER NOT NULL DEFAULT 0`,
    insertColumns:
      "id, receipt_no, user_id, subtotal_pesewas, discount_pesewas, total_pesewas, " +
      "amount_paid_pesewas, change_pesewas, payment_method, cash_part_pesewas, " +
      "momo_part_pesewas, momo_reference, status, voided_by, void_reason, seq, created_at, " +
      "customer_id, credit_pesewas",
    insertSelect:
      "id, receipt_no, user_id, subtotal_pesewas, discount_pesewas, total_pesewas, " +
      "amount_paid_pesewas, change_pesewas, payment_method, cash_part_pesewas, " +
      "momo_part_pesewas, momo_reference, status, voided_by, void_reason, seq, created_at, " +
      "NULL, 0",
    afterRename: [
      "CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)",
      "CREATE INDEX IF NOT EXISTS idx_sales_seq ON sales(seq)",
    ],
  });
}

/** True while `users.role` still has the v1 CHECK restricting it to admin/cashier. */
async function usersRoleNeedsV4(): Promise<boolean> {
  const [row] = await native.select<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  );
  return row != null && row.sql.includes("'admin', 'cashier'");
}

/** Widen `users.role` to the full v4 role set and add `permissions` (a JSON
 *  override blob -- null means "use the role's default permission set", see
 *  src/auth/permissions.ts) + `branch_id`. Existing 'admin'/'cashier' rows are
 *  untouched by the copy; the CHECK just stops rejecting the new role names. */
async function rebuildUsersForV4(): Promise<void> {
  await rebuildTable({
    table: "users",
    createColumns: `
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN
        ('super_admin', 'owner', 'admin', 'manager', 'supervisor', 'cashier')),
      pin_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      permissions TEXT,
      branch_id INTEGER REFERENCES branches(id),
      created_at TEXT NOT NULL`,
    insertColumns: "id, name, role, pin_hash, active, created_at",
    insertSelect: "id, name, role, pin_hash, active, created_at",
    afterRename: [],
  });
}

/** Every branch-scoped row (products/sales/users) needs a branch_id. Existing
 *  single-branch shops get one "Main" branch created automatically and every
 *  pre-v4 row backfilled onto it, so nothing becomes orphaned by the upgrade. */
async function ensureMainBranchAndBackfill(): Promise<void> {
  const [{ n }] = await native.select<{ n: number }>("SELECT COUNT(*) AS n FROM branches");
  if (n === 0) {
    await native.execute(
      "INSERT INTO branches (name, code, active, created_at) VALUES ('Main', 'MAIN', 1, ?)",
      [new Date().toISOString()]
    );
  }
  const [{ id: mainId }] = await native.select<{ id: number }>(
    "SELECT id FROM branches ORDER BY id LIMIT 1"
  );
  await native.execute("UPDATE products SET branch_id = ? WHERE branch_id IS NULL", [mainId]);
  await native.execute("UPDATE sales SET branch_id = ? WHERE branch_id IS NULL", [mainId]);
  await native.execute("UPDATE users SET branch_id = ? WHERE branch_id IS NULL", [mainId]);
}

/** Decide whether this install needs to go through LicenseGate.
 *  - Already has a license_status row (activated, or already decided): leave it.
 *  - Mock/browser dev harness: always pre-activate, same spirit as skipping
 *    window.print() in mock mode (SellScreen) -- there's no install flow to
 *    test license activation against in dev, and it shouldn't block testing.
 *  - `current` (the schema version this DB had *before* this migrate() run)
 *    is 0 only for a genuinely fresh database -- one that just got its schema
 *    for the first time. Anything upgrading from a pre-v4 install (current
 *    1-3) already has real data and a paying user behind it; grandfather it
 *    in as active rather than retroactively locking out existing customers.
 *    A truly fresh install (current === 0, real Tauri build) is left unset,
 *    so LicenseGate demands activation. */
async function ensureLicenseDefault(current: number): Promise<void> {
  const rows = await native.select<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'license_status'"
  );
  if (rows.length) return;
  if (native.kind === "mock" || current > 0) {
    await native.execute(
      "INSERT INTO settings (key, value) VALUES ('license_status', 'active')"
    );
  }
}
