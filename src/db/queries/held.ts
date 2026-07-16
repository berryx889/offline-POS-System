// Held sales (v3 §10): park the current cart so the counter can serve the next
// customer, then resume it later. The whole cart state is stored as JSON — prices
// stay as they were when held; stock is validated at charge time as always.

import { native } from "@/native";
import { lineTotal, type CartLine } from "@/store/cartStore";

export interface HeldCart {
  lines: CartLine[];
  discountPesewas: number;
  wholesaleMode: boolean;
}

export interface HeldSaleRow {
  id: number;
  label: string | null;
  user_name: string;
  created_at: string;
  itemCount: number;
  totalPesewas: number;
}

export async function holdSale(
  cart: HeldCart,
  label: string,
  userId: number
): Promise<void> {
  await native.execute(
    "INSERT INTO held_sales (label, cart_json, user_id, created_at) VALUES (?, ?, ?, ?)",
    [label.trim() || null, JSON.stringify(cart), userId, new Date().toISOString()]
  );
}

export async function listHeld(): Promise<HeldSaleRow[]> {
  const rows = await native.select<{
    id: number;
    label: string | null;
    cart_json: string;
    user_name: string;
    created_at: string;
  }>(
    `SELECT h.id, h.label, h.cart_json, u.name AS user_name, h.created_at
       FROM held_sales h JOIN users u ON u.id = h.user_id
      ORDER BY h.id DESC`
  );
  return rows.map((r) => {
    let itemCount = 0;
    let totalPesewas = 0;
    try {
      const cart = JSON.parse(r.cart_json) as HeldCart;
      for (const l of cart.lines) {
        itemCount += l.qty;
        totalPesewas += lineTotal(l);
      }
      totalPesewas = Math.max(0, totalPesewas - cart.discountPesewas);
    } catch {
      /* unreadable cart still shows in the list so it can be discarded */
    }
    return { id: r.id, label: r.label, user_name: r.user_name, created_at: r.created_at, itemCount, totalPesewas };
  });
}

/** Load a held cart and remove it from the shelf (it's now live again). */
export async function takeHeld(id: number): Promise<HeldCart | null> {
  const [row] = await native.select<{ cart_json: string }>(
    "SELECT cart_json FROM held_sales WHERE id = ?",
    [id]
  );
  if (!row) return null;
  await native.execute("DELETE FROM held_sales WHERE id = ?", [id]);
  try {
    return JSON.parse(row.cart_json) as HeldCart;
  } catch {
    return null;
  }
}

export async function discardHeld(id: number): Promise<void> {
  await native.execute("DELETE FROM held_sales WHERE id = ?", [id]);
}
