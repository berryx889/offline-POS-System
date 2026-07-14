// One interactive line on the receipt-tape cart. PC/BOX toggle swaps to the
// wholesale price (disabled when a product has none), qty is typeable (cashiers
// sell 50 pieces at once — steppers alone are punishment), and each line removes.

import { useEffect, useState } from "react";
import { unitPrice, lineTotal, useCart, type CartLine } from "@/store/cartStore";
import { MoneyText } from "@/components/MoneyText";
import { cn } from "@/lib/cn";

export function CartLineRow({ line }: { line: CartLine }) {
  const setUnit = useCart((s) => s.setUnit);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const lastTouchedId = useCart((s) => s.lastTouchedId);
  const touchTick = useCart((s) => s.touchTick);
  const canBox = line.wholesalePesewas != null;

  // 80ms background flash when this line is the one just scanned/added (§9.6).
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (lastTouchedId !== line.id) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 220);
    return () => clearTimeout(t);
    // touchTick re-triggers the flash even when the same line is hit again.
  }, [touchTick, lastTouchedId, line.id]);

  return (
    <div
      className={cn(
        "group border-b border-dashed border-ink/15 py-2 transition-colors duration-200",
        flash && "bg-brass/15"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{line.name}</span>
        <button
          onClick={() => remove(line.id)}
          className="shrink-0 text-ink/30 hover:text-stamp focus:outline-none focus:ring-2 focus:ring-carbon"
          aria-label={`Remove ${line.name}`}
        >
          ✕
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* PC / BOX selector */}
          <div className="flex overflow-hidden rounded-md border border-ink/15 text-xs">
            {(["piece", "box"] as const).map((u) => {
              const active = line.unit === u;
              const disabled = u === "box" && !canBox;
              return (
                <button
                  key={u}
                  disabled={disabled}
                  onClick={() => setUnit(line.id, u)}
                  className={cn(
                    "px-2 py-1 font-sans font-medium uppercase tracking-wide",
                    active ? "bg-ledger text-tape" : "bg-tape text-ink/60 hover:bg-paper",
                    disabled && "cursor-not-allowed opacity-30 hover:bg-tape"
                  )}
                >
                  {u === "piece" ? "PC" : "BOX"}
                </button>
              );
            })}
          </div>

          {/* Qty */}
          <input
            type="number"
            min={1}
            value={line.qty}
            onChange={(e) => setQty(line.id, Number(e.target.value))}
            className="w-14 rounded-md border border-ink/15 bg-tape px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <span className="text-xs text-ink/50">
            @ <MoneyText pesewas={unitPrice(line)} size="sm" />
          </span>
        </div>

        <MoneyText pesewas={lineTotal(line)} className="font-semibold" />
      </div>
    </div>
  );
}
