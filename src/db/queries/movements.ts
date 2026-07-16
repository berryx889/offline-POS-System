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
