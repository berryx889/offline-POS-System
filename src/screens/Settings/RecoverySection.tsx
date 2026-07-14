// Recovery phrase (pos-prd.md §2, §6.7). The admin sets a phrase that can reset
// any forgotten PIN from the login screen. Stored hashed.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasRecoveryPhrase, setRecoveryPhrase } from "@/db/queries/recovery";
import { useSession } from "@/store/sessionStore";

export function RecoverySection() {
  const actorId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const { data: isSet } = useQuery({ queryKey: ["recovery-set"], queryFn: hasRecoveryPhrase });

  const [phrase, setPhrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (phrase.trim().length < 6) return setError("Use at least 6 characters.");
    if (phrase !== confirmPhrase) return setError("The phrases don't match.");
    await setRecoveryPhrase(phrase, actorId);
    setPhrase("");
    setConfirmPhrase("");
    setStatus("Recovery phrase saved.");
    queryClient.invalidateQueries({ queryKey: ["recovery-set"] });
    setTimeout(() => setStatus(null), 3000);
  }

  return (
    <section className="mb-6 rounded-2xl border border-ink/10 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Recovery phrase
      </h2>
      <p className="mb-4 text-sm text-ink/60">
        {isSet
          ? "A recovery phrase is set. Enter a new one below to change it."
          : "Set a phrase you'll remember. It can reset any forgotten PIN from the login screen. Keep it private."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-sm text-ink/70">{isSet ? "New phrase" : "Recovery phrase"}</span>
          <input
            type="password"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-sm text-ink/70">Confirm</span>
          <input
            type="password"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </label>
        <button
          onClick={save}
          className="h-10 rounded-lg bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Save
        </button>
      </div>
      {status && <p className="mt-2 text-sm text-ledger">{status}</p>}
      {error && <p className="mt-2 text-sm font-medium text-stamp">{error}</p>}
    </section>
  );
}
