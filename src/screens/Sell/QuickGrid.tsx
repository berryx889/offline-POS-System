// The quick grid (pos-prd.md §6.1): large tap targets for the sachet-water-and-
// bread items nobody scans. Ordered by units sold, so the shop's fast movers
// surface first. Tapping adds one piece at retail.

import { useQuery } from "@tanstack/react-query";
import { topProducts, type Product } from "@/db/queries/products";
import { MoneyText } from "@/components/MoneyText";
import { cn } from "@/lib/cn";

export function QuickGrid({ onPick }: { onPick: (p: Product) => void }) {
  const { data: products = [] } = useQuery({
    queryKey: ["top-products"],
    queryFn: () => topProducts(24),
  });

  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-ink/40">
        No products yet. Add products or import from Excel.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
      {products.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className={cn(
            "flex min-h-[88px] flex-col justify-between rounded-xl border border-ink/10 bg-tape p-3 text-left shadow-card",
            "transition-colors hover:bg-ledger/5 focus:outline-none focus:ring-2 focus:ring-carbon"
          )}
        >
          <span className="font-sans text-sm font-semibold leading-tight text-ink">{p.name}</span>
          <span className="mt-2 text-xs text-ink/60">
            <MoneyText pesewas={p.retail_price_pesewas} size="sm" /> /pc
          </span>
        </button>
      ))}
    </div>
  );
}
