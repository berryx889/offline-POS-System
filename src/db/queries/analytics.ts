// Dashboard analytics (pos-prd.md §6.4). All "today" figures use the local
// start-of-day. Only completed sales count. Gross profit = revenue − cost of the
// pieces actually sold (cost is per piece; a box sold cost pieces_per_box × cost).

import { native } from "@/native";
import { todayStartISO, lastWeekSameDayRange } from "@/lib/dates";
import type { Product } from "./products";

export interface TodaySummary {
  revenue: number;
  salesCount: number;
  itemsSold: number;
  grossProfit: number;
}

export async function todaySummary(): Promise<TodaySummary> {
  const from = todayStartISO();
  const [head] = await native.select<{ revenue: number; salesCount: number }>(
    `SELECT COALESCE(SUM(total_pesewas), 0) AS revenue, COUNT(*) AS salesCount
       FROM sales WHERE status = 'completed' AND created_at >= ?`,
    [from]
  );
  const [items] = await native.select<{ itemsSold: number; profit: number }>(
    `SELECT COALESCE(SUM(si.qty), 0) AS itemsSold,
            COALESCE(SUM(si.line_total_pesewas - si.pieces_deducted * COALESCE(p.cost_price_pesewas, 0)), 0) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
      WHERE s.status = 'completed' AND s.created_at >= ?`,
    [from]
  );
  return {
    revenue: head.revenue,
    salesCount: head.salesCount,
    itemsSold: items.itemsSold,
    grossProfit: items.profit,
  };
}

export interface CashPosition {
  expectedCash: number; // what should physically be in the drawer
  momoTotal: number;
}

export async function cashPositionToday(): Promise<CashPosition> {
  const from = todayStartISO();
  const [row] = await native.select<CashPosition>(
    `SELECT
        COALESCE(SUM(CASE payment_method
          WHEN 'cash'  THEN amount_paid_pesewas - change_pesewas
          WHEN 'split' THEN cash_part_pesewas
          ELSE 0 END), 0) AS expectedCash,
        COALESCE(SUM(CASE payment_method
          WHEN 'momo'  THEN total_pesewas
          WHEN 'split' THEN momo_part_pesewas
          ELSE 0 END), 0) AS momoTotal
       FROM sales WHERE status = 'completed' AND created_at >= ?`,
    [from]
  );
  return row;
}

export interface TopProduct {
  product_name: string;
  qty: number;
  revenue: number;
}

export async function topProductsToday(limit = 10): Promise<TopProduct[]> {
  const from = todayStartISO();
  return native.select<TopProduct>(
    `SELECT si.product_name,
            SUM(si.qty) AS qty,
            SUM(si.line_total_pesewas) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed' AND s.created_at >= ?
      GROUP BY si.product_name
      ORDER BY revenue DESC
      LIMIT ?`,
    [from, limit]
  );
}

export async function lowStockProducts(): Promise<Product[]> {
  return native.select<Product>(
    `SELECT p.id, p.name, p.barcode, p.category_id, c.name AS category_name, p.pieces_per_box,
            p.retail_price_pesewas, p.wholesale_price_pesewas, p.cost_price_pesewas,
            p.stock_pieces, p.low_stock_threshold, p.active
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1 AND p.stock_pieces <= p.low_stock_threshold
      ORDER BY (p.stock_pieces * 1.0 / NULLIF(p.low_stock_threshold, 0)) ASC, p.name`
  );
}

export interface HourBucket {
  hour: number; // 7..21
  today: number;
  lastWeek: number;
}

/** Revenue per hour from 7am to 9pm, today vs the same weekday last week (ghost).
 *  Bucketed in JS using LOCAL hours because created_at is stored in UTC. */
export async function hourlyRevenue(): Promise<HourBucket[]> {
  const from = todayStartISO();
  const lastWeek = lastWeekSameDayRange();
  const todayRows = await native.select<{ created_at: string; total_pesewas: number }>(
    "SELECT created_at, total_pesewas FROM sales WHERE status = 'completed' AND created_at >= ?",
    [from]
  );
  const lastWeekRows = await native.select<{ created_at: string; total_pesewas: number }>(
    "SELECT created_at, total_pesewas FROM sales WHERE status = 'completed' AND created_at >= ? AND created_at < ?",
    [lastWeek.from, lastWeek.to]
  );

  const buckets: HourBucket[] = [];
  for (let h = 7; h <= 21; h++) buckets.push({ hour: h, today: 0, lastWeek: 0 });
  const idx = (h: number) => h - 7;
  const add = (rows: { created_at: string; total_pesewas: number }[], key: "today" | "lastWeek") => {
    for (const r of rows) {
      const h = new Date(r.created_at).getHours();
      if (h >= 7 && h <= 21) buckets[idx(h)][key] += r.total_pesewas;
    }
  };
  add(todayRows, "today");
  add(lastWeekRows, "lastWeek");
  return buckets;
}
