// Reports (pos-prd.md §6.5). Date-range analytics over completed sales, plus the
// voided-sales log and per-product stock movement history. All money is pesewas.

import { native } from "@/native";

export interface Range {
  from: string; // ISO inclusive
  toExclusive: string; // ISO exclusive
}

export interface SalesSummary {
  count: number;
  revenue: number; // includes tax (it's the customer-facing total)
  taxTotal: number; // the portion of revenue that was tax
  profit: number;
  cashTotal: number;
  momoTotal: number;
  avgSale: number;
}

export async function salesSummary(r: Range): Promise<SalesSummary> {
  const [head] = await native.select<{
    count: number;
    revenue: number;
    taxTotal: number;
    cashTotal: number;
    momoTotal: number;
  }>(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(total_pesewas), 0) AS revenue,
            COALESCE(SUM(tax_pesewas), 0) AS taxTotal,
            COALESCE(SUM(CASE payment_method
              WHEN 'cash' THEN amount_paid_pesewas - change_pesewas
              WHEN 'split' THEN cash_part_pesewas ELSE 0 END), 0) AS cashTotal,
            COALESCE(SUM(CASE payment_method
              WHEN 'momo' THEN total_pesewas
              WHEN 'split' THEN momo_part_pesewas ELSE 0 END), 0) AS momoTotal
       FROM sales
      WHERE status = 'completed' AND created_at >= ? AND created_at < ?`,
    [r.from, r.toExclusive]
  );
  const [{ profit }] = await native.select<{ profit: number }>(
    `SELECT COALESCE(SUM(si.line_total_pesewas - si.pieces_deducted * COALESCE(p.cost_price_pesewas, 0)), 0) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
      WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?`,
    [r.from, r.toExclusive]
  );
  return {
    ...head,
    profit,
    avgSale: head.count ? Math.round(head.revenue / head.count) : 0,
  };
}

export interface ProductRow {
  product_name: string;
  qty: number;
  revenue: number;
  profit: number;
}

export async function salesByProduct(r: Range): Promise<ProductRow[]> {
  return native.select<ProductRow>(
    `SELECT si.product_name,
            SUM(si.qty) AS qty,
            SUM(si.line_total_pesewas) AS revenue,
            SUM(si.line_total_pesewas - si.pieces_deducted * COALESCE(p.cost_price_pesewas, 0)) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
      WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
      GROUP BY si.product_name
      ORDER BY revenue DESC`,
    [r.from, r.toExclusive]
  );
}

export interface CategoryRow {
  category: string;
  qty: number;
  revenue: number;
}

export async function salesByCategory(r: Range): Promise<CategoryRow[]> {
  return native.select<CategoryRow>(
    `SELECT COALESCE(c.name, 'Uncategorised') AS category,
            SUM(si.qty) AS qty,
            SUM(si.line_total_pesewas) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
      GROUP BY category
      ORDER BY revenue DESC`,
    [r.from, r.toExclusive]
  );
}

export interface CashierRow {
  cashier: string;
  count: number;
  revenue: number;
}

export async function salesByCashier(r: Range): Promise<CashierRow[]> {
  return native.select<CashierRow>(
    `SELECT u.name AS cashier, COUNT(*) AS count, COALESCE(SUM(s.total_pesewas), 0) AS revenue
       FROM sales s JOIN users u ON u.id = s.user_id
      WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
      GROUP BY u.id
      ORDER BY revenue DESC`,
    [r.from, r.toExclusive]
  );
}

// ---- Inventory reports (v3 §21) --------------------------------------------

export interface ValuationRow {
  name: string;
  stock_pieces: number;
  cost_value: number; // stock × cost (0 when no cost price)
  retail_value: number; // stock × retail
}

/** What the shelf is worth: per-product stock valued at cost and at retail. */
export async function inventoryValuation(): Promise<{ rows: ValuationRow[]; totalCost: number; totalRetail: number }> {
  const rows = await native.select<ValuationRow>(
    `SELECT name, stock_pieces,
            stock_pieces * COALESCE(cost_price_pesewas, 0) AS cost_value,
            stock_pieces * retail_price_pesewas AS retail_value
       FROM products
      WHERE active = 1 AND stock_pieces > 0
      ORDER BY retail_value DESC`
  );
  let totalCost = 0;
  let totalRetail = 0;
  for (const r of rows) {
    totalCost += r.cost_value;
    totalRetail += r.retail_value;
  }
  return { rows, totalCost, totalRetail };
}

export interface SlowMoverRow {
  name: string;
  stock_pieces: number;
  pieces_sold: number;
  last_sold: string | null;
}

/** Products that barely moved in the range (including zero sales) but hold stock —
 *  the money sleeping on the shelf. */
export async function slowMovers(r: Range, limit = 25): Promise<SlowMoverRow[]> {
  return native.select<SlowMoverRow>(
    `SELECT p.name, p.stock_pieces,
            COALESCE((
              SELECT SUM(si.pieces_deducted) FROM sale_items si
                JOIN sales s ON s.id = si.sale_id
               WHERE si.product_id = p.id AND s.status = 'completed'
                 AND s.created_at >= ? AND s.created_at < ?
            ), 0) AS pieces_sold,
            (SELECT MAX(s.created_at) FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
              WHERE si.product_id = p.id AND s.status = 'completed') AS last_sold
       FROM products p
      WHERE p.active = 1 AND p.stock_pieces > 0
      ORDER BY pieces_sold ASC, p.stock_pieces DESC
      LIMIT ?`,
    [r.from, r.toExclusive, limit]
  );
}

export interface StockAlertRow {
  name: string;
  stock_pieces: number;
  low_stock_threshold: number;
}

/** Low-stock (at or under the reorder level) and out-of-stock lists. */
export async function stockAlerts(): Promise<{ low: StockAlertRow[]; out: StockAlertRow[] }> {
  const rows = await native.select<StockAlertRow>(
    `SELECT name, stock_pieces, low_stock_threshold
       FROM products
      WHERE active = 1 AND stock_pieces <= low_stock_threshold
      ORDER BY stock_pieces ASC, name`
  );
  return {
    low: rows.filter((r) => r.stock_pieces > 0),
    out: rows.filter((r) => r.stock_pieces === 0),
  };
}

export interface VoidedRow {
  receipt_no: string;
  cashier: string;
  voided_by_name: string | null;
  void_reason: string | null;
  total_pesewas: number;
  created_at: string;
}

export async function voidedSales(r: Range): Promise<VoidedRow[]> {
  return native.select<VoidedRow>(
    `SELECT s.receipt_no, u.name AS cashier, vb.name AS voided_by_name,
            s.void_reason, s.total_pesewas, s.created_at
       FROM sales s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN users vb ON vb.id = s.voided_by
      WHERE s.status = 'voided' AND s.created_at >= ? AND s.created_at < ?
      ORDER BY s.seq DESC`,
    [r.from, r.toExclusive]
  );
}

export interface MovementRow {
  product_name: string;
  change_pieces: number;
  reason: string;
  created_at: string;
  user_name: string | null;
}

export async function stockMovements(r: Range, productId?: number): Promise<MovementRow[]> {
  const params: unknown[] = [r.from, r.toExclusive];
  let clause = "m.created_at >= ? AND m.created_at < ?";
  if (productId != null) {
    clause += " AND m.product_id = ?";
    params.push(productId);
  }
  return native.select<MovementRow>(
    `SELECT p.name AS product_name, m.change_pieces, m.reason, m.created_at, u.name AS user_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE ${clause}
      ORDER BY m.id DESC
      LIMIT 500`,
    params
  );
}
