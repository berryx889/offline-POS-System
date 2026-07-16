// The quick grid (pos-prd.md §6.1): large tap targets for the sachet-water-and-
// bread items nobody scans. Ordered by units sold, so the shop's fast movers
// surface first. Styled like the SiMi Shop product cards — green price + a green
// "+" add button. Tapping anywhere on the card adds one piece at retail.

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
            "group flex min-h-[96px] flex-col justify-between rounded-2xl border border-ink/8 bg-tape p-3.5 text-left shadow-card",
            "transition-all hover:-translate-y-0.5 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ledger/40"
          )}
        >
          <span className="font-sans text-sm font-semibold leading-tight text-ink">{p.name}</span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-sm font-semibold text-ledger">
              <MoneyText pesewas={p.retail_price_pesewas} size="sm" className="text-ledger" />
              <span className="ml-0.5 text-xs font-normal text-ink/40">/pc</span>
            </span>
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-ledger text-tape transition-colors group-hover:bg-ledger-deep"
              aria-hidden
            >
              +
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
