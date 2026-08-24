-- CounterTop POS — canonical SQLite schema (mirrors pos-prd.md §5).
-- Money is stored as INTEGER pesewas (GHS × 100). Never floats.
-- Run inside a transaction by migrate.ts on first launch.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  pin_hash    TEXT NOT NULL,                 -- argon2
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL
);

-- Each row is a sellable VARIANT ("Milo 400g Tin"). Variants of one product share
-- a `family` name ("Milo") — that's the product level of the v3 data model. Every
-- variant has its own barcode, prices, and stock.
CREATE TABLE IF NOT EXISTS products (
  id                       INTEGER PRIMARY KEY,
  name                     TEXT NOT NULL,
  barcode                  TEXT UNIQUE,                 -- nullable: not every item has one
  sku                      TEXT,
  family                   TEXT,                        -- product family; null = standalone
  brand                    TEXT,
  supplier                 TEXT,
  description              TEXT,
  image                    TEXT,                        -- small data-URL thumbnail
  category_id              INTEGER REFERENCES categories(id),
  pieces_per_box           INTEGER NOT NULL DEFAULT 1,  -- 1 for loose items
  retail_price_pesewas     INTEGER NOT NULL,            -- price per PIECE
  wholesale_price_pesewas  INTEGER,                     -- price per BOX (null = retail only)
  promo_price_pesewas      INTEGER,                     -- per piece; overrides retail while set
  bulk_price_pesewas       INTEGER,                     -- per-piece wholesale (bulk buys)
  bulk_min_qty             INTEGER,                     -- piece qty where bulk price kicks in
  cost_price_pesewas       INTEGER,                     -- per piece, admin-only
  stock_pieces             INTEGER NOT NULL DEFAULT 0,  -- ALL stock tracked in pieces
  low_stock_threshold      INTEGER NOT NULL DEFAULT 10, -- reorder level
  expiry_date              TEXT,                        -- ISO date, optional
  batch_number             TEXT,
  active                   INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

-- Extra barcodes that resolve to the same variant (suppliers change codes).
CREATE TABLE IF NOT EXISTS barcode_aliases (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  barcode     TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL
);

-- Custom selling units beyond the built-in PC/BOX ("Half Tray", "Crate", "5kg").
-- Each has its own price; `pieces` is the stock deducted per unit sold.
CREATE TABLE IF NOT EXISTS selling_units (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  name          TEXT NOT NULL,
  pieces        INTEGER NOT NULL,
  price_pesewas INTEGER NOT NULL,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id                    INTEGER PRIMARY KEY,
  receipt_no            TEXT UNIQUE NOT NULL,           -- "R-000481", from sequence
  user_id               INTEGER NOT NULL REFERENCES users(id),
  subtotal_pesewas      INTEGER NOT NULL,
  discount_pesewas      INTEGER NOT NULL DEFAULT 0,
  total_pesewas         INTEGER NOT NULL,
  amount_paid_pesewas   INTEGER NOT NULL,
  change_pesewas        INTEGER NOT NULL DEFAULT 0,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('cash', 'momo', 'split', 'credit')),
  cash_part_pesewas     INTEGER NOT NULL DEFAULT 0,
  momo_part_pesewas     INTEGER NOT NULL DEFAULT 0,
  momo_reference        TEXT,
  status                TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  voided_by             INTEGER REFERENCES users(id),
  void_reason           TEXT,
  seq                   INTEGER NOT NULL,               -- monotonic, clock-independent ordering
  created_at            TEXT NOT NULL,
  customer_id           INTEGER REFERENCES customers(id),  -- credit sales (v2)
  credit_pesewas        INTEGER NOT NULL DEFAULT 0,         -- amount charged to the account
  tax_pesewas           INTEGER NOT NULL DEFAULT 0,         -- added on top of total (v3)
  note                  TEXT                                -- optional cashier note (v3)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id                  INTEGER PRIMARY KEY,
  sale_id             INTEGER NOT NULL REFERENCES sales(id),
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_name        TEXT NOT NULL,                    -- snapshot at sale time
  unit                TEXT NOT NULL,                    -- 'piece', 'box', or a custom unit name
  qty                 INTEGER NOT NULL,
  unit_price_pesewas  INTEGER NOT NULL,                 -- snapshot at sale time
  line_total_pesewas  INTEGER NOT NULL,
  pieces_deducted     INTEGER NOT NULL                  -- qty × pieces-per-unit
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  change_pieces INTEGER NOT NULL,                       -- negative out, positive in
  reason        TEXT NOT NULL CHECK (reason IN
                  ('sale', 'void', 'restock', 'adjustment', 'purchase', 'return',
                   'damaged', 'expired', 'transfer', 'opening')),
  reference_id  INTEGER,                                -- sale id when applicable
  note          TEXT,                                   -- free-text reason detail (v3)
  prev_pieces   INTEGER,                                -- stock before (v3; null on old rows)
  new_pieces    INTEGER,                                -- stock after  (v3; null on old rows)
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL
);

-- Parked carts the cashier can resume (v3 hold/resume).
CREATE TABLE IF NOT EXISTS held_sales (
  id          INTEGER PRIMARY KEY,
  label       TEXT,
  cart_json   TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,                            -- 'price_change','void','pin_reset'...
  detail      TEXT,                                     -- JSON
  created_at  TEXT NOT NULL
);

-- Monotonic counters. receipt_no is derived from `receipt` here, never from the clock.
CREATE TABLE IF NOT EXISTS sequences (
  name   TEXT PRIMARY KEY,
  value  INTEGER NOT NULL
);

-- Customers & credit (v2). A customer's balance owed is the running total of
-- 'charge' rows (credit given at sale time) minus 'payment' rows (repayments).
CREATE TABLE IF NOT EXISTS customers (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  phone                 TEXT,
  note                  TEXT,
  credit_limit_pesewas  INTEGER,                   -- null = no limit
  customer_type         TEXT NOT NULL DEFAULT 'retail',  -- 'retail' | 'wholesale' (v3)
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_ledger (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  kind           TEXT NOT NULL CHECK (kind IN ('charge', 'payment')),
  amount_pesewas INTEGER NOT NULL,                 -- always positive
  sale_id        INTEGER REFERENCES sales(id),     -- set for 'charge' rows
  method         TEXT,                             -- for 'payment' rows: cash/momo
  note           TEXT,
  user_id        INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL
);

-- Branches (v4, MVP 2.0). A single local DB can hold more than one branch's
-- data (products/users/sales carry branch_id) -- this models multi-branch
-- ownership today without needing real multi-machine sync, which a future
-- cloud backend would add on top, not replace.
CREATE TABLE IF NOT EXISTS branches (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,
  location    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

-- Stock transfers between branches (v4). Never a manual stock edit -- its own
-- workflow with a status lifecycle and an approval step.
CREATE TABLE IF NOT EXISTS stock_transfers (
  id               INTEGER PRIMARY KEY,
  transfer_no      TEXT UNIQUE NOT NULL,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  from_branch_id   INTEGER NOT NULL REFERENCES branches(id),
  to_branch_id     INTEGER NOT NULL REFERENCES branches(id),
  qty_pieces       INTEGER NOT NULL,
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by     INTEGER NOT NULL REFERENCES users(id),
  approved_by      INTEGER REFERENCES users(id),
  received_by      INTEGER REFERENCES users(id),
  rejected_reason  TEXT,
  created_at       TEXT NOT NULL,
  approved_at      TEXT,
  completed_at     TEXT
);

-- Sync queue (v4): a local change log every mutation appends to. This is the
-- seam a future cloud sync service drains and POSTs -- see src/sync/. No
-- server exists yet, so rows simply accumulate with synced = 0 until one does.
CREATE TABLE IF NOT EXISTS sync_queue (
  id          INTEGER PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  payload     TEXT NOT NULL,
  synced      INTEGER NOT NULL DEFAULT 0,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL,
  synced_at   TEXT
);

-- Operating expenses (v4) -- lets the Financial dashboard show a real net
-- margin (gross profit minus expenses) instead of only a gross figure.
CREATE TABLE IF NOT EXISTS expenses (
  id             INTEGER PRIMARY KEY,
  category       TEXT NOT NULL,
  amount_pesewas INTEGER NOT NULL,
  note           TEXT,
  branch_id      INTEGER REFERENCES branches(id),
  user_id        INTEGER NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfers_from_branch ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_branch ON stock_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);

-- NOTE: Phase 2 adds an FTS5 virtual table (products_fts) for the manual search
-- flow (<100ms on 10k rows). It is omitted here so the dev mock adapter runs on
-- SQLite builds without the FTS5 extension.

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
-- idx_products_family is created in migrate.ts, after the v3 column adds ensure
-- the column exists on upgraded databases.
CREATE INDEX IF NOT EXISTS idx_aliases_product ON barcode_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_units_product ON selling_units(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_seq ON sales(seq);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id);
-- idx_sales_customer is created in migrate.ts, after the v2 sales rebuild ensures
-- the customer_id column exists on upgraded databases.
