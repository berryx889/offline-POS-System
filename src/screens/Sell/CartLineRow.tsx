// One interactive line on the receipt-tape cart. PC/BOX toggle swaps to the
// wholesale price (disabled when a product has none), qty is typeable (cashiers
// sell 50 pieces at once — steppers alone are punishment), each line removes, and
// an admin can override the unit price (pos-prd.md §6.1; cashiers need an admin PIN).

import { useEffect, useState } from "react";
import { unitPrice, lineTotal, useCart, type CartLine } from "@/store/cartStore";
import { useSession } from "@/store/sessionStore";
import { logAudit } from "@/db/queries/audit";
import { MoneyText } from "@/components/MoneyText";
import { AdminPinPrompt } from "@/components/AdminPinPrompt";
import { toPesewas, formatPesewas } from "@/money";
import { cn } from "@/lib/cn";

export function CartLineRow({ line }: { line: CartLine }) {
  const setUnit = useCart((s) => s.setUnit);
  const setQty = useCart((s) => s.setQty);
  const setOverride = useCart((s) => s.setOverride);
  const remove = useCart((s) => s.remove);
  const lastTouchedId = useCart((s) => s.lastTouchedId);
  const touchTick = useCart((s) => s.touchTick);
  const isAdmin = useSession((s) => s.user?.role === "admin");
  const sessionUserId = useSession((s) => s.user?.id) ?? null;
  const canBox = line.wholesalePesewas != null;
  const overridden = line.overridePesewas != null;

  // 80ms background flash when this line is the one just scanned/added (§9.6).
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (lastTouchedId !== line.id) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 220);
    return () => clearTimeout(t);
    // touchTick re-triggers the flash even when the same line is hit again.
  }, [touchTick, lastTouchedId, line.id]);

  // Price-override flow: cashiers must pass an admin PIN first. `authorizedBy` is
  // the admin who approved it (the session user when an admin does it directly).
  const [editing, setEditing] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState<number | null>(null);

  function beginOverride() {
    setPriceInput(formatPesewas(unitPrice(line)));
    if (isAdmin) {
      setAuthorizedBy(sessionUserId);
      setEditing(true);
    } else {
      setAskPin(true);
    }
  }

  function applyOverride() {
    const next = toPesewas(priceInput);
    logAudit(authorizedBy, "price_override", {
      product_id: line.productId,
      name: line.name,
      old: unitPrice(line),
      new: next,
    });
    setOverride(line.id, next);
    setEditing(false);
    setAuthorizedBy(null);
  }

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

          {/* Unit price — click to override (admin, or admin PIN) */}
          <button
            onClick={beginOverride}
            title="Override price"
            className={cn(
              "text-xs hover:underline focus:outline-none focus:ring-2 focus:ring-carbon",
              overridden ? "font-semibold text-brass" : "text-ink/50"
            )}
          >
            @ <MoneyText pesewas={unitPrice(line)} size="sm" />
            {overridden && " *"}
          </button>
        </div>

        <MoneyText pesewas={lineTotal(line)} className="font-semibold" />
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-ink/60">New unit price</span>
          <input
            autoFocus
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyOverride()}
            className="w-24 rounded-md border border-ink/15 bg-tape px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <button
            onClick={applyOverride}
            className="rounded-md bg-ledger px-3 py-1 text-xs font-semibold text-tape hover:bg-ledger-deep"
          >
            Set
          </button>
          {overridden && (
            <button
              onClick={() => {
                setOverride(line.id, null);
                setEditing(false);
              }}
              className="text-xs text-ink/50 hover:text-stamp"
            >
              Reset
            </button>
          )}
          <button onClick={() => setEditing(false)} className="text-xs text-ink/40 hover:text-ink">
            Cancel
          </button>
        </div>
      )}

      {askPin && (
        <AdminPinPrompt
          title="Price override needs a manager"
          detail={`Change the unit price of ${line.name}.`}
          onVerified={(admin) => {
            setAskPin(false);
            setAuthorizedBy(admin.id);
            setPriceInput(formatPesewas(unitPrice(line)));
            setEditing(true);
          }}
          onCancel={() => setAskPin(false)}
        />
      )}
    </div>
  );
}
