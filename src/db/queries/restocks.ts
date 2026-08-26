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