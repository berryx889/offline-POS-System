// The one way stock changes (pos-prd.md §5 + v3 §11): update the pieces AND
// record a movement with the stock before/after, who did it, and why. Inventory
// is never "just a number" — the movement ledger explains every value.

import { native } from "@/native";

export type MovementReason =
  | "sale"
  | "void"
  | "restock"
  | "adjustment"
  | "purchase"
  | "return"
  | "damaged"
  | "expired"
  | "transfer"
  | "opening";

export interface MovementInput {
  productId: number;
  /** Positive = stock in, negative = stock out. */
  changePieces: number;
  reason: MovementReason;
  userId: number;
  referenceId?: number | null;
  note?: string | null;
  /** Shared timestamp when the caller writes several rows in one transaction. */
  now?: string;
}

export interface MovementRow {
  id: number;
  reason: MovementReason;
  change_pieces: number;
  prev_pieces: number | null; // null on pre-v3 rows
  new_pieces: number | null;
  note: string | null;
  reference_id: number | null;
  receipt_no: string | null; // when the reference is a sale
  user_name: string;
  created_at: string;
}

/** A product's stock ledger, newest first — every movement with who/why/prev/new. */
export async function listMovements(productId: number, limit = 50): Promise<MovementRow[]> {
  return native.select<MovementRow>(
    `SELECT m.id, m.reason, m.change_pieces, m.prev_pieces, m.new_pieces, m.note,
            m.reference_id, s.receipt_no, u.name AS user_name, m.created_at
       FROM stock_movements m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN sales s ON s.id = m.reference_id AND m.reason IN ('sale', 'void')
      WHERE m.product_id = ?
      ORDER BY m.id DESC
      LIMIT ?`,
    [productId, limit]
  );
}

/** Apply a stock change and record it with prev/new stock.
 *  MUST be called inside an open transaction — it does not begin/commit its own. */
export async function applyStockMovement(input: MovementInput): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const [row] = await native.select<{ stock_pieces: number }>(
    "SELECT stock_pieces FROM products WHERE id = ?",
    [input.productId]
  );
  if (!row) throw new Error(`Product #${input.productId} not found`);
  const prev = row.stock_pieces;
  const next = prev + input.changePieces;

  await native.execute(
    "UPDATE products SET stock_pieces = ?, updated_at = ? WHERE id = ?",
    [next, now, input.productId]
  );
  await native.execute(
    `INSERT INTO stock_movements
      (product_id, change_pieces, reason, reference_id, note, prev_pieces, new_pieces,
       user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.productId,
      input.changePieces,
      input.reason,
      input.referenceId ?? null,
      input.note ?? null,
      prev,
      next,
      input.userId,
      now,
    ]
  );
}
