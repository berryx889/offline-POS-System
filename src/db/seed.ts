// First-run seed: an admin, a cashier, a few categories and products, and the
// business settings shown on the receipt. Only runs when the users table is empty
// so it never clobbers a real shop's data.

import { native } from "@/native";

// Default PINs for first login. The owner changes these in Settings.
// Admin 6-digit, cashier 4-digit (pos-prd.md §2).
const DEFAULT_ADMIN_PIN = "482913";
const DEFAULT_CASHIER_PIN = "1234";

export async function seedIfEmpty(): Promise<void> {
  const [{ n }] = await native.select<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if (n > 0) return;

  const now = new Date().toISOString();

  const adminHash = await native.hashPin(DEFAULT_ADMIN_PIN);
  const cashierHash = await native.hashPin(DEFAULT_CASHIER_PIN);
  await native.execute(
    "INSERT INTO users (name, role, pin_hash, active, created_at) VALUES (?, 'admin', ?, 1, ?), (?, 'cashier', ?, 1, ?)",
    ["Owner", adminHash, now, "Ama", cashierHash, now]
  );

  const categories = ["Provisions", "Drinks", "Cement", "Roofing", "Hardware"];
  for (const name of categories) {
    await native.execute("INSERT INTO categories (name) VALUES (?)", [name]);
  }

  // name, barcode, category, pieces/box, retail(pc) pesewas, wholesale(box) pesewas, cost(pc), stock pcs, threshold
  const products: [string, string | null, string, number, number, number | null, number | null, number, number][] = [
    ["Voltic 750ml", "6001240100015", "Drinks", 12, 350, 3600, 260, 240, 24],
    ["Sachet Water (bag)", null, "Drinks", 30, 25, 600, 18, 900, 60],
    ["Ideal Milk 160g", "6009510800014", "Provisions", 48, 550, 24000, 430, 320, 48],
    ["Cement 42.5R", "6009880100027", "Cement", 1, 9600, null, 8200, 140, 20],
    ["Roofing Nails 1kg", null, "Roofing", 1, 1850, null, 1400, 75, 15],
    ["Key Soap Bar", "6161100230019", "Provisions", 24, 450, 9600, 360, 500, 48],
  ];
  for (const [name, barcode, cat, ppb, retail, wholesale, cost, stock, threshold] of products) {
    const [{ id }] = await native.select<{ id: number }>(
      "SELECT id FROM categories WHERE name = ?",
      [cat]
    );
    await native.execute(
      `INSERT INTO products
        (name, barcode, category_id, pieces_per_box, retail_price_pesewas,
         wholesale_price_pesewas, cost_price_pesewas, stock_pieces, low_stock_threshold,
         active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [name, barcode, id, ppb, retail, wholesale, cost, stock, threshold, now, now]
    );
  }

  // A variant family (v3): one product ("Milo"), several sellable variants, each
  // with its own barcode, prices, and stock. The 400g tin also demos bulk pricing:
  // 12+ pieces switch to the per-piece wholesale price automatically.
  const [{ id: provisionsId }] = await native.select<{ id: number }>(
    "SELECT id FROM categories WHERE name = 'Provisions'"
  );
  const milo: [string, string | null, number, number, number | null, number | null, number | null, number, number][] =
    // name, barcode, ppb, retail(pc), wholesale(box), bulk(pc), cost(pc), stock, threshold
    [
      ["Milo 20g Sachet", "6034000110016", 100, 150, 13500, 135, 110, 800, 100],
      ["Milo 400g Tin", "6034000110412", 12, 5500, 60000, 5000, 4300, 300, 24],
      ["Milo 800g Tin", "6034000110818", 6, 9800, 56000, 9200, 8100, 48, 12],
    ];
  for (const [name, barcode, ppb, retail, wholesale, bulk, cost, stock, threshold] of milo) {
    await native.execute(
      `INSERT INTO products
        (name, barcode, family, brand, supplier, category_id, pieces_per_box,
         retail_price_pesewas, wholesale_price_pesewas, bulk_price_pesewas, bulk_min_qty,
         cost_price_pesewas, stock_pieces, low_stock_threshold, active, created_at, updated_at)
       VALUES (?, ?, 'Milo', 'Nestlé', 'Obiba Distribution', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [name, barcode, provisionsId, ppb, retail, wholesale, bulk, bulk == null ? null : 12, cost, stock, threshold, now, now]
    );
  }

  const settings: [string, string][] = [
    ["business_name", "K.B. Boabeng Co. Ltd"],
    ["address", "Sunyani, Bono Region"],
    ["phone", "024 000 0000"],
    ["receipt_footer", "Thank you. No refunds after goods leave the shop."],
    ["paper_width", "80"],
    ["printer_name", ""],
    ["cash_drawer_enabled", "0"],
    ["sound_enabled", "1"],
  ];
  for (const [key, value] of settings) {
    await native.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }
}
