import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listRestocks } from "@/db/queries/restocks";
import { formatGHS } from "@/money";

export function RestockHistoryScreen() {
  const { data: restocks = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["restocks"],
    queryFn: () => listRestocks(100),
  });

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Restock history</h1>
        <Link to="/products" className="flex min-h-12 items-center rounded-xl bg-ledger px-5 font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon">
          Back to products
        </Link>
      </div>
      <p className="mb-4 shrink-0 text-sm text-ink/60">Showing the latest 100 restock entries. Quantities are in pieces.</p>
      {isLoading ? <p role="status">Loading restock history…</p> : isError ? (
        <div role="alert">
          <p>Could not load restock history.</p>
          <button onClick={() => void refetch()} className="mt-3 min-h-12 rounded-xl border border-ink/15 px-4">Try again</button>
        </div>
      ) : (
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-lg font-semibold text-ink">Restock history</h2>
            <p className="text-sm text-ink/50">Original quantities stay fixed; sales reduce each batch's balance.</p>
          </div>
        </div>
        {restocks.length === 0 ? (
          <p className="py-4 text-sm text-ink/40">No restock cycles recorded yet.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
              <thead className="border-b border-ink/8 text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="py-2 pr-3 font-medium">Restock</th>
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 text-right font-medium">Initial</th>
                  <th className="py-2 pr-3 text-right font-medium">Sold</th>
                  <th className="py-2 pr-3 text-right font-medium">Remaining</th>
                  <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                  <th className="py-2 text-right font-medium">Value left</th>
                </tr>
              </thead>
              <tbody>
                {restocks.map((restock) => (
                  <tr key={`${restock.id}-${restock.product_id}`} className="border-b border-ink/5 last:border-0">
                    <td className="py-2 pr-3 font-semibold text-ledger">{restock.restock_no}</td>
                    <td className="py-2 pr-3 text-ink">{restock.product_name}</td>
                    <td className="py-2 pr-3 text-right">{restock.quantity_added}</td>
                    <td className="py-2 pr-3 text-right">{restock.units_sold}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{restock.remaining_quantity}</td>
                    <td className="py-2 pr-3 text-right">{formatGHS(restock.revenue_pesewas)}</td>
                    <td className="py-2 text-right">{formatGHS(restock.remaining_value_pesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}

