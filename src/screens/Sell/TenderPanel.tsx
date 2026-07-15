// Tender panel (pos-prd.md §6.1). Cash, MoMo, or Split. Slides over the tape so
// the cashier's eye never leaves the right edge. Change due (cash) renders at 48px
// in brass — one of only two places that size is used.

import { useEffect, useState } from "react";
import { useCart } from "@/store/cartStore";
import { useSession } from "@/store/sessionStore";
import {
  commitSale,
  InsufficientStockError,
  type CommittedSale,
  type PaymentMethod,
} from "@/db/queries/sales";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";
import { toPesewas } from "@/money";
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
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState(0); // cash, pesewas
  const [momoRef, setMomoRef] = useState("");
  const [cashPart, setCashPart] = useState(""); // split
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = useCart((s) => s.lines);
  const discountPesewas = useCart((s) => s.discountPesewas);
  const clear = useCart((s) => s.clear);
  const userId = useSession((s) => s.user?.id);

  const change = received - totalPesewas;
  const splitCash = toPesewas(cashPart || "0");
  const splitMomo = totalPesewas - splitCash;

  const canConfirm =
    !busy &&
    (method === "cash" ? received >= totalPesewas : method === "momo" ? true : splitCash >= 0 && splitCash <= totalPesewas);

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
      const payment =
        method === "cash"
          ? { method, amountPaidPesewas: received }
          : method === "momo"
            ? { method, amountPaidPesewas: totalPesewas, momoReference: momoRef.trim() || undefined }
            : {
                method,
                amountPaidPesewas: totalPesewas,
                cashPartPesewas: splitCash,
                momoPartPesewas: splitMomo,
              };
      const sale = await commitSale({ userId, lines, payment, discountPesewas });
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
              return `${s.name}: only ${formatStock(s.available, line?.piecesPerBox ?? 1)} available`;
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
      else if (method === "cash" && e.key >= "0" && e.key <= "9") pushDigit(e.key);
      else if (method === "cash" && e.key === "Backspace") setReceived(Math.floor(received / 1000) * 100);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received, canConfirm, userId, lines, method, cashPart, momoRef]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-tape p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-lg font-semibold">Payment</h2>
        <button onClick={onCancel} className="text-sm text-ink/50 hover:text-ink focus:outline-none focus:ring-2 focus:ring-carbon">
          Esc ✕
        </button>
      </div>

      {/* Method selector */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["cash", "momo", "split"] as PaymentMethod[]).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              "h-11 rounded-xl border text-sm font-semibold capitalize focus:outline-none focus:ring-2 focus:ring-carbon",
              method === m ? "border-ledger bg-ledger text-tape" : "border-ink/15 bg-tape text-ink/60 hover:bg-paper"
            )}
          >
            {m === "momo" ? "MoMo" : m}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-ink/60">Total due</span>
        <MoneyText pesewas={totalPesewas} size="xl" currency className="font-semibold" />
      </div>

      {method === "cash" && (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-sm text-ink/60">Received</span>
            <MoneyText pesewas={received} size="xl" />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <button onClick={() => setReceived(totalPesewas)} className="h-12 rounded-xl border border-ledger bg-ledger/5 text-sm font-semibold text-ledger hover:bg-ledger/10">
              Exact
            </button>
            {QUICK_CEDIS.map((c) => (
              <button key={c} onClick={() => setReceived(c * 100)} className="h-12 rounded-xl border border-ink/15 bg-tape text-sm font-semibold hover:bg-paper">
                {c}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"].map((k) => (
              <button
                key={k}
                onClick={() => (k === "⌫" ? setReceived(Math.floor(received / 1000) * 100) : k === "00" ? (pushDigit("0"), pushDigit("0")) : pushDigit(k))}
                className="h-14 rounded-xl border border-ink/10 bg-tape text-xl font-semibold shadow-card hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                {k}
              </button>
            ))}
          </div>
        </>
      )}

      {method === "momo" && (
        <label className="mt-6 block">
          <span className="mb-1 block text-sm text-ink/70">MoMo reference (optional)</span>
          <input
            value={momoRef}
            onChange={(e) => setMomoRef(e.target.value)}
            placeholder="e.g. transaction id"
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <p className="mt-2 text-xs text-ink/50">The shop's MoMo device handles the actual transfer.</p>
        </label>
      )}

      {method === "split" && (
        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Cash part (GHS)</span>
            <input
              value={cashPart}
              onChange={(e) => setCashPart(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-right text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          </label>
          <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-sm">
            <span className="text-ink/60">MoMo part (rest)</span>
            <MoneyText pesewas={Math.max(0, splitMomo)} currency className="text-carbon" />
          </div>
        </div>
      )}

      <div className="mt-auto pt-4">
        {method === "cash" && change >= 0 && received > 0 && (
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
