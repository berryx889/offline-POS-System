// Whole-sale discount (pos-prd.md §6.1): in cedis or %, admin PIN required above a
// settable threshold. Records an audit entry when the threshold is overridden.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/store/cartStore";
import { useSession } from "@/store/sessionStore";
import { getSettings } from "@/db/queries/settings";
import { logAudit } from "@/db/queries/audit";
import { AdminPinPrompt } from "@/components/AdminPinPrompt";
import { MoneyText } from "@/components/MoneyText";
import { toPesewas } from "@/money";
import { cn } from "@/lib/cn";

const DEFAULT_THRESHOLD = 5000; // GHS 50.00

export function DiscountControl({ subtotalPesewas }: { subtotalPesewas: number }) {
  const discount = useCart((s) => s.discountPesewas);
  const setDiscount = useCart((s) => s.setDiscount);
  const isAdmin = useSession((s) => s.can("change_price"));
  const sessionUserId = useSession((s) => s.user?.id) ?? null;
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const threshold = settings?.discount_threshold ? parseInt(settings.discount_threshold, 10) : DEFAULT_THRESHOLD;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"cedis" | "percent">("cedis");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<number | null>(null); // awaiting admin PIN
  const [error, setError] = useState<string | null>(null);

  function computed(): number {
    const v = parseFloat(value || "0");
    if (!isFinite(v) || v <= 0) return 0;
    const raw = mode === "percent" ? Math.round((subtotalPesewas * v) / 100) : toPesewas(v);
    return Math.min(raw, subtotalPesewas); // never discount below zero
  }

  function apply() {
    setError(null);
    const amount = computed();
    if (amount <= 0) return setError("Enter a discount.");
    if (amount > threshold && !isAdmin) {
      setPending(amount); // needs manager override
      return;
    }
    commit(amount, sessionUserId);
  }

  function commit(amount: number, actorId: number | null) {
    setDiscount(amount);
    if (amount > threshold) {
      logAudit(actorId, "discount_override", { amount, threshold, mode });
    }
    setOpen(false);
    setValue("");
    setPending(null);
  }

  if (discount > 0 && !open) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brass/40 bg-brass/5 px-4 py-2 text-sm">
        <span className="text-ink/70">
          Discount <MoneyText pesewas={discount} className="text-brass" />
        </span>
        <button onClick={() => setDiscount(0)} className="text-ink/50 hover:text-stamp">
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-9 w-full rounded-xl border border-ink/15 text-sm font-medium text-ink/60 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
      >
        Add discount
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-ink/15 bg-tape p-3">
      <div className="mb-2 flex gap-2">
        {(["cedis", "percent"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium",
              mode === m ? "border-ledger bg-ledger/5 text-ledger" : "border-ink/15 text-ink/60"
            )}
          >
            {m === "cedis" ? "GHS" : "%"}
          </button>
        ))}
      </div>
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder={mode === "percent" ? "e.g. 10" : "e.g. 5.00"}
        className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
      />
      {value && (
        <p className="mt-1 text-right text-xs text-ink/50">
          = <MoneyText pesewas={computed()} size="sm" /> off
        </p>
      )}
      {error && <p className="mt-1 text-xs font-medium text-stamp">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={apply} className="h-9 flex-1 rounded-lg bg-ledger text-sm font-semibold text-tape hover:bg-ledger-deep">
          Apply
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setValue("");
            setError(null);
          }}
          className="h-9 flex-1 rounded-lg border border-ink/15 text-sm text-ink/70 hover:bg-paper"
        >
          Cancel
        </button>
      </div>

      {pending != null && (
        <AdminPinPrompt
          title="Discount needs a manager"
          detail={`This discount is above the ${(threshold / 100).toFixed(2)} GHS limit.`}
          onVerified={(admin) => commit(pending, admin.id)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
