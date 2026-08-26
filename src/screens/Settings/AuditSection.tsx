// Audit log viewer (pos-prd.md §10). Read-only trail of every price change, void,
// override, PIN reset, and other tracked action.

import { useQuery } from "@tanstack/react-query";
import { listAudit } from "@/db/queries/audit";
import { formatGHS } from "@/money";

const label: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  price_change: "Price change",
  price_override: "Price override",
  discount_override: "Discount override",
  void: "Void",
  pin_reset: "PIN reset",
  user_create: "User added",
  user_activate: "User reactivated",
  user_deactivate: "User deactivated",
  product_deactivate: "Product deactivated",
  product_activate: "Product reactivated",
  product_delete: "Product deleted",
  day_close: "Day closed",
  product_create: "Product added",
  stock_adjustment: "Stock adjusted",
  selling_units_change: "Selling units changed",
  permissions_change: "Permissions changed",
  recovery_set: "Recovery phrase changed",
  expense_add: "Expense added",
  branch_create: "Branch added",
  branch_update: "Branch updated",
  branch_activate: "Branch activated",
  branch_deactivate: "Branch deactivated",
  stock_transfer_request: "Stock transfer requested",
  stock_transfer_approve: "Stock transfer approved",
  stock_transfer_reject: "Stock transfer rejected",
  stock_transfer_complete: "Stock transfer completed",
  credit_limit_override: "Credit limit override",
};

const detailLabel: Record<string, string> = {
  product_id: "Product ID",
  user_id: "User ID",
  sale_id: "Sale ID",
  transfer_id: "Transfer ID",
  branch_id: "Branch ID",
  change_pieces: "Stock change",
  amount_pesewas: "Amount",
  reason: "Reason",
  note: "Note",
  name: "Name",
  role: "Role",
  code: "Code",
  via: "Via",
  changes: "Changes",
  retail: "Retail",
  wholesale: "Wholesale",
  promo: "Promo",
  bulk: "Bulk",
  cost: "Cost",
  permissions: "Permissions",
};

function readableValue(key: string, value: unknown): string {
  if (key.endsWith("_pesewas") && typeof value === "number") return formatGHS(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((item) => typeof item === "number" || item === null)) {
      return value.map((item) => item == null ? "not set" : formatGHS(item)).join(" -> ");
    }
    return value.map((item) => String(item)).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => `${detailLabel[nestedKey] ?? nestedKey}: ${readableValue(nestedKey, nestedValue)}`)
      .join(", ");
  }
  return String(value);
}

function readableDetail(action: string, raw: string | null): string | null {
  if (!raw) return null;
  try {
    const detail: Record<string, unknown> = JSON.parse(raw);
    const parts = Object.entries(detail).map(([key, value]) => {
      const name = detailLabel[key] ?? key.replace(/_/g, " ");
      return `${name}: ${readableValue(key, value)}`;
    });
    return parts.length ? parts.join(" · ") : action === "login" ? "Signed in" : null;
  } catch {
    return raw;
  }
}

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
                {(() => {
                  const detail = readableDetail(e.action, e.detail);
                  return detail ? <p className="truncate text-xs text-ink/40">{detail}</p> : null;
                })()}
              </div>
              <span className="shrink-0 text-xs text-ink/40">{when(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
