// Stock movement dialog (pos-prd.md §6.3 + v3 §11). Every change goes through a
// movement — purchase/restock/return add stock, damaged/expired/transfer remove
// it, adjustment corrects a count (signed). Below the form: the product's ledger,
// every movement with prev → new stock, so inventory is never "just a number".

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { recordStockChange, type Product } from "@/db/queries/products";
import { listMovements, type MovementReason } from "@/db/queries/movements";
import { useSession } from "@/store/sessionStore";
import { can } from "@/auth/permissions";
import { formatStock, piecesForUnit } from "@/stock";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";
import { createRestock } from "@/db/queries/restocks";

type ManualReason = Exclude<MovementReason, "sale" | "void" | "opening">;

const REASONS: { value: ManualReason; label: string; direction: "in" | "out" | "signed" }[] = [
  { value: "purchase", label: "Purchase", direction: "in" },
  { value: "restock", label: "Restock", direction: "in" },
  { value: "return", label: "Return", direction: "in" },
  { value: "damaged", label: "Damaged", direction: "out" },
  { value: "expired", label: "Expired", direction: "out" },
  { value: "transfer", label: "Transfer", direction: "out" },
  { value: "adjustment", label: "Adjustment", direction: "signed" },
];

export function RestockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const userId = useSession((s) => s.user?.id) ?? 0;
  const canAdjustStock = useSession((s) => can(s.user, "stock_adjustment"));
  const queryClient = useQueryClient();
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"piece" | "box">(product.pieces_per_box > 1 ? "box" : "piece");
  const [reason, setReason] = useState<ManualReason>("purchase");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["movements", product.id],
    queryFn: () => listMovements(product.id, 30),
  });

  const direction = REASONS.find((r) => r.value === reason)!.direction;
  // In/out reasons take a magnitude and apply the sign; adjustment keeps the sign
  // so a leading minus corrects stock down after a count.
  const rawQty = parseInt(qty, 10) || 0;
  const magnitude =
    direction === "in" ? Math.abs(rawQty) : direction === "out" ? -Math.abs(rawQty) : rawQty;
  const change = piecesForUnit(magnitude, unit, product.pieces_per_box);
  const resulting = product.stock_pieces + change;

  async function confirm() {
    setError(null);
    if (change === 0) return setError("Enter a quantity.");
    if (resulting < 0) return setError("That would leave negative stock.");
    setBusy(true);
    try {
      if (reason === "restock" || reason === "purchase") {
        await createRestock(product.id, change, product.cost_price_pesewas ?? 0, userId, note.trim() || undefined);
      } else {
        await recordStockChange(product.id, change, reason, userId, note.trim() || undefined);
      }
      queryClient.invalidateQueries({ queryKey: ["products-manage"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["top-products"] });
      queryClient.invalidateQueries({ queryKey: ["movements", product.id] });
      queryClient.invalidateQueries({ queryKey: ["restocks"] });
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-ink/8 bg-tape p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-sans text-lg font-semibold text-ink">Stock — {product.name}</h2>
        <p className="mt-1 text-sm text-ink/60">
          Current stock: {formatStock(product.stock_pieces, product.pieces_per_box)}
        </p>

        <div className="mt-3">
          <span className="mb-1 block text-sm text-ink/70">Movement</span>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-xs font-medium",
                  reason === r.value
                    ? r.direction === "out"
                      ? "border-stamp bg-stamp/5 text-stamp"
                      : "border-ledger bg-ledger/5 text-ledger"
                    : "border-ink/15 text-ink/60 hover:bg-paper"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {direction === "signed" && (
            <p className="mt-1 text-xs text-ink/50">Use a leading minus for a correction down (e.g. -3).</p>
          )}
        </div>

        <div className="mt-3 flex items-end gap-2">
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

        <label className="mt-3 block">
          <span className="mb-1 block text-sm text-ink/70">Reference / reason (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. invoice #, supplier, damage cause"
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </label>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="text-ink/60">New stock</span>
          <span className={cn("font-semibold tabular-nums", resulting < 0 && "text-stamp")}>
            {formatStock(Math.max(0, resulting), product.pieces_per_box)}
          </span>
        </div>

        {!canAdjustStock && (
          <p className="mt-3 text-sm font-medium text-stamp">
            You don't have permission to change stock. Ask an admin or manager.
          </p>
        )}
        {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={confirm}
            disabled={busy || !canAdjustStock}
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

        {/* The stock ledger: every movement, newest first, prev → new. */}
        {history.length > 0 && (
          <div className="mt-4 min-h-0 flex-1 overflow-auto border-t border-ink/8 pt-3">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink/40">
              History
            </span>
            <table className="w-full text-left text-xs tabular-nums">
              <tbody>
                {history.map((m) => (
                  <tr key={m.id} className="border-b border-ink/5 last:border-0">
                    <td className="py-1.5 pr-2 text-ink/50">
                      {new Date(m.created_at).toLocaleDateString()}{" "}
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 pr-2 font-medium capitalize text-ink/80">
                      {m.reason}
                      {m.receipt_no && <span className="ml-1 font-normal text-ink/40">{m.receipt_no}</span>}
                    </td>
                    <td className={cn("py-1.5 pr-2 text-right font-semibold", m.change_pieces < 0 ? "text-stamp" : "text-ledger")}>
                      {m.change_pieces > 0 ? `+${m.change_pieces}` : m.change_pieces}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink/50">
                      {m.prev_pieces != null ? `${m.prev_pieces} → ${m.new_pieces}` : "—"}
                    </td>
                    <td className="py-1.5 text-ink/50">{m.user_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
