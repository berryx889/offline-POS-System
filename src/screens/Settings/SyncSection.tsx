// Cloud sync status + configuration (v4 scaffolding — see src/sync/). There's
// no backend to point this at yet; this section exists so the seam is visible
// and testable (queue depth, last failure) rather than invisible plumbing.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting } from "@/db/queries/settings";
import { queueStatus } from "@/sync/queue";
import { syncNow } from "@/sync/service";

export function SyncSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: status } = useQuery({ queryKey: ["sync-status"], queryFn: queueStatus, refetchInterval: 5000 });
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const value = endpoint ?? settings?.sync_endpoint_url ?? "";

  async function save() {
    setBusy(true);
    await setSetting("sync_endpoint_url", value.trim());
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    await syncNow();
    queryClient.invalidateQueries({ queryKey: ["sync-status"] });
    setBusy(false);
  }

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Cloud sync
      </h2>
      <p className="mb-3 text-sm text-ink/60">
        Every sale queues locally for sync (see the pending count below). Point this at a sync
        endpoint once one exists to start sending it — until then the app works fully offline and
        nothing leaves this machine.
      </p>
      <div className="mb-3 flex gap-6 text-sm">
        <span className="text-ink/60">
          Pending: <span className="font-semibold text-ink">{status?.pending ?? 0}</span>
        </span>
        {(status?.failedLastAttempt ?? 0) > 0 && (
          <span className="text-stamp">{status!.failedLastAttempt} failed last attempt</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <input
          value={value}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://your-sync-endpoint.example.com/ingest (leave blank to stay fully offline)"
          className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
        />
        <button
          onClick={save}
          disabled={busy}
          className="h-10 rounded-lg bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Save
        </button>
      </div>
    </section>
  );
}
