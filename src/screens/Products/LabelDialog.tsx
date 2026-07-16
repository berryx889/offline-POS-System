// Barcode label printing (pos-prd.md §6.3). Pick products and copies, preview the
// Code-128 labels, and print. Products without a barcode get a shop code assigned
// (so the printed label scans) only when you actually print.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listProductsManage, ensureShopCode, type Product } from "@/db/queries/products";
import { getSettings } from "@/db/queries/settings";
import { printLabels, type LabelSpec } from "@/receipt/labels";
import { Barcode } from "@/components/Barcode";
import { formatGHS } from "@/money";
import { cn } from "@/lib/cn";

// Preview matches ensureShopCode's format so what you see is what prints.
function previewCode(p: Product): string {
  return p.barcode ?? `2${String(p.id).padStart(7, "0")}`;
}

export function LabelDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ["products-manage", "", "", false, false],
    queryFn: () => listProductsManage({}),
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const [copies, setCopies] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selected = useMemo(() => products.filter((p) => copies[p.id] > 0), [products, copies]);

  function toggle(p: Product) {
    setCopies((c) => ({ ...c, [p.id]: c[p.id] > 0 ? 0 : 1 }));
  }
  function selectUnlabeled() {
    const next: Record<number, number> = {};
    for (const p of products) if (!p.barcode) next[p.id] = 1;
    setCopies(next);
  }

  async function print() {
    if (selected.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      const specs: LabelSpec[] = [];
      for (const p of selected) {
        const code = await ensureShopCode(p.id); // persists a code if it had none
        specs.push({ name: p.name, priceText: formatGHS(p.retail_price_pesewas), code, copies: copies[p.id] });
      }
      const res = await printLabels(specs, settings ?? {});
      queryClient.invalidateQueries({ queryKey: ["products-manage"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setStatus(res.method === "thermal" ? "Sent to printer." : "Opened print dialog.");
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

  const totalLabels = selected.reduce((n, p) => n + (copies[p.id] || 0), 0);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-ink/8 bg-tape p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-lg font-semibold text-ink">Print barcode labels</h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink">✕</button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={selectUnlabeled}
            className="h-9 rounded-lg border border-ledger px-3 text-sm font-medium text-ledger hover:bg-ledger/5"
          >
            Select all unlabeled
          </button>
          <button onClick={() => setCopies({})} className="h-9 rounded-lg border border-ink/15 px-3 text-sm text-ink/60 hover:bg-paper">
            Clear
          </button>
          <span className="ml-auto text-sm text-ink/50">{totalLabels} label{totalLabels === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-3 flex-1 overflow-auto rounded-lg border border-ink/8">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-3 py-2 font-medium">Pick</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Preview</th>
                <th className="px-3 py-2 font-medium">Copies</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const picked = copies[p.id] > 0;
                return (
                  <tr key={p.id} className={cn("border-b border-ink/5", picked && "bg-ledger/5")}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={picked} onChange={() => toggle(p)} className="h-4 w-4 accent-ledger" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{p.name}</div>
                      {!p.barcode && <div className="text-xs text-brass">no code — will assign</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink/60">{previewCode(p)}</td>
                    <td className="px-3 py-2">
                      <Barcode value={previewCode(p)} height={30} moduleWidth={1.1} />
                    </td>
                    <td className="px-3 py-2">
                      {picked && (
                        <input
                          type="number"
                          min={1}
                          value={copies[p.id]}
                          onChange={(e) => setCopies((c) => ({ ...c, [p.id]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                          className="w-16 rounded-md border border-ink/15 bg-tape px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {status && <p className="mt-3 text-sm text-ledger">{status}</p>}

        <button
          onClick={print}
          disabled={busy || selected.length === 0}
          className="mt-4 h-12 rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          {busy ? "Printing…" : `Print ${totalLabels} label${totalLabels === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
