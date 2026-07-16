// Void a sale — manager override (pos-prd.md §2). Requires an admin PIN even when
// a cashier is logged in, plus a reason. Voiding restores stock and audits it.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { verifyAdminPin } from "@/db/queries/users";
import { voidSale } from "@/db/queries/sales";
import { emit } from "@/lib/events";

export function VoidDialog({
  saleId,
  receiptNo,
  onClose,
  onVoided,
}: {
  saleId: number;
  receiptNo: string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    if (!reason.trim()) return setError("Give a reason for the void.");
    setBusy(true);
    const admin = await verifyAdminPin(pin);
    if (!admin) {
      setBusy(false);
      return setError("That admin PIN is not valid.");
    }
    try {
      await voidSale(saleId, admin.id, reason.trim());
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sale", saleId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      emit("sale:completed"); // dashboards/reports depend on sale state
      emit("stock:changed");
      onVoided();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-ink/8 bg-tape p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-sans text-lg font-semibold text-stamp">Void {receiptNo}</h2>
        <p className="mt-1 text-sm text-ink/60">
          This restores the sold stock and can't be undone. An admin PIN is required.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm text-ink/70">Reason</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. wrong item, customer returned"
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm text-ink/70">Admin PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </label>

        {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={confirm}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-stamp font-semibold text-tape hover:opacity-90 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {busy ? "Voiding…" : "Void sale"}
          </button>
          <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-ink/15 text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
