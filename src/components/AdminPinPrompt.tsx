// Manager-override prompt (pos-prd.md §6.1). Asks for an admin PIN even when a
// cashier is logged in, then hands back the admin who authorized it. Used for
// discounts above the threshold and line price overrides.

import { useState } from "react";
import { verifyAdminPin, type User } from "@/db/queries/users";

export function AdminPinPrompt({
  title,
  detail,
  onVerified,
  onCancel,
}: {
  title: string;
  detail?: string;
  onVerified: (admin: User) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    const admin = await verifyAdminPin(pin);
    setBusy(false);
    if (admin) onVerified(admin);
    else {
      setError("That admin PIN is not valid.");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-6" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-tape p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-sans text-lg font-semibold text-ink">{title}</h2>
        {detail && <p className="mt-1 text-sm text-ink/60">{detail}</p>}
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="Admin PIN"
          className="mt-4 w-full rounded-lg border border-ink/15 bg-tape px-3 py-2.5 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
        />
        {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={check}
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {busy ? "Checking…" : "Authorize"}
          </button>
          <button onClick={onCancel} className="h-11 flex-1 rounded-xl border border-ink/15 text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
