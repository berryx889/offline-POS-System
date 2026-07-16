// Products management (pos-prd.md §6.3). Search + category + low-stock filters,
// add/edit drawer, deactivate-vs-delete. Restock and Excel import come next.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProductsManage, listCategories, type Product } from "@/db/queries/products";
import { ProductDrawer } from "./ProductDrawer";
import { RestockDialog } from "./RestockDialog";
import { ImportDialog } from "./ImportDialog";
import { LabelDialog } from "./LabelDialog";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

type DrawerState = { mode: "new" } | { mode: "edit"; product: Product } | null;

export function ProductsScreen() {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [labeling, setLabeling] = useState(false);

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-manage", text, categoryId, lowStockOnly, includeInactive],
    queryFn: () =>
      listProductsManage({
        text,
        categoryId: categoryId ? Number(categoryId) : null,
        lowStockOnly,
        includeInactive,
      }),
  });

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-sans text-xl font-semibold text-ink">Products</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLabeling(true)}
            className="h-11 rounded-xl border border-ink/15 bg-tape px-4 font-medium text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            Print labels
          </button>
          <button
            onClick={() => setImporting(true)}
            className="h-11 rounded-xl border border-ink/15 bg-tape px-4 font-medium text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            Import Excel
          </button>
          <button
            onClick={() => setDrawer({ mode: "new" })}
            className="h-11 rounded-xl bg-ledger px-5 font-semibold text-tape shadow-card hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            + Add product
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name, barcode, or category…"
          className="h-10 min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Chip active={lowStockOnly} onClick={() => setLowStockOnly((v) => !v)}>
          Low stock
        </Chip>
        <Chip active={includeInactive} onClick={() => setIncludeInactive((v) => !v)}>
          Show inactive
        </Chip>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl border border-ink/8 bg-tape shadow-card">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="sticky top-0 border-b border-ink/8 bg-paper/95 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Retail / pc</th>
              <th className="px-4 py-3 text-right font-medium">Wholesale / box</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stock_pieces <= p.low_stock_threshold;
              return (
                <tr
                  key={p.id}
                  onClick={() => setDrawer({ mode: "edit", product: p })}
                  className={cn(
                    "cursor-pointer border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]",
                    p.active !== 1 && "opacity-50"
                  )}
                >
                  <td className="px-4 py-3 font-sans font-medium text-ink">
                    {low && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-stamp" />}
                    {p.name}
                    {p.active !== 1 && (
                      <span className="ml-2 text-xs uppercase text-ink/40">inactive</span>
                    )}
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRestockTarget(p);
                      }}
                      className="rounded-lg border border-ink/15 px-3 py-1 text-xs font-medium text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
                    >
                      Restock
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink/40">
                  No products found. Add your first product, or clear the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {drawer && (
        <ProductDrawer
          product={drawer.mode === "edit" ? drawer.product : null}
          onClose={() => setDrawer(null)}
        />
      )}
      {restockTarget && (
        <RestockDialog product={restockTarget} onClose={() => setRestockTarget(null)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {labeling && <LabelDialog onClose={() => setLabeling(false)} />}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-carbon",
        active ? "border-ledger bg-ledger text-tape" : "border-ink/15 bg-tape text-ink/60 hover:bg-paper"
      )}
    >
      {children}
    </button>
  );
}
