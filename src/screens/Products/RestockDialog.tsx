// Restock dialog (pos-prd.md §6.3). Quantity-in by boxes or pieces, written as a
// stock_movement (not a raw field edit) so the stock ledger stays explainable.
// "Adjustment" allows negative corrections after a physical count.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordStockChange, type Product } from "@/db/queries/products";
import { useSession } from "@/store/sessionStore";
import { formatStock, piecesForUnit } from "@/stock";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";

export function RestockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const userId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"piece" | "box">(product.pieces_per_box > 1 ? "box" : "piece");
  const [reason, setReason] = useState<"restock" | "adjustment">("restock");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restock always adds (magnitude); an adjustment keeps the sign so a leading
  // minus corrects stock down. piecesForUnit carries the sign through the box math.
  const rawQty = parseInt(qty, 10) || 0;
  const magnitude = reason === "restock" ? Math.abs(rawQty) : rawQty;
  const change = piecesForUnit(magnitude, unit, product.pieces_per_box);
  const resulting = product.stock_pieces + change;

  async function confirm() {
    setError(null);
    if (change === 0) return setError("Enter a quantity.");
    if (resulting < 0) return setError("That would leave negative stock.");
    setBusy(true);
    try {
      await recordStockChange(product.id, change, reason, userId);
      queryClient.invalidateQueries({ queryKey: ["products-manage"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["top-products"] });
      emit("stock:changed");
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-ink/8 bg-tape p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-sans text-lg font-semibold text-ink">Restock — {product.name}</h2>
        <p className="mt-1 text-sm text-ink/60">
          Current stock: {formatStock(product.stock_pieces, product.pieces_per_box)}
        </p>

        <div className="mt-4 flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-ink/70">Quantity</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          </label>
          {product.pieces_per_box > 1 && (
            <div className="flex overflow-hidden rounded-lg border border-ink/15 text-xs">
              {(["piece", "box"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cn(
                    "px-3 py-2 font-medium uppercase",
                    unit === u ? "bg-ledger text-tape" : "bg-tape text-ink/60"
                  )}
                >
                  {u === "piece" ? "PC" : "BOX"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-sm text-ink/70">Reason</span>
          <div className="flex gap-2">
            {(["restock", "adjustment"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize",
                  reason === r ? "border-ledger bg-ledger/5 text-ledger" : "border-ink/15 text-ink/60"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "adjustment" && (
            <p className="mt-1 text-xs text-ink/50">Use a leading minus for a correction down (e.g. -3).</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="text-ink/60">New stock</span>
          <span className="font-semibold tabular-nums">
            {formatStock(Math.max(0, resulting), product.pieces_per_box)}
          </span>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={confirm}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
          <button
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-ink/15 text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
