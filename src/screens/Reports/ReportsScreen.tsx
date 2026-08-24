// Reports (pos-prd.md §6.5). Date-range summaries, breakdowns by product /
// category / cashier, the voided-sales log and stock movements, plus Excel export.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  salesSummary,
  salesByProduct,
  salesByCategory,
  salesByCashier,
  voidedSales,
  stockMovements,
  inventoryValuation,
  slowMovers,
  stockAlerts,
  smartInventory,
  type Range,
} from "@/db/queries/reports";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  addDays,
  rangeFromDates,
  parseLocalDate,
  toDateInput,
} from "@/lib/dates";
import { exportReportsToExcel } from "@/exporter/reports";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";
import { useSession } from "@/store/sessionStore";
import { cn } from "@/lib/cn";

type Preset = "today" | "week" | "month" | "custom";
type Tab =
  | "product"
  | "category"
  | "cashier"
  | "voided"
  | "movements"
  | "valuation"
  | "slow"
  | "alerts"
  | "smart";

export function ReportsScreen() {
  const canExport = useSession((s) => s.can("export_reports"));
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(toDateInput(startOfDay()));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [tab, setTab] = useState<Tab>("product");

  const { range, label } = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { range: rangeFor(startOfDay(now), now), label: "Today" };
    if (preset === "week") return { range: rangeFor(startOfWeek(now), now), label: "This week" };
    if (preset === "month") return { range: rangeFor(startOfMonth(now), now), label: "This month" };
    const r = rangeFromDates(parseLocalDate(customFrom), parseLocalDate(customTo));
    return { range: r, label: `${customFrom} to ${customTo}` };
  }, [preset, customFrom, customTo]);

  const key = [range.from, range.toExclusive];
  const summary = useQuery({ queryKey: ["rep-summary", ...key], queryFn: () => salesSummary(range) }).data;
  const byProduct = useQuery({ queryKey: ["rep-product", ...key], queryFn: () => salesByProduct(range) }).data ?? [];
  const byCategory = useQuery({ queryKey: ["rep-category", ...key], queryFn: () => salesByCategory(range) }).data ?? [];
  const byCashier = useQuery({ queryKey: ["rep-cashier", ...key], queryFn: () => salesByCashier(range) }).data ?? [];
  const voided = useQuery({ queryKey: ["rep-voided", ...key], queryFn: () => voidedSales(range) }).data ?? [];
  const movements = useQuery({ queryKey: ["rep-moves", ...key], queryFn: () => stockMovements(range) }).data ?? [];
  const valuation = useQuery({ queryKey: ["rep-valuation"], queryFn: inventoryValuation }).data;
  const slow = useQuery({ queryKey: ["rep-slow", ...key], queryFn: () => slowMovers(range) }).data ?? [];
  const alerts = useQuery({ queryKey: ["rep-alerts"], queryFn: stockAlerts }).data;
  const smart = useQuery({ queryKey: ["rep-smart"], queryFn: smartInventory }).data ?? [];

  function exportExcel() {
    if (!summary) return;
    exportReportsToExcel({
      rangeLabel: label,
      summary,
      byProduct,
      byCategory,
      byCashier,
      voided,
      valuation: valuation ?? { rows: [], totalCost: 0, totalRetail: 0 },
      slowMovers: slow,
      stockAlerts: alerts ?? { low: [], out: [] },
    });
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-sans text-xl font-semibold text-ink">Reports</h1>
        {canExport && (
          <button
            onClick={exportExcel}
            className="h-11 rounded-xl border border-ledger px-5 font-semibold text-ledger hover:bg-ledger/5 focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            Export to Excel
          </button>
        )}
      </div>

      {/* Range picker */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["today", "week", "month", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={cn(
              "h-10 rounded-lg border px-4 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-carbon",
              preset === p ? "border-ledger bg-ledger text-tape" : "border-ink/15 bg-tape text-ink/60 hover:bg-paper"
            )}
          >
            {p === "week" ? "This week" : p === "month" ? "This month" : p}
          </button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 rounded-lg border border-ink/15 bg-tape px-3 text-sm" />
            <span className="text-ink/40">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 rounded-lg border border-ink/15 bg-tape px-3 text-sm" />
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-6 gap-3">
        <SummaryCard label="Revenue" node={<MoneyText pesewas={summary?.revenue ?? 0} currency className="font-semibold" />} />
        <SummaryCard label="Sales" node={<span className="tabular-nums text-lg">{summary?.count ?? 0}</span>} />
        <SummaryCard label="Avg sale" node={<MoneyText pesewas={summary?.avgSale ?? 0} currency />} />
        <SummaryCard label="Profit" node={<MoneyText pesewas={summary?.profit ?? 0} currency className="text-ledger" />} />
        <SummaryCard label="Cash" node={<MoneyText pesewas={summary?.cashTotal ?? 0} currency />} />
        <SummaryCard label="MoMo" node={<MoneyText pesewas={summary?.momoTotal ?? 0} currency className="text-carbon" />} />
      </div>

      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-1 border-b border-ink/8">
        {(
          [
            ["product", "By product"],
            ["category", "By category"],
            ["cashier", "By cashier"],
            ["voided", "Voided"],
            ["movements", "Stock movements"],
            ["valuation", "Valuation"],
            ["slow", "Slow movers"],
            ["alerts", "Stock alerts"],
            ["smart", "Smart inventory"],
          ] as [Tab, string][]
        ).map(([t, tabLabel]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium focus:outline-none",
              tab === t ? "border-b-2 border-ledger text-ledger" : "text-ink/50 hover:text-ink"
            )}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-ink/8 bg-tape shadow-card">
        {tab === "product" && (
          <Table headers={["Product", "Qty", "Revenue", "Profit"]} rows={byProduct.map((r) => [r.product_name, r.qty, <MoneyText pesewas={r.revenue} />, <MoneyText pesewas={r.profit} />])} />
        )}
        {tab === "category" && (
          <Table headers={["Category", "Qty", "Revenue"]} rows={byCategory.map((r) => [r.category, r.qty, <MoneyText pesewas={r.revenue} />])} />
        )}
        {tab === "cashier" && (
          <Table headers={["Cashier", "Sales", "Revenue"]} rows={byCashier.map((r) => [r.cashier, r.count, <MoneyText pesewas={r.revenue} />])} />
        )}
        {tab === "voided" && (
          <Table
            headers={["Receipt", "Cashier", "Voided by", "Reason", "Total"]}
            rows={voided.map((r) => [r.receipt_no, r.cashier, r.voided_by_name ?? "—", r.void_reason ?? "—", <MoneyText pesewas={r.total_pesewas} />])}
            empty="No voided sales in this period."
          />
        )}
        {tab === "movements" && (
          <Table
            headers={["Product", "Change", "Reason", "By", "When"]}
            rows={movements.map((m) => [
              m.product_name,
              <span className={m.change_pieces < 0 ? "text-stamp" : "text-ledger"}>
                {m.change_pieces > 0 ? "+" : ""}
                {formatStock(Math.abs(m.change_pieces), 1)}
              </span>,
              m.reason,
              m.user_name ?? "—",
              new Date(m.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
            ])}
            empty="No stock movements in this period."
          />
        )}
        {tab === "valuation" && (
          <>
            <div className="flex gap-6 border-b border-ink/8 px-4 py-3 text-sm">
              <span className="text-ink/60">
                At cost: <MoneyText pesewas={valuation?.totalCost ?? 0} currency className="font-semibold" />
              </span>
              <span className="text-ink/60">
                At retail: <MoneyText pesewas={valuation?.totalRetail ?? 0} currency className="font-semibold text-ledger" />
              </span>
            </div>
            <Table
              headers={["Product", "Stock (pcs)", "At cost", "At retail"]}
              rows={(valuation?.rows ?? []).map((r) => [
                r.name,
                r.stock_pieces,
                <MoneyText pesewas={r.cost_value} />,
                <MoneyText pesewas={r.retail_value} />,
              ])}
              empty="No stock on hand."
            />
          </>
        )}
        {tab === "slow" && (
          <Table
            headers={["Product", "Stock (pcs)", "Sold (pcs)", "Last sold"]}
            rows={slow.map((r) => [
              r.name,
              r.stock_pieces,
              r.pieces_sold,
              r.last_sold
                ? new Date(r.last_sold).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                : "never",
            ])}
            empty="Everything moved in this period."
          />
        )}
        {tab === "alerts" && (
          <div className="grid grid-cols-2 divide-x divide-ink/8">
            <div>
              <p className="border-b border-ink/8 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-stamp">
                Out of stock ({alerts?.out.length ?? 0})
              </p>
              <Table
                headers={["Product", "Reorder level"]}
                rows={(alerts?.out ?? []).map((r) => [r.name, r.low_stock_threshold])}
                empty="Nothing is out of stock."
              />
            </div>
            <div>
              <p className="border-b border-ink/8 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brass">
                Low stock ({alerts?.low.length ?? 0})
              </p>
              <Table
                headers={["Product", "Stock", "Reorder level"]}
                rows={(alerts?.low ?? []).map((r) => [r.name, r.stock_pieces, r.low_stock_threshold])}
                empty="Nothing is low."
              />
            </div>
          </div>
        )}
        {tab === "smart" && (
          <Table
            headers={["Product", "Avg/day (30d)", "Days left", "Suggest reorder", "Trend"]}
            rows={smart.map((r) => [
              r.name,
              r.avg_daily_sales,
              r.days_remaining ?? "—",
              r.suggested_reorder_pieces > 0 ? formatStock(r.suggested_reorder_pieces, r.pieces_per_box) : "—",
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                  r.classification === "fast" && "bg-ledger/15 text-ledger-deep",
                  r.classification === "slow" && "bg-brass/15 text-brass",
                  r.classification === "dead" && "bg-stamp/15 text-stamp"
                )}
              >
                {r.classification}
              </span>,
            ])}
            empty="No active products."
          />
        )}
      </div>
    </div>
  );
}

function rangeFor(from: Date, to: Date): Range {
  return { from: from.toISOString(), toExclusive: startOfDay(addDays(to, 1)).toISOString() };
}

function SummaryCard({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink/8 bg-tape p-3 shadow-card">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="mt-1">{node}</p>
    </div>
  );
}

function Table({
  headers,
  rows,
  empty = "No data in this period.",
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <table className="w-full text-left text-sm tabular-nums">
      <thead className="sticky top-0 border-b border-ink/8 bg-paper/95 text-xs uppercase tracking-wide text-ink/50">
        <tr>
          {headers.map((h, i) => (
            <th key={h} className={cn("px-4 py-3 font-medium", i > 0 && i >= headers.length - 1 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-4 py-10 text-center text-sm text-ink/40">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((cells, i) => (
            <tr key={i} className="border-b border-ink/5 last:border-0">
              {cells.map((c, j) => (
                <td key={j} className={cn("px-4 py-2.5", j === cells.length - 1 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
