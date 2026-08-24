// Stock transfers between branches (v4). Never a manual stock edit — its own
// workflow: request → manager approval → received, with a full audit trail.
//
// Schema note / known limitation: a product row belongs to exactly one branch
// (products.barcode is globally UNIQUE — see schema.sql — so the same SKU
// can't have independent rows, and independent stock counts, at two branches
// simultaneously). completeTransfer() below therefore models a transfer as a
// full relocation: the product's remaining stock and branch_id both move to
// the destination branch. That's correct for the common small-shop case
// (moving stock to open or restock another branch) but not a true split where
// the same SKU stays independently stocked at both branches afterwards — that
// would need loosening the barcode constraint to (barcode, branch_id), a
// bigger schema change than this pass covers.

import { native } from "@/native";
import { logAudit } from "./audit";
import { applyStockMovement } from "./movements";

export type TransferStatus = "pending" | "approved" | "rejected" | "completed";

export interface StockTransfer {
  id: number;
  transfer_no: string;
  product_id: number;
  product_name: string;
  from_branch_id: number;
  from_branch_name: string;
  to_branch_id: number;
  to_branch_name: string;
  qty_pieces: number;
  reason: string | null;
  status: TransferStatus;
  requested_by: number;
  requested_by_name: string;
  approved_by: number | null;
  received_by: number | null;
  rejected_reason: string | null;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
}

function transferNo(id: number): string {
  return `TR-${String(id).padStart(6, "0")}`;
}

export async function listTransfers(limit = 100): Promise<StockTransfer[]> {
  return native.select<StockTransfer>(
    `SELECT t.*, p.name AS product_name, fb.name AS from_branch_name, tb.name AS to_branch_name,
            ru.name AS requested_by_name
       FROM stock_transfers t
       JOIN products p ON p.id = t.product_id
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id
       JOIN users ru ON ru.id = t.requested_by
      ORDER BY t.id DESC
      LIMIT ?`,
    [limit]
  );
}

export async function requestTransfer(
  productId: number,
  fromBranchId: number,
  toBranchId: number,
  qtyPieces: number,
  reason: string,
  requestedBy: number
): Promise<number> {
  if (fromBranchId === toBranchId) throw new Error("Source and destination branch must differ.");
  if (qtyPieces <= 0) throw new Error("Quantity must be positive.");
  const now = new Date().toISOString();
  const res = await native.execute(
    `INSERT INTO stock_transfers
      (transfer_no, product_id, from_branch_id, to_branch_id, qty_pieces, reason, status,
       requested_by, created_at)
     VALUES ('', ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [productId, fromBranchId, toBranchId, qtyPieces, reason || null, requestedBy, now]
  );
  const id = res.lastInsertId!;
  await native.execute("UPDATE stock_transfers SET transfer_no = ? WHERE id = ?", [
    transferNo(id),
    id,
  ]);
  await logAudit(requestedBy, "stock_transfer_request", {
    transfer_id: id,
    product_id: productId,
    qty_pieces: qtyPieces,
  });
  return id;
}

/** Approve: takes the stock out of the source branch's count immediately (it's
 *  now "in transit"), leaving completeTransfer() to add it back at the
 *  destination once received. */
export async function approveTransfer(transferId: number, approverId: number): Promise<void> {
  await native.execute("BEGIN IMMEDIATE");
  try {
    const [t] = await native.select<{ product_id: number; qty_pieces: number; status: string }>(
      "SELECT product_id, qty_pieces, status FROM stock_transfers WHERE id = ?",
      [transferId]
    );
    if (!t) throw new Error("Transfer not found.");
    if (t.status !== "pending") throw new Error("Transfer is not pending.");
    const [p] = await native.select<{ stock_pieces: number }>(
      "SELECT stock_pieces FROM products WHERE id = ?",
      [t.product_id]
    );
    if (!p || p.stock_pieces < t.qty_pieces) {
      throw new Error("Not enough stock at the source branch to approve this transfer.");
    }

    await applyStockMovement({
      productId: t.product_id,
      changePieces: -t.qty_pieces,
      reason: "transfer",
      referenceId: transferId,
      userId: approverId,
      note: `Transfer ${transferNo(transferId)} approved — in transit`,
    });
    await native.execute(
      "UPDATE stock_transfers SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?",
      [approverId, new Date().toISOString(), transferId]
    );
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await logAudit(approverId, "stock_transfer_approve", { transfer_id: transferId });
}

export async function rejectTransfer(
  transferId: number,
  approverId: number,
  reason: string
): Promise<void> {
  await native.execute(
    `UPDATE stock_transfers SET status = 'rejected', approved_by = ?, rejected_reason = ?, approved_at = ?
       WHERE id = ? AND status = 'pending'`,
    [approverId, reason, new Date().toISOString(), transferId]
  );
  await logAudit(approverId, "stock_transfer_reject", { transfer_id: transferId, reason });
}

/** Mark received at the destination branch — see the file-level note on why
 *  this reassigns the product's branch_id rather than crediting a separate
 *  destination-branch row. */
export async function completeTransfer(transferId: number, receiverId: number): Promise<void> {
  await native.execute("BEGIN IMMEDIATE");
  try {
    const [t] = await native.select<{
      product_id: number;
      qty_pieces: number;
      status: string;
      to_branch_id: number;
    }>("SELECT product_id, qty_pieces, status, to_branch_id FROM stock_transfers WHERE id = ?", [
      transferId,
    ]);
    if (!t) throw new Error("Transfer not found.");
    if (t.status !== "approved") throw new Error("Transfer must be approved before it can be received.");

    await applyStockMovement({
      productId: t.product_id,
      changePieces: t.qty_pieces,
      reason: "transfer",
      referenceId: transferId,
      userId: receiverId,
      note: `Transfer ${transferNo(transferId)} received`,
    });
    await native.execute("UPDATE products SET branch_id = ? WHERE id = ?", [
      t.to_branch_id,
      t.product_id,
    ]);
    await native.execute(
      "UPDATE stock_transfers SET status = 'completed', received_by = ?, completed_at = ? WHERE id = ?",
      [receiverId, new Date().toISOString(), transferId]
    );
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
  await logAudit(receiverId, "stock_transfer_complete", { transfer_id: transferId });
}
