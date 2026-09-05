// Product queries. Phase 1 only needs a read for the list; Phase 2/4 add search,
// CRUD, restock, and stock validation.

import { native } from "@/native";
import { logAudit } from "./audit";
import { applyStockMovement, type MovementReason } from "./movements";
import { getCurrentBranchId } from "./branches";
import { isFtsReady, toFtsQuery } from "../fts";

export interface Product {
  id: number;
  name: string;
  barcode: string | null;
  sku: string | null;
  family: string | null;
  brand: string | null;
  supplier: string | null;
  description: string | null;
  image: string | null;
  category_id: number | null;
  category_name: string | null;
  pieces_per_box: number;
  retail_price_pesewas: number;
  wholesale_price_pesewas: number | null;
  promo_price_pesewas: number | null;
  bulk_price_pesewas: number | null;
  bulk_min_qty: number | null;
  deal_qty: number | null;
  deal_price_pesewas: number | null;
  cost_price_pesewas: number | null;
  stock_pieces: number;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
  active: number;
  branch_id: number | null;
}

// Exported so every Product-returning query (including analytics.ts) selects
// the same columns — a query with its own hand-copied list silently drifts out
// of sync with the Product type the next time a column is added.
export const SELECT_PRODUCT = `
  SELECT p.id, p.name, p.barcode, p.sku, p.family, p.brand, p.supplier, p.description,
         p.image, p.category_id, c.name AS category_name, p.pieces_per_box,
         p.retail_price_pesewas, p.wholesale_price_pesewas, p.promo_price_pesewas,
         p.bulk_price_pesewas, p.bulk_min_qty, p.deal_qty, p.deal_price_pesewas,
         p.cost_price_pesewas,
         p.stock_pieces, p.low_stock_threshold, p.expiry_date, p.batch_number, p.active,
         p.branch_id
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
    where.push(
      `(p.name LIKE ? OR p.barcode LIKE ? OR c.name LIKE ?
        OR p.sku LIKE ? OR p.family LIKE ? OR p.brand LIKE ? OR p.supplier LIKE ?)`
    );
    params.push(q, q, q, q, q, q, q);
  }
  if (filter.categoryId != null) {
    where.push("p.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.lowStockOnly) where.push("p.stock_pieces <= p.low_stock_threshold");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Variants sort next to their family; standalone products sort by their own name.
  return native.select<Product>(
    `${SELECT_PRODUCT} ${clause} ORDER BY COALESCE(p.family, p.name), p.name`,
    params
  );
}

/** Search active products by name or category. Uses the FTS5 index when available
 *  (<100ms on a 10k catalog, §10), else falls back to LIKE. */
export async function searchProducts(term: string, limit = 20): Promise<Product[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  if (isFtsReady()) {
    try {
      return await native.select<Product>(
        `${SELECT_PRODUCT}
           JOIN products_fts f ON f.rowid = p.id
          WHERE p.active = 1 AND products_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
        [toFtsQuery(trimmed), limit]
      );
    } catch {
      /* malformed MATCH — fall through to LIKE */
    }
  }

  const q = `%${trimmed}%`;
  return native.select<Product>(
    `${SELECT_PRODUCT}
      WHERE p.active = 1 AND (p.name LIKE ? OR c.name LIKE ?)
      ORDER BY p.name
      LIMIT ?`,
    [q, q, limit]
  );
}

/** Exact barcode lookup for the scan fast-path. Checks the variant's own barcode
 *  first, then its aliases (suppliers change manufacturer codes — §v3.6).
 *  Returns null if unregistered. */
export async function findByBarcode(barcode: string): Promise<Product | null> {
  const rows = await native.select<Product>(
    `${SELECT_PRODUCT} WHERE p.active = 1 AND p.barcode = ? LIMIT 1`,
    [barcode]
  );
  if (rows[0]) return rows[0];
  const viaAlias = await native.select<Product>(
    `${SELECT_PRODUCT}
      JOIN barcode_aliases a ON a.product_id = p.id
     WHERE p.active = 1 AND a.barcode = ? LIMIT 1`,
    [barcode]
  );
  return viaAlias[0] ?? null;
}

// ---- Barcode aliases --------------------------------------------------------

export interface BarcodeAlias {
  id: number;
  barcode: string;
}

export async function listAliases(productId: number): Promise<BarcodeAlias[]> {
  return native.select<BarcodeAlias>(
    "SELECT id, barcode FROM barcode_aliases WHERE product_id = ? ORDER BY id",
    [productId]
  );
}

/** Add an extra barcode that resolves to this variant. Rejects codes already in
 *  use anywhere (a barcode must identify exactly one variant). */
export async function addAlias(productId: number, barcode: string, userId: number): Promise<void> {
  const code = barcode.trim();
  if (!code) throw new Error("Barcode is empty.");
  const [owner] = await native.select<{ name: string }>(
    `SELECT name FROM products WHERE barcode = ?
     UNION
     SELECT p.name FROM barcode_aliases a JOIN products p ON p.id = a.product_id
      WHERE a.barcode = ?
     LIMIT 1`,
    [code, code]
  );
  if (owner) throw new Error(`That barcode already belongs to ${owner.name}.`);
  await native.execute(
    "INSERT INTO barcode_aliases (product_id, barcode, created_at) VALUES (?, ?, ?)",
    [productId, code, new Date().toISOString()]
  );
  await logAudit(userId, "barcode_alias_add", { product_id: productId, barcode: code });
}

export async function removeAlias(aliasId: number, userId: number): Promise<void> {
  const [row] = await native.select<{ product_id: number; barcode: string }>(
    "SELECT product_id, barcode FROM barcode_aliases WHERE id = ?",
    [aliasId]
  );
  await native.execute("DELETE FROM barcode_aliases WHERE id = ?", [aliasId]);
  if (row) {
    await logAudit(userId, "barcode_alias_remove", {
      product_id: row.product_id,
      barcode: row.barcode,
    });
  }
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
  sku: string | null;
  family: string | null;
  brand: string | null;
  supplier: string | null;
  description: string | null;
  image: string | null;
  category_id: number | null;
  pieces_per_box: number;
  retail_price_pesewas: number;
  wholesale_price_pesewas: number | null;
  promo_price_pesewas: number | null;
  bulk_price_pesewas: number | null;
  bulk_min_qty: number | null;
  deal_qty: number | null;
  deal_price_pesewas: number | null;
  cost_price_pesewas: number | null;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
}

/** Create a product with opening stock. Opening stock is recorded as a stock
 *  movement (reason 'adjustment') so the ledger explains where it came from. */
export async function createProduct(
  input: ProductInput,
  openingStockPieces: number,
  userId: number
): Promise<number> {
  const now = new Date().toISOString();
  const branchId = await getCurrentBranchId();
  await native.execute("BEGIN IMMEDIATE");
  try {
    const res = await native.execute(
      `INSERT INTO products
        (name, barcode, sku, family, brand, supplier, description, image, category_id,
         pieces_per_box, retail_price_pesewas, wholesale_price_pesewas, promo_price_pesewas,
         bulk_price_pesewas, bulk_min_qty, deal_qty, deal_price_pesewas,
         cost_price_pesewas, stock_pieces,
         low_stock_threshold, expiry_date, batch_number, active, branch_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        input.name,
        input.barcode,
        input.sku,
        input.family,
        input.brand,
        input.supplier,
        input.description,
        input.image,
        input.category_id,
        input.pieces_per_box,
        input.retail_price_pesewas,
        input.wholesale_price_pesewas,
        input.promo_price_pesewas,
        input.bulk_price_pesewas,
        input.bulk_min_qty,
        input.deal_qty,
        input.deal_price_pesewas,
        input.cost_price_pesewas,
        openingStockPieces,
        input.low_stock_threshold,
        input.expiry_date,
        input.batch_number,
        branchId,
        now,
        now,
      ]
    );
    const id = res.lastInsertId!;
    if (openingStockPieces !== 0) {
      // The insert above already set stock_pieces; record where it came from
      // without double-counting by writing the movement against a 0 baseline.
      await native.execute(
        `INSERT INTO stock_movements
          (product_id, change_pieces, reason, reference_id, note, prev_pieces, new_pieces,
           user_id, created_at)
         VALUES (?, ?, 'opening', NULL, NULL, 0, ?, ?, ?)`,
        [id, openingStockPieces, openingStockPieces, userId, now]
      );
    }
    await native.execute("COMMIT");
    await logAudit(userId, "product_create", { product_id: id, name: input.name });
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
       name = ?, barcode = ?, sku = ?, family = ?, brand = ?, supplier = ?,
       description = ?, image = ?, category_id = ?, pieces_per_box = ?,
       retail_price_pesewas = ?, wholesale_price_pesewas = ?, promo_price_pesewas = ?,
       bulk_price_pesewas = ?, bulk_min_qty = ?, deal_qty = ?, deal_price_pesewas = ?,
       cost_price_pesewas = ?,
       low_stock_threshold = ?, expiry_date = ?, batch_number = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.barcode,
      input.sku,
      input.family,
      input.brand,
      input.supplier,
      input.description,
      input.image,
      input.category_id,
      input.pieces_per_box,
      input.retail_price_pesewas,
      input.wholesale_price_pesewas,
      input.promo_price_pesewas,
      input.bulk_price_pesewas,
      input.bulk_min_qty,
      input.deal_qty,
      input.deal_price_pesewas,
      input.cost_price_pesewas,
      input.low_stock_threshold,
      input.expiry_date,
      input.batch_number,
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
    if (before.promo_price_pesewas !== input.promo_price_pesewas)
      changes.promo = [before.promo_price_pesewas, input.promo_price_pesewas];
    if (before.bulk_price_pesewas !== input.bulk_price_pesewas)
      changes.bulk = [before.bulk_price_pesewas, input.bulk_price_pesewas];
    if (before.deal_qty !== input.deal_qty)
      changes.deal_quantity = [before.deal_qty, input.deal_qty];
    if (before.deal_price_pesewas !== input.deal_price_pesewas)
      changes.deal_price = [before.deal_price_pesewas, input.deal_price_pesewas];
    if (before.cost_price_pesewas !== input.cost_price_pesewas)
      changes.cost = [before.cost_price_pesewas, input.cost_price_pesewas];
    if (Object.keys(changes).length > 0) {
      await logAudit(userId, "price_change", { product_id: id, name: input.name, changes });
    }
  }
}

/** Distinct family names, for the drawer's autocomplete. */
export async function listFamilies(): Promise<string[]> {
  const rows = await native.select<{ family: string }>(
    "SELECT DISTINCT family FROM products WHERE family IS NOT NULL AND family != '' ORDER BY family"
  );
  return rows.map((r) => r.family);
}

/** Ensure a product has a scannable barcode (pos-prd.md §6.3 — shop-generated
 *  codes for unlabeled goods). If it already has one, returns it; otherwise mints
 *  a numeric shop code, saves it, and returns it so the printed label scans. */
export async function ensureShopCode(productId: number): Promise<string> {
  const [row] = await native.select<{ barcode: string | null }>(
    "SELECT barcode FROM products WHERE id = ?",
    [productId]
  );
  if (row?.barcode) return row.barcode;
  // A stable, unique numeric code derived from the id (leading 2 = internal use).
  const code = `2${String(productId).padStart(7, "0")}`;
  await native.execute("UPDATE products SET barcode = ?, updated_at = ? WHERE id = ?", [
    code,
    new Date().toISOString(),
    productId,
  ]);
  return code;
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
  const [product] = await native.select<{ name: string }>("SELECT name FROM products WHERE id = ?", [id]);
  await native.execute("UPDATE products SET active = ?, updated_at = ? WHERE id = ?", [
    active ? 1 : 0,
    new Date().toISOString(),
    id,
  ]);
  await logAudit(userId, active ? "product_activate" : "product_deactivate", { product_id: id, name: product?.name });
}

/** Hard delete — only allowed for products with zero sales (a mistake fix). */
export async function deleteProduct(id: number, userId: number): Promise<void> {
  if ((await productSalesCount(id)) > 0) {
    throw new Error("This product has sales and can't be deleted. Deactivate it instead.");
  }
  const [product] = await native.select<{ name: string }>("SELECT name FROM products WHERE id = ?", [id]);
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute("DELETE FROM stock_movements WHERE product_id = ?", [id]);
    await native.execute("DELETE FROM barcode_aliases WHERE product_id = ?", [id]);
    await native.execute("DELETE FROM selling_units WHERE product_id = ?", [id]);
    await native.execute("DELETE FROM products WHERE id = ?", [id]);
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await logAudit(userId, "product_delete", { product_id: id, name: product?.name });
}

/** Record a stock movement (restock, purchase, damage, count adjustment...) —
 *  never a raw field edit (pos-prd.md §6.3, v3 §11). Positive change adds stock,
 *  negative removes it; prev/new stock are captured on the movement row. */
export async function recordStockChange(
  id: number,
  changePieces: number,
  reason: MovementReason,
  userId: number,
  note?: string
): Promise<void> {
  await native.execute("BEGIN IMMEDIATE");
  try {
    await applyStockMovement({ productId: id, changePieces, reason, userId, note });
    await native.execute("COMMIT");
    await logAudit(userId, "stock_adjustment", { product_id: id, change_pieces: changePieces, reason, note });
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}
