// Reprints (pos-prd.md §6.2). Searchable list of sales → receipt preview →
// Reprint (adds a *REPRINT* banner so duplicates are identifiable).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSales, getSaleDetail } from "@/db/queries/sales";
import { getSettings } from "@/db/queries/settings";
import { printSale } from "@/receipt/print";
import { SaleReceiptView } from "@/components/SaleReceiptView";
import { MoneyText } from "@/components/MoneyText";
import { cn } from "@/lib/cn";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReprintsScreen() {
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reprinting, setReprinting] = useState(false);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales", text],
    queryFn: () => listSales({ text }),
  });
  const { data: detail } = useQuery({
    queryKey: ["sale", selectedId],
    queryFn: () => getSaleDetail(selectedId!),
    enabled: selectedId != null,
  });

  async function reprint() {
    if (!detail || !settings) return;
    setReprinting(true);
    await printSale(detail, settings, { reprint: true });
    setReprinting(false);
  }

  return (
    <div className="grid h-full grid-cols-[1fr_400px]">
      {/* Left: search + list */}
      <section className="flex flex-col overflow-hidden p-6">
        <h1 className="mb-4 font-sans text-xl font-semibold text-ink">Reprints</h1>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by receipt number, cashier, or product…"
          className="h-12 w-full rounded-xl border border-ink/15 bg-tape px-4 shadow-card focus:outline-none focus:ring-2 focus:ring-carbon"
        />

        <div className="mt-4 flex-1 overflow-auto">
          {sales.length === 0 ? (
            <div className="pt-8 text-center text-sm text-ink/40">
              {text ? "No sales match your search." : "No sales yet."}
            </div>
          ) : (
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="py-2 font-medium">Receipt</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Cashier</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "cursor-pointer border-b border-ink/5",
                      selectedId === s.id ? "bg-ledger/10" : "hover:bg-ink/[0.03]"
                    )}
                  >
                    <td className="py-2 font-sans font-semibold text-ink">
                      {s.receipt_no}
                      {s.status === "voided" && (
                        <span className="ml-2 text-xs font-medium text-stamp">VOID</span>
                      )}
                    </td>
                    <td className="py-2 text-ink/60">{shortDate(s.created_at)}</td>
                    <td className="py-2 text-ink/60">{s.cashier_name}</td>
                    <td className="py-2 text-right">
                      <MoneyText pesewas={s.total_pesewas} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Right: receipt preview */}
      <aside className="flex flex-col bg-paper p-4">
        {detail && settings ? (
          <>
            <div className="flex-1 overflow-hidden">
              <SaleReceiptView detail={detail} settings={settings} />
            </div>
            <button
              onClick={reprint}
              disabled={reprinting}
              className="mt-3 h-14 w-full rounded-xl bg-ledger text-lg font-semibold text-tape shadow-card transition-colors hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              {reprinting ? "Printing…" : "Reprint receipt"}
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink/40">
            Select a sale to preview its receipt.
          </div>
        )}
      </aside>
    </div>
  );
}
