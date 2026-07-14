// Cash tender (pos-prd.md §6.1). Slides over the tape column so the cashier's eye
// never leaves the right edge. Change due renders at 48px in brass — one of only
// two places that size is used. MoMo and split payment come in Phase 6.

import { useEffect, useState } from "react";
import { useCart } from "@/store/cartStore";
import { useSession } from "@/store/sessionStore";
import { commitSale, InsufficientStockError, type CommittedSale } from "@/db/queries/sales";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";

const QUICK_CEDIS = [50, 100, 200];

export function TenderPanel({
  totalPesewas,
  onCancel,
  onDone,
}: {
  totalPesewas: number;
  onCancel: () => void;
  onDone: (sale: CommittedSale) => void;
}) {
  const [received, setReceived] = useState(0); // pesewas
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const userId = useSession((s) => s.user?.id);

  const change = received - totalPesewas;
  const canConfirm = received >= totalPesewas && !busy;

  // Keypad builds whole cedis; Exact/quick buttons set precise amounts.
  function pushDigit(d: string) {
    const cedis = Math.floor(received / 100);
    const next = Number(`${cedis}${d}`);
    if (next <= 9_999_999) setReceived(next * 100);
  }

  async function confirm() {
    if (!canConfirm || userId == null) return;
    setBusy(true);
    setError(null);
    try {
      const sale = await commitSale({
        userId,
        lines,
        payment: { method: "cash", amountPaidPesewas: received },
      });
      emit("sale:completed", { saleId: sale.saleId });
      emit("stock:changed");
      clear();
      onDone(sale);
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        setError(
          e.shortfalls
            .map((s) => {
              const line = lines.find((l) => l.name === s.name);
              const ppb = line?.piecesPerBox ?? 1;
              return `${s.name}: only ${formatStock(s.available, ppb)} available`;
            })
            .join(" · ")
        );
      } else {
        setError(String(e));
      }
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") confirm();
      else if (e.key >= "0" && e.key <= "9") pushDigit(e.key);
      else if (e.key === "Backspace") setReceived(Math.floor(received / 1000) * 100);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received, canConfirm, userId, lines]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-tape p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-lg font-semibold">Cash payment</h2>
        <button
          onClick={onCancel}
          className="text-sm text-ink/50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Esc ✕
        </button>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-ink/60">Total due</span>
        <MoneyText pesewas={totalPesewas} size="xl" currency className="font-semibold" />
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm text-ink/60">Received</span>
        <MoneyText pesewas={received} size="xl" />
      </div>

      {/* Quick amounts */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <button
          onClick={() => setReceived(totalPesewas)}
          className="h-12 rounded-xl border border-ledger bg-ledger/5 text-sm font-semibold text-ledger hover:bg-ledger/10 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Exact
        </button>
        {QUICK_CEDIS.map((c) => (
          <button
            key={c}
            onClick={() => setReceived(c * 100)}
            className="h-12 rounded-xl border border-ink/15 bg-tape text-sm font-semibold hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {c}
          </button>
        ))}
      </div>

      {/* Keypad */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((k) => (
          <button
            key={k}
            onClick={() =>
              k === "⌫"
                ? setReceived(Math.floor(received / 1000) * 100)
                : k === "00"
                  ? (pushDigit("0"), pushDigit("0"))
                  : pushDigit(k)
            }
            className="h-14 rounded-xl border border-ink/10 bg-tape text-xl font-semibold shadow-card hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {k}
          </button>
        ))}
      </div>

      {/* Change due — 48px brass, the loud moment */}
      <div className="mt-auto pt-4">
        {change >= 0 && received > 0 && (
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-ink/60">Change due</span>
            <MoneyText pesewas={change} size="loud" className="text-brass" />
          </div>
        )}
        {error && <p className="mb-3 text-sm font-medium text-stamp">{error}</p>}
        <button
          onClick={confirm}
          disabled={!canConfirm}
          className={cn(
            "h-16 w-full rounded-xl bg-ledger text-lg font-semibold text-tape shadow-card",
            "transition-colors hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
          )}
        >
          {busy ? "Saving…" : "Confirm payment"}
        </button>
      </div>
    </div>
  );
}
