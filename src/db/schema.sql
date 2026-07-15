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

CREATE TABLE IF NOT EXISTS products (
  id                       INTEGER PRIMARY KEY,
  name                     TEXT NOT NULL,
  barcode                  TEXT UNIQUE,                 -- nullable: not every item has one
  category_id              INTEGER REFERENCES categories(id),
  pieces_per_box           INTEGER NOT NULL DEFAULT 1,  -- 1 for loose items
  retail_price_pesewas     INTEGER NOT NULL,            -- price per PIECE
  wholesale_price_pesewas  INTEGER,                     -- price per BOX (null = retail only)
  cost_price_pesewas       INTEGER,                     -- per piece, admin-only
  stock_pieces             INTEGER NOT NULL DEFAULT 0,  -- ALL stock tracked in pieces
  low_stock_threshold      INTEGER NOT NULL DEFAULT 10,
  active                   INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
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
  credit_pesewas        INTEGER NOT NULL DEFAULT 0          -- amount charged to the account
);

CREATE TABLE IF NOT EXISTS sale_items (
  id                  INTEGER PRIMARY KEY,
  sale_id             INTEGER NOT NULL REFERENCES sales(id),
  product_id          INTEGER NOT NULL REFERENCES products(id),
  product_name        TEXT NOT NULL,                    -- snapshot at sale time
  unit                TEXT NOT NULL CHECK (unit IN ('piece', 'box')),
  qty                 INTEGER NOT NULL,
  unit_price_pesewas  INTEGER NOT NULL,                 -- snapshot at sale time
  line_total_pesewas  INTEGER NOT NULL,
  pieces_deducted     INTEGER NOT NULL                  -- qty × (box ? pieces_per_box : 1)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  change_pieces INTEGER NOT NULL,                       -- negative sale, positive restock/void
  reason        TEXT NOT NULL CHECK (reason IN ('sale', 'void', 'restock', 'adjustment')),
  reference_id  INTEGER,                                -- sale id when applicable
  user_id       INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL
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

-- NOTE: Phase 2 adds an FTS5 virtual table (products_fts) for the manual search
-- flow (<100ms on 10k rows). It is omitted here so the dev mock adapter runs on
-- SQLite builds without the FTS5 extension.

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_seq ON sales(seq);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id);
-- idx_sales_customer is created in migrate.ts, after the v2 sales rebuild ensures
-- the customer_id column exists on upgraded databases.
