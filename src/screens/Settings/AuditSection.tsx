// Audit log viewer (pos-prd.md §10). Read-only trail of every price change, void,
// override, PIN reset, and other tracked action.

import { useQuery } from "@tanstack/react-query";
import { listAudit } from "@/db/queries/audit";

const label: Record<string, string> = {
  price_change: "Price change",
  void: "Void",
  pin_reset: "PIN reset",
  user_create: "User added",
  user_activate: "User reactivated",
  user_deactivate: "User deactivated",
  product_deactivate: "Product deactivated",
  product_activate: "Product reactivated",
  product_delete: "Product deleted",
  day_close: "Day closed",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditSection() {
  const { data: entries = [] } = useQuery({ queryKey: ["audit"], queryFn: () => listAudit(200) });

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Audit log
      </h2>
      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink/40">Nothing logged yet.</p>
      ) : (
        <ul className="max-h-96 space-y-1 overflow-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-ink/5 py-2 last:border-0">
              <div className="min-w-0">
                <span className="font-medium text-ink">{label[e.action] ?? e.action}</span>
                <span className="ml-2 text-xs text-ink/50">{e.user_name ?? "—"}</span>
                {e.detail && (
                  <p className="truncate font-mono text-xs text-ink/40">{e.detail}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-ink/40">{when(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
