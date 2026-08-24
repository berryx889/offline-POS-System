// Multi-branch management (v4). Every branch has its own products/sales/users
// (branch_id on each), combined on the Dashboard once there's more than one.
// "This terminal's branch" picks which branch NEW products/sales here get
// tagged with — the one thing a single physical machine has to decide.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listBranches,
  createBranch,
  setBranchActive,
  getCurrentBranchId,
  setCurrentBranchId,
} from "@/db/queries/branches";
import { useSession } from "@/store/sessionStore";
import { cn } from "@/lib/cn";

export function BranchesSection() {
  const actorId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: listBranches });
  const { data: currentBranchId } = useQuery({
    queryKey: ["current-branch-id"],
    queryFn: getCurrentBranchId,
  });

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["branches"] });
    queryClient.invalidateQueries({ queryKey: ["current-branch-id"] });
    queryClient.invalidateQueries({ queryKey: ["main-branch"] });
  };

  async function add() {
    setError(null);
    if (!name.trim() || !code.trim()) return setError("Name and code are required.");
    try {
      await createBranch(name, code, location || null, actorId);
      setName("");
      setCode("");
      setLocation("");
      refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Branches
      </h2>

      <ul className="mb-5 divide-y divide-ink/5">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-3">
            <div>
              <span className="font-sans font-medium text-ink">{b.name}</span>
              <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">{b.code}</span>
              {b.location && <span className="ml-2 text-xs text-ink/40">{b.location}</span>}
              {b.active !== 1 && <span className="ml-2 text-xs text-stamp">inactive</span>}
              {b.id === currentBranchId && (
                <span className="ml-2 rounded-full bg-leaf px-2 py-0.5 text-xs font-medium text-ledger-deep">
                  This terminal
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              {b.id !== currentBranchId && (
                <button
                  onClick={async () => {
                    await setCurrentBranchId(b.id);
                    refresh();
                  }}
                  className="font-medium text-carbon hover:underline"
                >
                  Use for this terminal
                </button>
              )}
              <button
                onClick={async () => {
                  await setBranchActive(b.id, b.active !== 1, actorId);
                  refresh();
                }}
                className="font-medium text-ink/60 hover:underline"
              >
                {b.active === 1 ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-ink/8 bg-paper p-4">
        <p className="mb-3 text-sm font-medium text-ink">Add branch</p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code (e.g. SUNY2)"
            className="h-10 w-40 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <button
            onClick={add}
            className={cn(
              "h-10 rounded-lg bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
            )}
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-stamp">{error}</p>}
      </div>
    </section>
  );
}
