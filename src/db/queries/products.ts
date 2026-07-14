// Product queries. Phase 1 only needs a read for the list; Phase 2/4 add search,
// CRUD, restock, and stock validation.

import { native } from "@/native";

export interface Product {
  id: number;
  name: string;
  barcode: string | null;
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
  SELECT p.id, p.name, p.barcode, c.name AS category_name, p.pieces_per_box,
         p.retail_price_pesewas, p.wholesale_price_pesewas, p.cost_price_pesewas,
         p.stock_pieces, p.low_stock_threshold, p.active
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id`;

export async function listProducts(): Promise<Product[]> {
  return native.select<Product>(`${SELECT_PRODUCT} WHERE p.active = 1 ORDER BY p.name`);
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
