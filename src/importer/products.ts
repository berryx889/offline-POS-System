// Excel bulk import for products (pos-prd.md §6.3). Same pattern as the SMS
// import: download a template, upload a filled sheet, validate + preview, then
// commit. Prices in the sheet are in GHS and stored as pesewas.

import * as XLSX from "xlsx";
import { native } from "@/native";
import { ensureCategory, createProduct, type ProductInput } from "@/db/queries/products";
import { toPesewas } from "@/money";

const HEADERS = [
  "name",
  "barcode",
  "category",
  "family",
  "brand",
  "supplier",
  "sku",
  "description",
  "pieces_per_box",
  "retail_price",
  "wholesale_price",
  "promo_price",
  "bulk_price",
  "bulk_min_qty",
  "deal_qty",
  "deal_price",
  "cost_price",
  "opening_stock",
  "low_stock_threshold",
  "expiry_date",
  "batch_number",
] as const;

/** Download an .xlsx template with the expected headers and one example row. */
export function downloadTemplate(): void {
  const example = {
    name: "Example — Milo 400g Tin",
    barcode: "6009888112233",
    category: "Beverages",
    family: "Milo",
    brand: "Nestlé",
    supplier: "",
    sku: "",
    description: "",
    pieces_per_box: 12,
    retail_price: 5.5,
    wholesale_price: 60,
    promo_price: "",
    bulk_price: 5,
    bulk_min_qty: 12,
    deal_qty: 3,
    deal_price: 14,
    cost_price: 4.3,
    opening_stock: 100,
    low_stock_threshold: 20,
    expiry_date: "",
    batch_number: "",
  };
  const ws = XLSX.utils.json_to_sheet([example], { header: HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "countertop-products-template.xlsx");
}

export interface ParsedRow {
  rowNum: number;
  name: string;
  barcode: string | null;
  category: string;
  family: string | null;
  brand: string | null;
  supplier: string | null;
  sku: string | null;
  description: string | null;
  piecesPerBox: number;
  retailPesewas: number;
  wholesalePesewas: number | null;
  promoPesewas: number | null;
  bulkPesewas: number | null;
  bulkMinQty: number | null;
  dealQty: number | null;
  dealPricePesewas: number | null;
  costPesewas: number | null;
  openingStock: number;
  threshold: number;
  expiryDate: string | null;
  batchNumber: string | null;
  errors: string[];
}

// Normalize a header cell to our snake_case keys (tolerant of spaces/case).
function norm(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isFinite(n) ? n : NaN;
}

export async function parseWorkbook(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  // Existing barcodes, to flag duplicates against the catalog.
  const existing = await native.select<{ barcode: string }>(
    "SELECT barcode FROM products WHERE barcode IS NOT NULL"
  );
  const usedBarcodes = new Set(existing.map((r) => r.barcode));
  const seenInFile = new Set<string>();

  return raw.map((rowRaw, i) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rowRaw)) row[norm(k)] = v;

    const errors: string[] = [];
    const name = String(row.name ?? "").trim();
    if (!name || name.startsWith("Example —")) errors.push("Missing name");

    const barcodeStr = String(row.barcode ?? "").trim();
    const barcode = barcodeStr || null;
    if (barcode) {
      if (usedBarcodes.has(barcode)) errors.push(`Barcode ${barcode} already exists`);
      else if (seenInFile.has(barcode)) errors.push(`Barcode ${barcode} duplicated in file`);
      else seenInFile.add(barcode);
    }

    const retail = num(row.retail_price);
    if (!isFinite(retail) || retail <= 0) errors.push("Retail price must be a number > 0");

    const ppb = num(row.pieces_per_box);
    const piecesPerBox = isFinite(ppb) && ppb >= 1 ? Math.floor(ppb) : 1;

    const wholesaleRaw = row.wholesale_price;
    const wholesale = String(wholesaleRaw ?? "").trim() ? num(wholesaleRaw) : NaN;
    const costRaw = row.cost_price;
    const cost = String(costRaw ?? "").trim() ? num(costRaw) : NaN;
    const promoRaw = row.promo_price;
    const promo = String(promoRaw ?? "").trim() ? num(promoRaw) : NaN;
    const bulkRaw = row.bulk_price;
    const bulk = String(bulkRaw ?? "").trim() ? num(bulkRaw) : NaN;
    const bulkMinRaw = row.bulk_min_qty;
    const bulkMinQty = isFinite(bulk) ? Math.max(2, Math.floor(num(bulkMinRaw) || 12)) : null;
    const dealQtyRaw = row.deal_qty;
    const dealPriceRaw = row.deal_price;
    const hasDeal = String(dealQtyRaw ?? "").trim() !== "" || String(dealPriceRaw ?? "").trim() !== "";
    const dealQty = hasDeal ? Math.floor(num(dealQtyRaw)) : null;
    const dealPrice = hasDeal ? num(dealPriceRaw) : NaN;
    if (hasDeal && (dealQty == null || !isFinite(dealQty) || dealQty < 2)) errors.push("Deal quantity must be at least 2");
    if (hasDeal && (!isFinite(dealPrice) || dealPrice <= 0)) errors.push("Deal price must be a number > 0");
    if (hasDeal && isFinite(retail) && dealQty != null && isFinite(dealPrice) && dealPrice >= retail * dealQty) {
      errors.push("Deal price must be less than the normal total");
    }

    const str = (v: unknown) => String(v ?? "").trim() || null;

    return {
      rowNum: i + 2, // +1 for header, +1 for 1-based
      name,
      barcode,
      category: String(row.category ?? "").trim(),
      family: str(row.family),
      brand: str(row.brand),
      supplier: str(row.supplier),
      sku: str(row.sku),
      description: str(row.description),
      piecesPerBox,
      retailPesewas: isFinite(retail) ? toPesewas(retail) : 0,
      wholesalePesewas: isFinite(wholesale) ? toPesewas(wholesale) : null,
      promoPesewas: isFinite(promo) ? toPesewas(promo) : null,
      bulkPesewas: isFinite(bulk) ? toPesewas(bulk) : null,
      bulkMinQty,
      dealQty,
      dealPricePesewas: isFinite(dealPrice) ? toPesewas(dealPrice) : null,
      costPesewas: isFinite(cost) ? toPesewas(cost) : null,
      openingStock: Math.max(0, Math.floor(num(row.opening_stock) || 0)),
      threshold: Math.max(0, Math.floor(num(row.low_stock_threshold) || 10)),
      expiryDate: str(row.expiry_date),
      batchNumber: str(row.batch_number),
      errors,
    };
  });
}

/** Commit the valid rows. Returns how many were imported. */
export async function commitRows(rows: ParsedRow[], userId: number): Promise<number> {
  const valid = rows.filter((r) => r.errors.length === 0);
  const categoryCache = new Map<string, number>();
  let imported = 0;

  for (const r of valid) {
    let categoryId: number | null = null;
    if (r.category) {
      categoryId = categoryCache.get(r.category) ?? (await ensureCategory(r.category));
      categoryCache.set(r.category, categoryId);
    }
    const input: ProductInput = {
      name: r.name,
      barcode: r.barcode,
      sku: r.sku,
      family: r.family,
      brand: r.brand,
      supplier: r.supplier,
      description: r.description,
      image: null,
      category_id: categoryId,
      pieces_per_box: r.piecesPerBox,
      retail_price_pesewas: r.retailPesewas,
      wholesale_price_pesewas: r.wholesalePesewas,
      promo_price_pesewas: r.promoPesewas,
      bulk_price_pesewas: r.bulkPesewas,
      bulk_min_qty: r.bulkMinQty,
      deal_qty: r.dealQty,
      deal_price_pesewas: r.dealPricePesewas,
      cost_price_pesewas: r.costPesewas,
      low_stock_threshold: r.threshold,
      expiry_date: r.expiryDate,
      batch_number: r.batchNumber,
    };
    await createProduct(input, r.openingStock, userId);
    imported++;
  }
  return imported;
}
