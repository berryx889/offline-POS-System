// Custom selling units (v3 §8): "Half Tray", "Crate", "5kg"… Each unit deducts
// `pieces` from stock and sells at its own price — never computed from another
// price. PC/BOX stay on the product row; these are the extras.

import { native } from "@/native";
import { logAudit } from "./audit";

export interface SellingUnit {
  id: number;
  name: string;
  pieces: number;
  price_pesewas: number;
}

export async function listUnits(productId: number): Promise<SellingUnit[]> {
  return native.select<SellingUnit>(
    "SELECT id, name, pieces, price_pesewas FROM selling_units WHERE product_id = ? ORDER BY sort, id",
    [productId]
  );
}

export interface SellingUnitInput {
  name: string;
  pieces: number;
  price_pesewas: number;
}

/** Replace a product's custom units (the drawer edits them as a set). Unit price
 *  changes are price changes, so the diff lands in the audit log. */
export async function saveUnits(
  productId: number,
  units: SellingUnitInput[],
  userId: number
): Promise<void> {
  const before = await listUnits(productId);
  await native.execute("BEGIN IMMEDIATE");
  try {
    await native.execute("DELETE FROM selling_units WHERE product_id = ?", [productId]);
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      await native.execute(
        "INSERT INTO selling_units (product_id, name, pieces, price_pesewas, sort) VALUES (?, ?, ?, ?, ?)",
        [productId, u.name, u.pieces, u.price_pesewas, i]
      );
    }
    await native.execute("COMMIT");
  } catch (e) {
    await native.execute("ROLLBACK");
    throw e;
  }

  const summarize = (xs: SellingUnitInput[]) =>
    xs.map((u) => `${u.name}:${u.pieces}pc@${u.price_pesewas}`).join(",");
  if (summarize(before) !== summarize(units)) {
    await logAudit(userId, "selling_units_change", {
      product_id: productId,
      before: summarize(before),
      after: summarize(units),
    });
  }
}
