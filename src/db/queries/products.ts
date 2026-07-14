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

export async function listProducts(): Promise<Product[]> {
  return native.select<Product>(
    `SELECT p.id, p.name, p.barcode, c.name AS category_name, p.pieces_per_box,
            p.retail_price_pesewas, p.wholesale_price_pesewas, p.cost_price_pesewas,
            p.stock_pieces, p.low_stock_threshold, p.active
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1
      ORDER BY p.name`
  );
}
