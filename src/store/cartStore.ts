// The live cart. Each line is a snapshot-friendly copy of a product plus the unit
// and qty being sold. Retail (per piece) and wholesale (per box) are independent
// numbers carried on the line, so toggling the unit never *computes* one from the
// other (pos-prd.md §7). Money is pesewas throughout.

import { create } from "zustand";
import type { Product } from "@/db/queries/products";

export type Unit = "piece" | "box";

export interface CartLine {
  id: string; // unique per line so boxes and loose pieces of one product coexist
  productId: number;
  name: string;
  piecesPerBox: number;
  retailPesewas: number;
  wholesalePesewas: number | null;
  unit: Unit;
  qty: number;
}

/** Price for the line's current unit. Box uses wholesale; falls back to retail
 *  only if somehow toggled without a wholesale price (guarded in the UI). */
export function unitPrice(line: CartLine): number {
  if (line.unit === "box") return line.wholesalePesewas ?? line.retailPesewas;
  return line.retailPesewas;
}

export function lineTotal(line: CartLine): number {
  return unitPrice(line) * line.qty;
}

function toLine(p: Product, unit: Unit): CartLine {
  return {
    id: crypto.randomUUID(),
    productId: p.id,
    name: p.name,
    piecesPerBox: p.pieces_per_box,
    retailPesewas: p.retail_price_pesewas,
    wholesalePesewas: p.wholesale_price_pesewas,
    unit,
    qty: 1,
  };
}

interface CartState {
  lines: CartLine[];
  /** Add a product at the given unit. If a line with the same product+unit exists,
   *  increment it instead of adding a duplicate (the barcode fast-path relies on
   *  this — rescanning bumps qty). */
  add: (product: Product, unit?: Unit) => void;
  setQty: (id: string, qty: number) => void;
  setUnit: (id: string, unit: Unit) => void;
  remove: (id: string) => void;
  clear: () => void;
  subtotal: () => number;
  itemCount: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],

  add: (product, unit = "piece") =>
    set((state) => {
      // A box line needs a wholesale price; ignore the request if there isn't one.
      if (unit === "box" && product.wholesale_price_pesewas == null) unit = "piece";
      const existing = state.lines.find(
        (l) => l.productId === product.id && l.unit === unit
      );
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.id === existing.id ? { ...l, qty: l.qty + 1 } : l
          ),
        };
      }
      return { lines: [...state.lines, toLine(product, unit)] };
    }),

  setQty: (id, qty) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.id === id ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l
      ),
    })),

  setUnit: (id, unit) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.id !== id) return l;
        // Can't switch to box without a wholesale price.
        if (unit === "box" && l.wholesalePesewas == null) return l;
        return { ...l, unit };
      }),
    })),

  remove: (id) => set((state) => ({ lines: state.lines.filter((l) => l.id !== id) })),

  clear: () => set({ lines: [] }),

  subtotal: () => get().lines.reduce((sum, l) => sum + lineTotal(l), 0),

  itemCount: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
}));
