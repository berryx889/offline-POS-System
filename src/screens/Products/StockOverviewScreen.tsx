import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { currentStock, listRestocks, restockMovements, stockMovementHistory, stockOverview } from "@/db/queries/restocks";
import { formatGHS } from "@/money";
import { cn } from "@/lib/cn";

type Tab = "overview" | "stock" | "restocks" | "movement" | "history";

export function StockOverviewScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedRestock, setSelectedRestock] = useState<number | null>(null);
  const [movementType, setMovementType] = useState("all");
  const [movementSearch, setMovementSearch] = useState("");
  const overview = useQuery({ queryKey: ["stock-overview"], queryFn: stockOverview });
  const stock = useQuery({ queryKey: ["current-stock"], queryFn: currentStock });
  const restocks = useQuery({ queryKey: ["restocks"], queryFn: () => listRestocks(200) });
  const movement = useQuery({ queryKey: ["stock-movement-history"], queryFn: () => stockMovementHistory(200) });
  const restockDetail = useQuery({
    queryKey: ["restock-movements", selectedRestock],
    queryFn: () => restockMovements(selectedRestock!),
    enabled: selectedRestock != null,
  });
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" }, { id: "stock", label: "Current stock" },
    { id: "restocks", label: "Restocks" }, { id: "movement", label: "Sales / movement" },
    { id: "history", label: "History" },
  ];
  const data = overview.data;
  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="font-sans text-xl font-semibold text-ink">Stock overview</h1>
      <div className="mt-4 flex flex-wrap gap-1 border-b border-ink/8">
        {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={cn("px-4 py-3 text-sm font-medium", tab === item.id ? "border-b-2 border-ledger text-ledger" : "text-ink/50")}>{item.label}</button>)}
      </div>
      {tab === "overview" && <Overview data={data} />}
      {tab === "stock" && <StockTable rows={stock.data ?? []} />}
      {(tab === "restocks" || tab === "history") && <RestockTable rows={restocks.data ?? []} onSelect={setSelectedRestock} />}
      {tab === "movement" && <MovementTable rows={movement.data ?? []} type={movementType} search={movementSearch} onTypeChange={setMovementType} onSearchChange={setMovementSearch} />}
      {selectedRestock != null && <RestockDetail restock={restocks.data?.find((r) => r.id === selectedRestock)} rows={restockDetail.data ?? []} onClose={() => setSelectedRestock(null)} />}
    </div>
  );
}

function Overview({ data }: { data: ReturnType<typeof stockOverview> extends Promise<infer T> ? T | undefined : never }) {
  const cards = data ? [
    ["Total stock added", `${data.total_added} units`], ["Initial stock value", formatGHS(data.initial_value_pesewas)],
    ["Stock remaining", `${data.remaining} units`], ["Remaining value", formatGHS(data.remaining_value_pesewas)],
    ["Units sold", `${data.units_sold} units`], ["Sales revenue", formatGHS(data.revenue_pesewas)],
    ["Gross profit", formatGHS(data.gross_profit_pesewas)], ["Products", String(data.product_count)],
  ] : [];
  return <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-ink/8 bg-tape p-4 shadow-card"><p className="text-xs text-ink/50">{label}</p><p className="mt-2 font-mono text-lg font-semibold tabular-nums text-ink">{value}</p></div>)}</div>;
}

function StockTable({ rows }: { rows: Awaited<ReturnType<typeof currentStock>> }) {
  return <Table headers={["Product", "SKU", "Category", "Initial", "Current", "Cost", "Selling", "Initial value", "Current value", "Status"]} rows={rows.map((r) => [r.name, r.sku ?? "—", r.category_name ?? "—", r.initial_quantity, r.current_quantity, formatGHS(r.cost_price_pesewas), formatGHS(r.selling_price_pesewas), formatGHS(r.initial_value_pesewas), formatGHS(r.current_value_pesewas), r.current_quantity <= r.low_stock_threshold ? "Low stock" : "In stock"])} />;
}

function RestockTable({ rows, onSelect }: { rows: Awaited<ReturnType<typeof listRestocks>>; onSelect?: (id: number) => void }) {
  return <Table onRowClick={onSelect ? (row) => onSelect(rows[row].id) : undefined} headers={["Restock", "Date", "Product", "Initial", "Sold", "Remaining", "Cost", "Revenue", "Value left", "Created by"]} rows={rows.map((r) => [r.restock_no, new Date(r.restock_date).toLocaleDateString("en-GB"), r.product_name, r.quantity_added, r.units_sold, r.remaining_quantity, formatGHS(r.total_cost_pesewas), formatGHS(r.revenue_pesewas), formatGHS(r.remaining_value_pesewas), r.created_by_name])} />;
}

function MovementTable({ rows, type, search, onTypeChange, onSearchChange }: { rows: Awaited<ReturnType<typeof stockMovementHistory>>; type: string; search: string; onTypeChange: (value: string) => void; onSearchChange: (value: string) => void }) {
  const filtered = rows.filter((r) => (type === "all" || r.action === type) && (!search || `${r.product_name} ${r.category_name ?? ""} ${r.user_name}`.toLowerCase().includes(search.toLowerCase())));
  return <><div className="mt-5 flex flex-wrap gap-3"><input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search product, category, or user" className="h-10 min-w-[260px] flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm" /><select value={type} onChange={(e) => onTypeChange(e.target.value)} className="h-10 rounded-lg border border-ink/15 bg-tape px-3 text-sm"><option value="all">All transaction types</option><option>Stock added</option><option>Restock</option><option>sale</option><option>return</option><option>adjustment</option></select></div><Table headers={["Date", "Product", "Category", "Action", "Quantity", "Value", "User"]} rows={filtered.map((r) => [new Date(r.created_at).toLocaleString("en-GB"), r.product_name, r.category_name ?? "—", r.action, r.quantity > 0 ? `+${r.quantity}` : r.quantity, formatGHS(r.value_pesewas), r.user_name])} /></>;
}

function RestockDetail({ restock, rows, onClose }: { restock: Awaited<ReturnType<typeof listRestocks>>[number] | undefined; rows: Awaited<ReturnType<typeof restockMovements>>; onClose: () => void }) {
  if (!restock) return null;
  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}><div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl bg-tape p-6 shadow-card" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="font-sans text-lg font-semibold text-ink">{restock.restock_no} · {restock.product_name}</h2><p className="mt-1 text-sm text-ink/50">Original {restock.quantity_added} units · {formatGHS(restock.total_cost_pesewas)} · created by {restock.created_by_name}</p></div><button onClick={onClose} className="text-ink/50">Close</button></div><div className="mt-5"><Table headers={["Date", "Action", "Quantity", "Value", "User"]} rows={rows.map((r) => [new Date(r.created_at).toLocaleString("en-GB"), r.action, r.quantity, formatGHS(r.value_pesewas), r.user_name])} /></div></div></div>;
}

function Table({ headers, rows, onRowClick }: { headers: string[]; rows: (string | number)[][]; onRowClick?: (index: number) => void }) {
  return <div className="mt-5 overflow-auto rounded-2xl border border-ink/8 bg-tape shadow-card"><table className="w-full min-w-[900px] text-left text-sm tabular-nums"><thead className="border-b border-ink/8 bg-paper text-xs uppercase tracking-wide text-ink/50"><tr>{headers.map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} onClick={() => onRowClick?.(index)} className={cn("border-b border-ink/5 last:border-0", onRowClick && "cursor-pointer hover:bg-leaf")}>{row.map((cell, i) => <td key={i} className="px-3 py-3 text-ink/70">{cell}</td>)}</tr>)}</tbody></table></div>;
}