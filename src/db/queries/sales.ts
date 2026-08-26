import { allocateSale } from "./restocks";
// The sale transaction — the app's most important write (pos-prd.md §4, §5, §7).
// A sale commits as ONE transaction: the sale row + line items + stock decrements +
// stock movements. A power cut leaves the DB with either a whole sale or none.
//
// Snapshots: product_name and unit_price are copied onto sale_items so later
// renames/price changes never alter old receipts. Money is pesewas throughout.

import { native } from "@/native";
import { unitPrice, lineTotal, linePieces, type CartLine } from "@/store/cartStore";
import { applyStockMovement } from "./movements";
import { getCurrentBranchId } from "./branches";
import { enqueueChange } from "@/sync/queue";
import { syncNow } from "@/sync/service";

export type PaymentMethod = "cash" | "momo" | "split" | "credit";

export interface PaymentInput {
  method: PaymentMethod;
  amountPaidPesewas: number; // cash tendered (cash), total (momo/split), or 0 (credit)
  cashPartPesewas?: number;
  momoPartPesewas?: number;
  momoReference?: string;
}

export interface CommitSaleInput {
  userId: number;
  lines: CartLine[];
  payment: PaymentInput;
  discountPesewas?: number;
  /** Tax rate in percent (v3 §10, from settings). Tax is computed here, added on
   *  top of (subtotal − discount), and stored on the sale. */
  taxRatePercent?: number;
  /** Optional cashier note printed on the receipt. */
  note?: string;
  /** Required for credit sales — who owes the balance. */
  customerId?: number;
}

export interface CommittedSale {
  saleId: number;
  receiptNo: string;
  totalPesewas: number;
  changePesewas: number;
}

/** Raised when stock (in pieces) can't cover the cart. The UI turns this into the
 *  "Only X available" message; admin override comes in a later phase. */
export class InsufficientStockError extends Error {
  constructor(public readonly shortfalls: { name: string; available: number; needed: number }[]) {
    super("Insufficient stock");
    this.name = "InsufficientStockError";
  }
}

function pad(n: number): string {
  return `R-${String(n).padStart(6, "0")}`;
}

// ---- Reads (reprints, previews, dashboard) --------------------------------

export interface SaleRow {
  id: number;
  receipt_no: string;
  user_id: number;
  cashier_name: string;
  subtotal_pesewas: number;
  discount_pesewas: number;
  total_pesewas: number;
  amount_paid_pesewas: number;
  change_pesewas: number;
  payment_method: PaymentMethod;
  cash_part_pesewas: number;
  momo_part_pesewas: number;
  momo_reference: string | null;
  credit_pesewas: number;
  customer_id: number | null;
  customer_name: string | null;
  tax_pesewas: number;
  note: string | null;
  status: "completed" | "voided";
  created_at: string;
}

export interface SaleItemRow {
  product_name: string;
  unit: string; // 'piece', 'box', or a custom selling-unit name (snapshot)
  qty: number;
  unit_price_pesewas: number;
  line_total_pesewas: number;
}

export interface SaleDetail {
  sale: SaleRow;
  items: SaleItemRow[];
}

const SELECT_SALE = `
  SELECT s.id, s.receipt_no, s.user_id, u.name AS cashier_name, s.subtotal_pesewas,
         s.discount_pesewas, s.total_pesewas, s.amount_paid_pesewas, s.change_pesewas,
         s.payment_method, s.cash_part_pesewas, s.momo_part_pesewas, s.momo_reference,
         s.credit_pesewas, s.customer_id, cu.name AS customer_name,
         s.tax_pesewas, s.note, s.status, s.created_at
    FROM sales s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN customers cu ON cu.id = s.customer_id`;

export async function getSaleDetail(saleId: number): Promise<SaleDetail | null> {
  const [sale] = await native.select<SaleRow>(`${SELECT_SALE} WHERE s.id = ?`, [saleId]);
  if (!sale) return null;
  const items = await native.select<SaleItemRow>(
    `SELECT product_name, unit, qty, unit_price_pesewas, line_total_pesewas
       FROM sale_items WHERE sale_id = ? ORDER BY id`,
    [saleId]
  );
  return { sale, items };
}

export interface SalesFilter {
  text?: string; // matches receipt_no, cashier, or a product on the sale
  from?: string; // ISO date (inclusive)
  to?: string; // ISO date (inclusive)
  limit?: number;
}

export async function listSales(filter: SalesFilter = {}): Promise<SaleRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.text && filter.text.trim()) {
    const q = `%${filter.text.trim()}%`;
    where.push(
      `(s.receipt_no LIKE ? OR u.name LIKE ? OR EXISTS (
          SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_name LIKE ?))`
    );
    params.push(q, q, q);
  }
  if (filter.from) {
    where.push("s.created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("s.created_at <= ?");
    params.push(filter.to);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(filter.limit ?? 100);
  return native.select<SaleRow>(
    `${SELECT_SALE} ${clause} ORDER BY s.seq DESC LIMIT ?`,
    params
  );
}

/** Void a completed sale (manager-override; pos-prd.md §2, §7). Restores stock in
 *  one transaction: flips status, writes +stock movements, bumps stock back, and
 *  audits it. voidedBy is the admin who authorized it. */
export async function voidSale(
  saleId: number,
  voidedBy: number,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  await native.execute("BEGIN IMMEDIATE");
  try {
    const [sale] = await native.select<{ status: string; receipt_no: string }>(
      "SELECT status, receipt_no FROM sales WHERE id = ?",
      [saleId]
    );
    if (!sale) throw new Error("Sale not found");
    if (sale.status !== "completed") throw new Error("Sale is already voided");

    const items = await native.select<{ product_id: number; pieces_deducted: number }>(
      "SELECT product_id, pieces_deducted FROM sale_items WHERE sale_id = ?",
      [saleId]
    );
    for (const it of items) {
      await applyStockMovement({
        productId: it.product_id,
        changePieces: it.pieces_deducted,
        reason: "void",
        referenceId: saleId,
        userId: voidedBy,
        now,
      });
    }
    // Reverse any credit charge this sale put on a customer's account.
    await native.execute(
      "DELETE FROM customer_ledger WHERE sale_id = ? AND kind = 'charge'",
      [saleId]
    );
    await native.execute(
      "UPDATE sales SET status = 'voided', voided_by = ?, void_reason = ? WHERE id = ?",
      [voidedBy, reason, saleId]
    );
    await native.execute(
      "INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (?, 'void', ?, ?)",
      [voidedBy, JSON.stringify({ sale_id: saleId, receipt_no: sale.receipt_no, reason }), now]
    );
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}

/** The most recent completed sale — for F9 "reprint last". */
export async function getLastSale(): Promise<SaleDetail | null> {
  const [row] = await native.select<{ id: number }>(
    "SELECT id FROM sales WHERE status = 'completed' ORDER BY seq DESC LIMIT 1"
  );
  return row ? getSaleDetail(row.id) : null;
}

async function nextSequence(name: string): Promise<number> {
  await native.execute("UPDATE sequences SET value = value + 1 WHERE name = ?", [name]);
  const rows = await native.select<{ value: number }>(
    "SELECT value FROM sequences WHERE name = ?",
    [name]
  );
  return rows[0].value;
}

export async function commitSale(input: CommitSaleInput): Promise<CommittedSale> {
  const { userId, lines, payment } = input;
  if (lines.length === 0) throw new Error("Cannot commit an empty sale");

  // Compute totals server-side rather than trusting the UI.
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const discount = input.discountPesewas ?? 0;
  const tax = Math.round(Math.max(0, subtotal - discount) * ((input.taxRatePercent ?? 0) / 100));
  const total = subtotal - discount + tax;
  const change =
    payment.method === "cash" ? Math.max(0, payment.amountPaidPesewas - total) : 0;
  // Credit: the unpaid portion charged to the customer's account.
  const credit = payment.method === "credit" ? Math.max(0, total - payment.amountPaidPesewas) : 0;
  if (payment.method === "credit" && input.customerId == null) {
    throw new Error("A credit sale needs a customer");
  }
  const now = new Date().toISOString();
  const branchId = await getCurrentBranchId();

  // Pieces needed per product (a customer may have box + loose lines of one item).
  const need = new Map<number, number>();
  for (const l of lines) {
    need.set(l.productId, (need.get(l.productId) ?? 0) + linePieces(l));
  }

  await native.execute("BEGIN IMMEDIATE");
  try {
    // Validate stock in pieces at charge time, reading current values inside the txn.
    const shortfalls: { name: string; available: number; needed: number }[] = [];
    for (const [productId, needed] of need) {
      const [row] = await native.select<{ name: string; stock_pieces: number }>(
        "SELECT name, stock_pieces FROM products WHERE id = ?",
        [productId]
      );
      if (!row || row.stock_pieces < needed) {
        shortfalls.push({
          name: row?.name ?? `#${productId}`,
          available: row?.stock_pieces ?? 0,
          needed,
        });
      }
    }
    if (shortfalls.length > 0) throw new InsufficientStockError(shortfalls);

    const receiptSeq = await nextSequence("receipt");
    const saleSeq = await nextSequence("sale_seq");
    const receiptNo = pad(receiptSeq);

    const res = await native.execute(
      `INSERT INTO sales
        (receipt_no, user_id, subtotal_pesewas, discount_pesewas, total_pesewas,
         amount_paid_pesewas, change_pesewas, payment_method, cash_part_pesewas,
         momo_part_pesewas, momo_reference, status, seq, created_at,
         customer_id, credit_pesewas, tax_pesewas, note, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNo,
        userId,
        subtotal,
        discount,
        total,
        payment.amountPaidPesewas,
        change,
        payment.method,
        payment.cashPartPesewas ?? (payment.method === "cash" ? payment.amountPaidPesewas : 0),
        payment.momoPartPesewas ?? 0,
        payment.momoReference ?? null,
        saleSeq,
        now,
        input.customerId ?? null,
        credit,
        tax,
        input.note?.trim() || null,
        branchId,
      ]
    );
    const saleId = res.lastInsertId!;

    // Credit sale → charge the customer's ledger inside the same transaction.
    if (credit > 0) {
      await native.execute(
        `INSERT INTO customer_ledger (customer_id, kind, amount_pesewas, sale_id, user_id, created_at)
         VALUES (?, 'charge', ?, ?, ?, ?)`,
        [input.customerId, credit, saleId, userId, now]
      );
    }

    for (const l of lines) {
      const pieces = linePieces(l);
      const itemResult = await native.execute(
        `INSERT INTO sale_items
          (sale_id, product_id, product_name, unit, qty, unit_price_pesewas,
           line_total_pesewas, pieces_deducted, cost_price_pesewas, profit_pesewas)
         SELECT ?, p.id, ?, ?, ?, ?, ?, ?, COALESCE(p.cost_price_pesewas, 0), ? - COALESCE(p.cost_price_pesewas, 0) * ?
           FROM products p WHERE p.id = ?`,
        [saleId, l.name, l.unit, l.qty, unitPrice(l), lineTotal(l), pieces,
          lineTotal(l), pieces, l.productId]
      );
      const allocation = await allocateSale(saleId, itemResult.lastInsertId!, l.productId, pieces, lineTotal(l));
      await native.execute("UPDATE sale_items SET cost_price_pesewas = ?, profit_pesewas = ? WHERE id = ?", [
        allocation.costPesewas, allocation.profitPesewas, itemResult.lastInsertId,
      ]);
      await applyStockMovement({
        productId: l.productId,
        changePieces: -pieces,
        reason: "sale",
        referenceId: saleId,
        userId,
        now,
      });
    }

    await native.execute("COMMIT");

    // Queue this sale for a future cloud sync (see src/sync/ -- no backend
    // exists yet, so this only records the change locally and syncNow() is a
    // no-op until sync_endpoint_url is configured). Never blocks or fails the
    // sale: a queue-write problem here shouldn't undo an already-committed sale.
    try {
      await enqueueChange("sale", saleId, "insert", { receiptNo, totalPesewas: total });
      void syncNow();
    } catch {
      /* best-effort */
    }

    return { saleId, receiptNo, totalPesewas: total, changePesewas: change };
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}
