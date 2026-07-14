// Product queries. Phase 1 only needs a read for the list; Phase 2/4 add search,
// CRUD, restock, and stock validation.

import { native } from "@/native";
import { logAudit } from "./audit";

export interface Product {
  id: number;
  name: string;
  barcode: string | null;
  category_id: number | null;
  category_name: string | null;
  pieces_per_box: number;
  retail_price_pesewas: number;
  wholesale_price_pesewas: number | null;
  cost_price_pesewas: number | null;
  stock_pieces: number;
  low_stock_threshold: number;
  active: number;
}

const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.barcode, p.category_id, c.name AS category_name, p.pieces_per_box,
         p.retail_price_pesewas, p.wholesale_price_pesewas, p.cost_price_pesewas,
         p.stock_pieces, p.low_stock_threshold, p.active
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id`;

export async function listProducts(): Promise<Product[]> {
  return native.select<Product>(`${SELECT_PRODUCT} WHERE p.active = 1 ORDER BY p.name`);
}

export interface ProductFilter {
  text?: string;
  categoryId?: number | null;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}

/** The management list: honors search, category, and low-stock filters and can
 *  include deactivated products (shown with their status). */
export async function listProductsManage(filter: ProductFilter = {}): Promise<Product[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filter.includeInactive) where.push("p.active = 1");
  if (filter.text?.trim()) {
    const q = `%${filter.text.trim()}%`;
    where.push("(p.name LIKE ? OR p.barcode LIKE ? OR c.name LIKE ?)");
    params.push(q, q, q);
  }
  if (filter.categoryId != null) {
    where.push("p.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.lowStockOnly) where.push("p.stock_pieces <= p.low_stock_threshold");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return native.select<Product>(`${SELECT_PRODUCT} ${clause} ORDER BY p.name`, params);
}

/** Search active products by name or category (Phase 2: LIKE; FTS5 comes later
 *  for the 10k-catalog performance target). */
export async function searchProducts(term: string, limit = 20): Promise<Product[]> {
  const q = `%${term.trim()}%`;
  return native.select<Product>(
    `${SELECT_PRODUCT}
      WHERE p.active = 1 AND (p.name LIKE ? OR c.name LIKE ?)
      ORDER BY p.name
      LIMIT ?`,
    [q, q, limit]
  );
}

/** Exact barcode lookup for the scan fast-path. Returns null if unregistered. */
export async function findByBarcode(barcode: string): Promise<Product | null> {
  const rows = await native.select<Product>(
    `${SELECT_PRODUCT} WHERE p.active = 1 AND p.barcode = ? LIMIT 1`,
    [barcode]
  );
  return rows[0] ?? null;
}

/** The most-sold products for the quick grid, padded with recent products so a
 *  fresh shop still sees tiles before any sales exist. */
export async function topProducts(limit = 24): Promise<Product[]> {
  return native.select<Product>(
    `${SELECT_PRODUCT}
      WHERE p.active = 1
      ORDER BY (
        SELECT COALESCE(SUM(si.qty), 0)
          FROM sale_items si WHERE si.product_id = p.id
      ) DESC, p.name
      LIMIT ?`,
    [limit]
  );
}

// ---- Categories -----------------------------------------------------------

export interface Category {
  id: number;
  name: string;
}

export async function listCategories(): Promise<Category[]> {
  return native.select<Category>("SELECT id, name FROM categories ORDER BY name");
}

/** Create a category (or return the existing one with that name). Inline creation
 *  from the product drawer relies on this. */
export async function ensureCategory(name: string): Promise<number> {
  const trimmed = name.trim();
  await native.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", [trimmed]);
  const [row] = await native.select<{ id: number }>(
    "SELECT id FROM categories WHERE name = ?",
    [trimmed]
  );
  return row.id;
}

// ---- Product mutations ----------------------------------------------------

export interface ProductInput {
  name: string;
  barcode: string | null;
  category_id: number | null;
  pieces_per_box: number;
  retail_price_pesewas: number;
  wholesale_price_pesewas: number | null;
  cost_price_pesewas: number | null;
  low_stock_threshold: number;
}

/** Create a product with opening stock. Opening stock is recorded as a stock
 *  movement (reason 'adjustment') so the ledger explains where it came from. */
export async function createProduct(
  input: ProductInput,
  openingStockPieces: number,
  userId: number
): Promise<number> {
  const now = new Date().toISOString();
  await native.execute("BEGIN IMMEDIATE");
  try {
    const res = await native.execute(
      `INSERT INTO products
        (name, barcode, category_id, pieces_per_box, retail_price_pesewas,
         wholesale_price_pesewas, cost_price_pesewas, stock_pieces, low_stock_threshold,
         active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        input.name,
        input.barcode,
        input.category_id,
        input.pieces_per_box,
        input.retail_price_pesewas,
        input.wholesale_price_pesewas,
        input.cost_price_pesewas,
        openingStockPieces,
        input.low_stock_threshold,
        now,
        now,
      ]
    );
    const id = res.lastInsertId!;
    if (openingStockPieces !== 0) {
      await native.execute(
        `INSERT INTO stock_movements (product_id, change_pieces, reason, reference_id, user_id, created_at)
         VALUES (?, ?, 'adjustment', NULL, ?, ?)`,
        [id, openingStockPieces, userId, now]
      );
    }
    await native.execute("COMMIT");
    return id;
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}

/** Update a product's details (not its stock — that's restock). Price changes are
 *  written to the audit log. */
export async function updateProduct(
  id: number,
  input: ProductInput,
  userId: number
): Promise<void> {
  const [before] = await native.select<Product>(`${SELECT_PRODUCT} WHERE p.id = ?`, [id]);
  const now = new Date().toISOString();
  await native.execute(
    `UPDATE products SET
       name = ?, barcode = ?, category_id = ?, pieces_per_box = ?,
       retail_price_pesewas = ?, wholesale_price_pesewas = ?, cost_price_pesewas = ?,
       low_stock_threshold = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.barcode,
      input.category_id,
      input.pieces_per_box,
      input.retail_price_pesewas,
      input.wholesale_price_pesewas,
      input.cost_price_pesewas,
      input.low_stock_threshold,
      now,
      id,
    ]
  );

  if (before) {
    const changes: Record<string, [number | null, number | null]> = {};
    if (before.retail_price_pesewas !== input.retail_price_pesewas)
      changes.retail = [before.retail_price_pesewas, input.retail_price_pesewas];
    if (before.wholesale_price_pesewas !== input.wholesale_price_pesewas)
      changes.wholesale = [before.wholesale_price_pesewas, input.wholesale_price_pesewas];
    if (before.cost_price_pesewas !== input.cost_price_pesewas)
      changes.cost = [before.cost_price_pesewas, input.cost_price_pesewas];
    if (Object.keys(changes).length > 0) {
      await logAudit(userId, "price_change", { product_id: id, name: input.name, changes });
    }
  }
}

export async function productSalesCount(id: number): Promise<number> {
  const [row] = await native.select<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sale_items WHERE product_id = ?",
    [id]
  );
  return row.n;
}

/** Deactivate a product (kept for history). Deactivated products can't be scanned
 *  or searched on the sales screen. */
export async function setProductActive(id: number, active: boolean, userId: number): Promise<void> {
  await native.execute("UPDATE products SET active = ?, updated_at = ? WHERE id = ?", [
    active ? 1 : 0,
    new Date().toISOString(),
    id,
  ]);
  await logAudit(userId, active ? "product_activate" : "product_deactivate", { product_id: id });
}

/** Hard delete — only allowed for products with zero sales (a mistake fix). */
export async function deleteProduct(id: number, userId: number): Promise<void> {
  if ((await productSalesCount(id)) > 0) {
    throw new Error("This product has sales and can't be deleted. Deactivate it instead.");
  }
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute("DELETE FROM stock_movements WHERE product_id = ?", [id]);
    await native.execute("DELETE FROM products WHERE id = ?", [id]);
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await logAudit(userId, "product_delete", { product_id: id });
}

/** Restock: add (or correct) stock via a movement, never a raw field edit
 *  (pos-prd.md §6.3). Positive change adds; reason distinguishes restock vs count
 *  adjustment. */
export async function restockProduct(
  id: number,
  changePieces: number,
  reason: "restock" | "adjustment",
  userId: number
): Promise<void> {
  const now = new Date().toISOString();
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute(
      "UPDATE products SET stock_pieces = stock_pieces + ?, updated_at = ? WHERE id = ?",
      [changePieces, now, id]
    );
    await native.execute(
      `INSERT INTO stock_movements (product_id, change_pieces, reason, reference_id, user_id, created_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [id, changePieces, reason, userId, now]
    );
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}
