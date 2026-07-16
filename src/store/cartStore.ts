// The live cart. Each line is a snapshot-friendly copy of a product plus the unit
// and qty being sold. Units generalize PC/BOX (v3 §8): 'piece' and 'box' are the
// built-ins (retail / wholesale-per-box, independent numbers per pos-prd.md §7),
// and a product's custom selling units ("Half Tray", "Crate") each carry their own
// pieces multiplier and price, snapshotted onto the line when selected. Money is
// pesewas throughout.

import { create } from "zustand";
import type { Product } from "@/db/queries/products";
import { listUnits, type SellingUnit } from "@/db/queries/units";

export type Unit = string; // 'piece' | 'box' | a custom selling-unit name

export interface CartLine {
  id: string; // unique per line so different units of one product coexist
  productId: number;
  name: string;
  piecesPerBox: number;
  retailPesewas: number;
  wholesalePesewas: number | null; // per BOX
  /** Per-piece promo price (overrides retail while set). */
  promoPesewas: number | null;
  /** Per-piece wholesale price + the piece qty where it kicks in automatically. */
  bulkPesewas: number | null;
  bulkMinQty: number | null;
  /** Wholesale-pricing sale (customer type or cashier toggle): bulk price applies
   *  regardless of quantity. Carried per line so pricing stays a pure function. */
  wholesale: boolean;
  /** Custom selling units available for this product (hydrated async after add). */
  extraUnits: SellingUnit[];
  unit: Unit;
  /** Pieces deducted per 1 of this unit (1 piece, piecesPerBox box, custom otherwise). */
  unitPieces: number;
  /** Snapshotted price for box/custom units; null for 'piece' (computed from retail). */
  unitPricePesewas: number | null;
  qty: number;
  /** Admin-only per-line price override (pos-prd.md §6.1). Cleared when the unit
   *  changes so it never silently sticks to the wrong base price. */
  overridePesewas?: number | null;
}

/** Why a piece price came out the way it did — the UI shows a small tag. */
export type PieceRate = "retail" | "promo" | "wholesale";

/** Smart pricing for the piece unit (v3 §9): the per-piece wholesale price applies
 *  on a wholesale sale or once qty reaches the threshold; else promo beats retail. */
export function pieceRate(line: CartLine): PieceRate {
  if (
    line.bulkPesewas != null &&
    (line.wholesale || (line.bulkMinQty != null && line.qty >= line.bulkMinQty))
  ) {
    return "wholesale";
  }
  return line.promoPesewas != null ? "promo" : "retail";
}

/** Effective unit price: an admin override wins; 'piece' uses smart pricing;
 *  box/custom use their snapshotted price (falling back to retail defensively). */
export function unitPrice(line: CartLine): number {
  if (line.overridePesewas != null) return line.overridePesewas;
  if (line.unit === "piece") {
    const rate = pieceRate(line);
    if (rate === "wholesale") return line.bulkPesewas!;
    if (rate === "promo") return line.promoPesewas!;
    return line.retailPesewas;
  }
  return line.unitPricePesewas ?? line.retailPesewas;
}

export function lineTotal(line: CartLine): number {
  return unitPrice(line) * line.qty;
}

/** Pieces this line deducts from stock. */
export function linePieces(line: CartLine): number {
  return line.qty * line.unitPieces;
}

/** The units a line can be sold in, in picker order. */
export function availableUnits(line: CartLine): { name: Unit; pieces: number; pricePesewas: number | null }[] {
  const units: { name: Unit; pieces: number; pricePesewas: number | null }[] = [
    { name: "piece", pieces: 1, pricePesewas: null },
  ];
  if (line.wholesalePesewas != null) {
    units.push({ name: "box", pieces: line.piecesPerBox, pricePesewas: line.wholesalePesewas });
  }
  for (const u of line.extraUnits) {
    units.push({ name: u.name, pieces: u.pieces, pricePesewas: u.price_pesewas });
  }
  return units;
}

function toLine(p: Product, unit: Unit, wholesale: boolean): CartLine {
  const base: CartLine = {
    id: crypto.randomUUID(),
    productId: p.id,
    name: p.name,
    piecesPerBox: p.pieces_per_box,
    retailPesewas: p.retail_price_pesewas,
    wholesalePesewas: p.wholesale_price_pesewas,
    promoPesewas: p.promo_price_pesewas,
    bulkPesewas: p.bulk_price_pesewas,
    bulkMinQty: p.bulk_min_qty,
    wholesale,
    extraUnits: [],
    unit: "piece",
    unitPieces: 1,
    unitPricePesewas: null,
    qty: 1,
  };
  if (unit === "box" && p.wholesale_price_pesewas != null) {
    base.unit = "box";
    base.unitPieces = p.pieces_per_box;
    base.unitPricePesewas = p.wholesale_price_pesewas;
  }
  return base;
}

interface CartState {
  lines: CartLine[];
  /** Wholesale-pricing sale (v3 §9 method 3). Set by the cashier toggle or by
   *  attaching a wholesale customer at tender; applied to every line. */
  wholesaleMode: boolean;
  setWholesaleMode: (on: boolean) => void;
  /** The line last added/incremented, plus a tick that changes on every add so the
   *  UI can re-trigger the scan-success flash even when the same line is hit again. */
  lastTouchedId: string | null;
  touchTick: number;
  /** Add a product at the given unit. If a line with the same product+unit exists,
   *  increment it instead of adding a duplicate (the barcode fast-path relies on
   *  this — rescanning bumps qty). Custom units hydrate in the background. */
  add: (product: Product, unit?: Unit) => void;
  setQty: (id: string, qty: number) => void;
  setUnit: (id: string, unit: Unit) => void;
  /** Cycle to the next available unit (F6). */
  cycleUnit: (id: string) => void;
  /** Admin price override for a line; null clears it back to the base price. */
  setOverride: (id: string, pesewas: number | null) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Whole-sale discount in pesewas (pos-prd.md §6.1). */
  discountPesewas: number;
  setDiscount: (pesewas: number) => void;
  subtotal: () => number;
  /** subtotal − discount, floored at 0. */
  total: () => number;
  itemCount: () => number;
}

/** Fetch a product's custom units once and patch every cart line that shows it.
 *  Best-effort: the cart works with PC/BOX even if this read fails. */
function hydrateUnits(productId: number) {
  listUnits(productId)
    .then((units) => {
      useCart.setState((state) => ({
        lines: state.lines.map((l) =>
          l.productId === productId ? { ...l, extraUnits: units } : l
        ),
      }));
    })
    .catch(() => {});
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  lastTouchedId: null,
  touchTick: 0,
  discountPesewas: 0,
  wholesaleMode: false,

  setWholesaleMode: (on) =>
    set((state) => ({
      wholesaleMode: on,
      lines: state.lines.map((l) => ({ ...l, wholesale: on })),
    })),

  add: (product, unit = "piece") =>
    set((state) => {
      // A box line needs a wholesale price; fall back to piece if there isn't one.
      if (unit === "box" && product.wholesale_price_pesewas == null) unit = "piece";
      hydrateUnits(product.id);
      const existing = state.lines.find(
        (l) => l.productId === product.id && l.unit === unit
      );
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.id === existing.id ? { ...l, qty: l.qty + 1 } : l
          ),
          lastTouchedId: existing.id,
          touchTick: state.touchTick + 1,
        };
      }
      const line = toLine(product, unit, state.wholesaleMode);
      return {
        lines: [...state.lines, line],
        lastTouchedId: line.id,
        touchTick: state.touchTick + 1,
      };
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
        const u = availableUnits(l).find((x) => x.name === unit);
        if (!u) return l; // unknown unit (e.g. box without a wholesale price)
        // Changing the unit clears any override so it can't stick to the old base.
        return {
          ...l,
          unit: u.name,
          unitPieces: u.pieces,
          unitPricePesewas: u.pricePesewas,
          overridePesewas: null,
        };
      }),
    })),

  cycleUnit: (id) => {
    const line = get().lines.find((l) => l.id === id);
    if (!line) return;
    const units = availableUnits(line);
    if (units.length < 2) return;
    const idx = units.findIndex((u) => u.name === line.unit);
    get().setUnit(id, units[(idx + 1) % units.length].name);
  },

  setOverride: (id, pesewas) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.id === id ? { ...l, overridePesewas: pesewas == null ? null : Math.max(0, Math.floor(pesewas)) } : l
      ),
    })),

  remove: (id) => set((state) => ({ lines: state.lines.filter((l) => l.id !== id) })),

  clear: () => set({ lines: [], discountPesewas: 0, wholesaleMode: false }),

  setDiscount: (pesewas) => set({ discountPesewas: Math.max(0, Math.floor(pesewas)) }),

  subtotal: () => get().lines.reduce((sum, l) => sum + lineTotal(l), 0),

  total: () => Math.max(0, get().subtotal() - get().discountPesewas),

  itemCount: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
}));
