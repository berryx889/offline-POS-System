// Customers & credit (pos-prd.md §1 "add in v2"). A customer's balance owed is the
// running total of 'charge' ledger rows (credit given at sale time) minus 'payment'
// rows (repayments). Money is pesewas.

import { native } from "@/native";

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  note: string | null;
  credit_limit_pesewas: number | null;
  active: number;
  balance_pesewas: number; // computed: charges − payments
}

const SELECT_CUSTOMER = `
  SELECT c.id, c.name, c.phone, c.note, c.credit_limit_pesewas, c.active,
         COALESCE((
           SELECT SUM(CASE l.kind WHEN 'charge' THEN l.amount_pesewas ELSE -l.amount_pesewas END)
             FROM customer_ledger l WHERE l.customer_id = c.id
         ), 0) AS balance_pesewas
    FROM customers c`;

export async function listCustomers(includeInactive = false): Promise<Customer[]> {
  const where = includeInactive ? "" : "WHERE c.active = 1";
  return native.select<Customer>(`${SELECT_CUSTOMER} ${where} ORDER BY c.name`);
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const rows = await native.select<Customer>(`${SELECT_CUSTOMER} WHERE c.id = ?`, [id]);
  return rows[0] ?? null;
}

export interface CustomerInput {
  name: string;
  phone: string | null;
  note: string | null;
  credit_limit_pesewas: number | null;
}

export async function createCustomer(input: CustomerInput): Promise<number> {
  const res = await native.execute(
    "INSERT INTO customers (name, phone, note, credit_limit_pesewas, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    [input.name.trim(), input.phone, input.note, input.credit_limit_pesewas, new Date().toISOString()]
  );
  return res.lastInsertId!;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<void> {
  await native.execute(
    "UPDATE customers SET name = ?, phone = ?, note = ?, credit_limit_pesewas = ? WHERE id = ?",
    [input.name.trim(), input.phone, input.note, input.credit_limit_pesewas, id]
  );
}

export async function setCustomerActive(id: number, active: boolean): Promise<void> {
  await native.execute("UPDATE customers SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
}

export interface LedgerEntry {
  id: number;
  kind: "charge" | "payment";
  amount_pesewas: number;
  sale_id: number | null;
  receipt_no: string | null;
  method: string | null;
  note: string | null;
  created_at: string;
}

/** A customer's statement: charges and payments, newest first, with a receipt no
 *  for charges. */
export async function customerLedger(customerId: number): Promise<LedgerEntry[]> {
  return native.select<LedgerEntry>(
    `SELECT l.id, l.kind, l.amount_pesewas, l.sale_id, s.receipt_no, l.method, l.note, l.created_at
       FROM customer_ledger l
       LEFT JOIN sales s ON s.id = l.sale_id
      WHERE l.customer_id = ?
      ORDER BY l.id DESC`,
    [customerId]
  );
}

/** Record a repayment against a customer's balance. */
export async function recordPayment(
  customerId: number,
  amountPesewas: number,
  method: "cash" | "momo",
  userId: number,
  note?: string
): Promise<void> {
  await native.execute(
    `INSERT INTO customer_ledger (customer_id, kind, amount_pesewas, method, note, user_id, created_at)
     VALUES (?, 'payment', ?, ?, ?, ?, ?)`,
    [customerId, amountPesewas, method, note ?? null, userId, new Date().toISOString()]
  );
}

export async function totalOutstanding(): Promise<number> {
  const [row] = await native.select<{ total: number }>(
    `SELECT COALESCE(SUM(CASE kind WHEN 'charge' THEN amount_pesewas ELSE -amount_pesewas END), 0) AS total
       FROM customer_ledger`
  );
  return row.total;
}
