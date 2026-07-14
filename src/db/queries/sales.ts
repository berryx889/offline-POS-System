// The sale transaction — the app's most important write (pos-prd.md §4, §5, §7).
// A sale commits as ONE transaction: the sale row + line items + stock decrements +
// stock movements. A power cut leaves the DB with either a whole sale or none.
//
// Snapshots: product_name and unit_price are copied onto sale_items so later
// renames/price changes never alter old receipts. Money is pesewas throughout.

import { native } from "@/native";
import { piecesForUnit } from "@/stock";
import { unitPrice, lineTotal, type CartLine } from "@/store/cartStore";

export type PaymentMethod = "cash" | "momo" | "split";

export interface PaymentInput {
  method: PaymentMethod;
  amountPaidPesewas: number; // cash tendered (cash) or total (momo/split)
  cashPartPesewas?: number;
  momoPartPesewas?: number;
  momoReference?: string;
}

export interface CommitSaleInput {
  userId: number;
  lines: CartLine[];
  payment: PaymentInput;
  discountPesewas?: number;
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
  const total = subtotal - discount;
  const change =
    payment.method === "cash" ? Math.max(0, payment.amountPaidPesewas - total) : 0;
  const now = new Date().toISOString();

  // Pieces needed per product (a customer may have box + loose lines of one item).
  const need = new Map<number, number>();
  for (const l of lines) {
    const pieces = piecesForUnit(l.qty, l.unit, l.piecesPerBox);
    need.set(l.productId, (need.get(l.productId) ?? 0) + pieces);
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
         momo_part_pesewas, momo_reference, status, seq, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
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
      ]
    );
    const saleId = res.lastInsertId!;

    for (const l of lines) {
      const pieces = piecesForUnit(l.qty, l.unit, l.piecesPerBox);
      await native.execute(
        `INSERT INTO sale_items
          (sale_id, product_id, product_name, unit, qty, unit_price_pesewas,
           line_total_pesewas, pieces_deducted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, l.productId, l.name, l.unit, l.qty, unitPrice(l), lineTotal(l), pieces]
      );
      await native.execute(
        "UPDATE products SET stock_pieces = stock_pieces - ?, updated_at = ? WHERE id = ?",
        [pieces, now, l.productId]
      );
      await native.execute(
        `INSERT INTO stock_movements
          (product_id, change_pieces, reason, reference_id, user_id, created_at)
         VALUES (?, ?, 'sale', ?, ?, ?)`,
        [l.productId, -pieces, saleId, userId, now]
      );
    }

    await native.execute("COMMIT");
    return { saleId, receiptNo, totalPesewas: total, changePesewas: change };
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }
}
