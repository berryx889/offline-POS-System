// Phase 1: read-only product table proving the DB → query → UI path works.
// Phase 4 turns this into full CRUD with the add/edit drawer, restock, and import.

import { useQuery } from "@tanstack/react-query";
import { listProducts } from "@/db/queries/products";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";

export function ProductsScreen() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: listProducts,
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 font-sans text-xl font-semibold text-ink">Products</h1>
      <p className="mb-5 text-sm text-ink/50">
        {isLoading ? "Loading…" : `${products.length} active products`}
      </p>

      <div className="overflow-hidden rounded-xl border border-ink/10 bg-tape shadow-card">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="border-b border-ink/10 bg-paper/60 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Retail / pc</th>
              <th className="px-4 py-3 text-right font-medium">Wholesale / box</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stock_pieces <= p.low_stock_threshold;
              return (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-sans font-medium text-ink">
                    {low && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-stamp" />}
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{p.category_name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {formatStock(p.stock_pieces, p.pieces_per_box)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText pesewas={p.retail_price_pesewas} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.wholesale_price_pesewas != null ? (
                      <MoneyText pesewas={p.wholesale_price_pesewas} />
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
