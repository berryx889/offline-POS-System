import { native } from "@/native";
import { createProduct, listProductsManage, recordStockChange, type ProductInput } from "@/db/queries/products";

const FORMAT = "countertop-stock-v1";

interface StockProduct {
  name: string;
  barcode: string | null;
  sku: string | null;
  family: string | null;
  brand: string | null;
  supplier: string | null;
  description: string | null;
  category: string | null;
  pieces_per_box: number;
  retail_price_pesewas: number;
  wholesale_price_pesewas: number | null;
  promo_price_pesewas: number | null;
  bulk_price_pesewas: number | null;
  bulk_min_qty: number | null;
  cost_price_pesewas: number | null;
  stock_pieces: number;
  low_stock_threshold: number;
  expiry_date: string | null;
  batch_number: string | null;
  active: number;
}

interface StockFile {
  format: typeof FORMAT;
  exported_at: string;
  products: StockProduct[];
}

function download(bytes: Uint8Array, name: string): void {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportStockSnapshot(): Promise<string | null> {
  const products = await listProductsForTransfer();
  const file: StockFile = { format: FORMAT, exported_at: new Date().toISOString(), products };
  const bytes = new TextEncoder().encode(JSON.stringify(file, null, 2));
  const name = `countertop-stock-${new Date().toISOString().slice(0, 10)}.ctstock`;
  if (native.kind === "tauri") {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: name, filters: [{ name: "CounterTop stock", extensions: ["ctstock"] }] });
    if (!path) return null;
    await writeFile(path, bytes);
    return path;
  }
  download(bytes, name);
  return name;
}

async function listProductsForTransfer(): Promise<StockProduct[]> {
  const products = await listProductsManage({ includeInactive: true });
  return products.map((p) => ({
    name: p.name, barcode: p.barcode, sku: p.sku, family: p.family, brand: p.brand,
    supplier: p.supplier, description: p.description, category: p.category_name,
    pieces_per_box: p.pieces_per_box, retail_price_pesewas: p.retail_price_pesewas,
    wholesale_price_pesewas: p.wholesale_price_pesewas, promo_price_pesewas: p.promo_price_pesewas,
    bulk_price_pesewas: p.bulk_price_pesewas, bulk_min_qty: p.bulk_min_qty,
    cost_price_pesewas: p.cost_price_pesewas, stock_pieces: p.stock_pieces,
    low_stock_threshold: p.low_stock_threshold, expiry_date: p.expiry_date,
    batch_number: p.batch_number, active: p.active,
  }));
}

export async function importStockSnapshot(bytes: Uint8Array, userId: number): Promise<{ updated: number; created: number }> {
  let file: StockFile;
  try { file = JSON.parse(new TextDecoder().decode(bytes)) as StockFile; } catch { throw new Error("That is not a valid CounterTop stock file."); }
  if (file.format !== FORMAT || !Array.isArray(file.products)) throw new Error("This stock file is not compatible with this version of CounterTop.");
  const existing = await listProductsManage({ includeInactive: true });
  let updated = 0;
  let created = 0;
  for (const item of file.products) {
    const match = existing.find((p) => (item.barcode && p.barcode === item.barcode) || (item.sku && p.sku === item.sku));
    if (match) {
      const delta = item.stock_pieces - match.stock_pieces;
      if (delta !== 0) await recordStockChange(match.id, delta, "adjustment", userId, "Imported stock snapshot");
      updated++;
      continue;
    }
    const input: ProductInput = {
      name: item.name, barcode: item.barcode, sku: item.sku, family: item.family, brand: item.brand,
      supplier: item.supplier, description: item.description, image: null, category_id: null,
      pieces_per_box: item.pieces_per_box, retail_price_pesewas: item.retail_price_pesewas,
      wholesale_price_pesewas: item.wholesale_price_pesewas, promo_price_pesewas: item.promo_price_pesewas,
      bulk_price_pesewas: item.bulk_price_pesewas, bulk_min_qty: item.bulk_min_qty,
      cost_price_pesewas: item.cost_price_pesewas, low_stock_threshold: item.low_stock_threshold,
      expiry_date: item.expiry_date, batch_number: item.batch_number,
    };
    await createProduct(input, item.stock_pieces, userId);
    created++;
  }
  return { updated, created };
}