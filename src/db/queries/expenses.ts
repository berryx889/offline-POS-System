// Operating expenses (v4) — the missing half of a real net margin. Revenue
// and gross profit already come from sales; this is rent, wages, utilities,
// etc. entered by hand (there's no accounting-system integration to pull them
// from automatically).

import { native } from "@/native";
import { logAudit } from "./audit";
import type { Range } from "./reports";

export interface Expense {
  id: number;
  category: string;
  amount_pesewas: number;
  note: string | null;
  created_at: string;
}

export async function listExpenses(r: Range, limit = 100): Promise<Expense[]> {
  return native.select<Expense>(
    `SELECT id, category, amount_pesewas, note, created_at
       FROM expenses
      WHERE created_at >= ? AND created_at < ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [r.from, r.toExclusive, limit]
  );
}

export async function totalExpenses(r: Range): Promise<number> {
  const [row] = await native.select<{ total: number }>(
    "SELECT COALESCE(SUM(amount_pesewas), 0) AS total FROM expenses WHERE created_at >= ? AND created_at < ?",
    [r.from, r.toExclusive]
  );
  return row.total;
}

export async function addExpense(
  category: string,
  amountPesewas: number,
  note: string | null,
  userId: number
): Promise<void> {
  if (amountPesewas <= 0) throw new Error("Amount must be positive.");
  await native.execute(
    "INSERT INTO expenses (category, amount_pesewas, note, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    [category.trim(), amountPesewas, note?.trim() || null, userId, new Date().toISOString()]
  );
  await logAudit(userId, "expense_add", { category, amount_pesewas: amountPesewas });
}
