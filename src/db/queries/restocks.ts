import { native } from "@/native";
import { applyStockMovement } from "./movements";

export interface RestockRow {
  id: number;
  restock_no: string;
  restock_date: string;
  product_id: number;
  product_name: string;
  quantity_added: number;
  cost_price_pesewas: number;
  total_cost_pesewas: number;
  units_sold: number;
  revenue_pesewas: number;
  remaining_quantity: number;
  remaining_value_pesewas: number;
  created_by_name: string;
}

export async function createRestock(
  productId: number,
  quantity: number,
  costPricePesewas: number,
  userId: number,
  note?: string
): Promise<number> {
  if (quantity <= 0) throw new Error("Restock quantity must be positive");
  const now = new Date().toISOString();
  await native.execute("BEGIN IMMEDIATE");
  try {
    const sequence = await native.execute("INSERT INTO restocks (restock_no, restock_date, created_by, created_at) VALUES (?, ?, ?, ?)", ["pending", now, userId, now]);
    const id = sequence.lastInsertId!;
    const restockNo = `RESTOCK-${String(id).padStart(3, "0")}`;
    await native.execute("UPDATE restocks SET restock_no = ? WHERE id = ?", [restockNo, id]);
    await native.execute(
      "INSERT INTO restock_items (restock_id, product_id, quantity_added, cost_price_pesewas, total_cost_pesewas) VALUES (?, ?, ?, ?, ?)",
      [id, productId, quantity, costPricePesewas, quantity * costPricePesewas]
    );
    await applyStockMovement({ productId, changePieces: quantity, reason: "restock", restockId: id, userId, note });
    await native.execute("COMMIT");
    return id;
  } catch (error) {
    await native.execute("ROLLBACK");
    throw error;
  }
}

export async function listRestocks(limit = 100): Promise<RestockRow[]> {
  return native.select<RestockRow>(
    `SELECT r.id, r.restock_no, r.restock_date, ri.product_id, p.name AS product_name,
            ri.quantity_added, ri.cost_price_pesewas, ri.total_cost_pesewas,
            COALESCE(SUM(a.quantity), 0) AS units_sold,
            COALESCE(SUM(a.revenue_pesewas), 0) AS revenue_pesewas,
            ri.quantity_added - COALESCE(SUM(a.quantity), 0) AS remaining_quantity,
            (ri.quantity_added - COALESCE(SUM(a.quantity), 0)) * ri.cost_price_pesewas AS remaining_value_pesewas,
            u.name AS created_by_name
       FROM restocks r JOIN restock_items ri ON ri.restock_id = r.id
       JOIN products p ON p.id = ri.product_id JOIN users u ON u.id = r.created_by
       LEFT JOIN sale_restock_allocations a ON a.restock_id = r.id
      GROUP BY r.id, ri.id ORDER BY r.id DESC LIMIT ?`, [limit]
  );
}

/** Allocate a sale against the oldest available restock batches (FIFO). */
export async function allocateSale(
  saleId: number,
  saleItemId: number,
  productId: number,
  quantity: number,
  revenuePesewas: number
): Promise<{ costPesewas: number; profitPesewas: number }> {
  const batches = await native.select<{ restock_id: number; cost_price_pesewas: number; available: number }>(
    `SELECT ri.restock_id, ri.cost_price_pesewas,
            ri.quantity_added - COALESCE(SUM(a.quantity), 0) AS available
       FROM restock_items ri LEFT JOIN sale_restock_allocations a ON a.restock_id = ri.restock_id
      WHERE ri.product_id = ? GROUP BY ri.id ORDER BY ri.restock_id`, [productId]
  );
  let remaining = quantity;
  let costPesewas = 0;
  for (const batch of batches) {
    if (remaining <= 0 || batch.available <= 0) continue;
    const allocated = Math.min(remaining, batch.available);
    const batchCost = allocated * batch.cost_price_pesewas;
    const batchRevenue = Math.round(revenuePesewas * allocated / quantity);
    await native.execute(
      `INSERT INTO sale_restock_allocations
        (sale_id, sale_item_id, restock_id, product_id, quantity, unit_cost_pesewas,
         cost_pesewas, revenue_pesewas, profit_pesewas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, saleItemId, batch.restock_id, productId, allocated, batch.cost_price_pesewas,
        batchCost, batchRevenue, batchRevenue - batchCost]
    );
    costPesewas += batchCost;
    remaining -= allocated;
  }
  return { costPesewas, profitPesewas: revenuePesewas - costPesewas };
}

export interface StockOverview {
  total_added: number;
  initial_value_pesewas: number;
  remaining: number;
  remaining_value_pesewas: number;
  units_sold: number;
  revenue_pesewas: number;
  gross_profit_pesewas: number;
  product_count: number;
}

export interface StockRow {
  id: number;
  name: string;
  sku: string | null;
  category_name: string | null;
  initial_quantity: number;
  current_quantity: number;
  cost_price_pesewas: number;
  selling_price_pesewas: number;
  initial_value_pesewas: number;
  current_value_pesewas: number;
  low_stock_threshold: number;
}

export interface StockMovementHistoryRow {
  id: number;
  created_at: string;
  product_name: string;
  category_name: string | null;
  action: string;
  quantity: number;
  value_pesewas: number;
  user_name: string;
}

export async function stockOverview(): Promise<StockOverview> {
  const [row] = await native.select<StockOverview>(
    `SELECT COALESCE((SELECT SUM(quantity_added) FROM restock_items), 0) AS total_added,
            COALESCE((SELECT SUM(total_cost_pesewas) FROM restock_items), 0) AS initial_value_pesewas,
            COALESCE((SELECT SUM(stock_pieces) FROM products WHERE active = 1), 0) AS remaining,
            COALESCE((SELECT SUM(stock_pieces * COALESCE(cost_price_pesewas, 0)) FROM products WHERE active = 1), 0) AS remaining_value_pesewas,
            COALESCE((SELECT SUM(pieces_deducted) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed'), 0) AS units_sold,
            COALESCE((SELECT SUM(line_total_pesewas) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed'), 0) AS revenue_pesewas,
            COALESCE((SELECT SUM(profit_pesewas) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'completed'), 0) AS gross_profit_pesewas,
            (SELECT COUNT(*) FROM products WHERE active = 1) AS product_count`
  );
  return row;
}

export async function currentStock(): Promise<StockRow[]> {
  return native.select<StockRow>(
    `SELECT p.id, p.name, p.sku, c.name AS category_name,
            COALESCE((SELECT SUM(quantity_added) FROM restock_items ri WHERE ri.product_id = p.id), p.stock_pieces) AS initial_quantity,
            p.stock_pieces AS current_quantity, COALESCE(p.cost_price_pesewas, 0) AS cost_price_pesewas,
            p.retail_price_pesewas AS selling_price_pesewas,
            COALESCE((SELECT SUM(total_cost_pesewas) FROM restock_items ri WHERE ri.product_id = p.id), p.stock_pieces * COALESCE(p.cost_price_pesewas, 0)) AS initial_value_pesewas,
            p.stock_pieces * COALESCE(p.cost_price_pesewas, 0) AS current_value_pesewas,
            p.low_stock_threshold
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1 ORDER BY p.name`
  );
}

export async function stockMovementHistory(limit = 200): Promise<StockMovementHistoryRow[]> {
  return native.select<StockMovementHistoryRow>(
    `SELECT m.id, m.created_at, p.name AS product_name, c.name AS category_name,
            CASE m.reason WHEN 'opening' THEN 'Stock added' WHEN 'restock' THEN 'Restock'
              WHEN 'purchase' THEN 'Stock added' ELSE m.reason END AS action,
            m.change_pieces AS quantity,
            ABS(m.change_pieces) * COALESCE(CASE WHEN m.reason IN ('sale', 'void') THEN
              (SELECT si.unit_price_pesewas FROM sale_items si WHERE si.sale_id = m.reference_id AND si.product_id = m.product_id LIMIT 1)
              ELSE p.cost_price_pesewas END, 0) AS value_pesewas,
            u.name AS user_name
       FROM stock_movements m JOIN products p ON p.id = m.product_id
       LEFT JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC LIMIT ?`, [limit]
  );
}

export async function restockMovements(restockId: number): Promise<StockMovementHistoryRow[]> {
  return native.select<StockMovementHistoryRow>(
    `SELECT m.id, m.created_at, p.name AS product_name, c.name AS category_name,
            CASE m.reason WHEN 'opening' THEN 'Stock added' WHEN 'restock' THEN 'Restock'
              WHEN 'purchase' THEN 'Stock added' ELSE m.reason END AS action,
            m.change_pieces AS quantity,
            ABS(m.change_pieces) * COALESCE(CASE WHEN m.reason IN ('sale', 'void') THEN
              (SELECT si.unit_price_pesewas FROM sale_items si WHERE si.sale_id = m.reference_id AND si.product_id = m.product_id LIMIT 1)
              ELSE p.cost_price_pesewas END, 0) AS value_pesewas,
            u.name AS user_name
       FROM stock_movements m JOIN products p ON p.id = m.product_id
       LEFT JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = m.user_id
      WHERE m.restock_id = ?
      UNION ALL
      SELECT a.id, s.created_at, p.name, c.name, 'sale', -a.quantity,
         a.revenue_pesewas, u.name
        FROM sale_restock_allocations a JOIN sales s ON s.id = a.sale_id
        JOIN products p ON p.id = a.product_id LEFT JOIN categories c ON c.id = p.category_id
        JOIN users u ON u.id = s.user_id
       WHERE a.restock_id = ? AND s.status = 'completed'
      ORDER BY created_at ASC`, [restockId, restockId]
  );
}