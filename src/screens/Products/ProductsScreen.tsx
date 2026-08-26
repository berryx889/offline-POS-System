// Products management (pos-prd.md §6.3 + v3 variants). Search + category +
// low-stock filters, add/edit drawer, deactivate-vs-delete. Variants sharing a
// `family` render grouped under a family header with an "add variant" shortcut.

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProductsManage,
  listCategories,
  type Product,
  type ProductInput,
} from "@/db/queries/products";
import { ProductDrawer } from "./ProductDrawer";
import { RestockDialog } from "./RestockDialog";
import { ImportDialog } from "./ImportDialog";
import { LabelDialog } from "./LabelDialog";
import { MoneyText } from "@/components/MoneyText";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";
import { listRestocks } from "@/db/queries/restocks";
import { formatGHS } from "@/money";
import { exportStockSnapshot, importStockSnapshot } from "@/exporter/stockTransfer";
import { useSession } from "@/store/sessionStore";

type DrawerState =
  | { mode: "new"; initial?: Partial<ProductInput> }
  | { mode: "edit"; product: Product }
  | null;

/** Rows in display order with family headers injected before each variant group.
 *  The list is already sorted by COALESCE(family, name), so groups are contiguous. */
function withFamilyHeaders(products: Product[]): (Product | { header: string; first: Product; count: number })[] {
  const out: (Product | { header: string; first: Product; count: number })[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p.family && (i === 0 || products[i - 1].family !== p.family)) {
      let count = 0;
      while (i + count < products.length && products[i + count].family === p.family) count++;
      out.push({ header: p.family, first: p, count });
    }
    out.push(p);
  }
  return out;
}

export function ProductsScreen() {
  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const stockFileRef = useRef<HTMLInputElement>(null);
  const userId = useSession((s) => s.user?.id) ?? 0;
  const [stockStatus, setStockStatus] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);

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
  const { data: restocks = [] } = useQuery({
    queryKey: ["restocks"],
    queryFn: () => listRestocks(100),
  });

  async function exportStock() {
    setStockError(null);
    try { setStockStatus(`Exported to ${await exportStockSnapshot() ?? "no file"}.`); }
    catch (e) { setStockError(String(e instanceof Error ? e.message : e)); }
  }

  async function importStock(file: File) {
    setStockError(null);
    try {
      const result = await importStockSnapshot(new Uint8Array(await file.arrayBuffer()), userId);
      setStockStatus(`Imported stock: ${result.updated} updated, ${result.created} created.`);
      queryClient.invalidateQueries({ queryKey: ["products-manage"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (e) { setStockError(String(e instanceof Error ? e.message : e)); }
  }

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
          <button onClick={exportStock} className="h-11 rounded-xl border border-ledger px-4 font-medium text-ledger hover:bg-ledger/5">
            Export stock
          </button>
          <button onClick={() => stockFileRef.current?.click()} className="h-11 rounded-xl border border-ink/15 bg-tape px-4 font-medium text-ink/70 hover:bg-paper">
            Import stock
          </button>
          <input ref={stockFileRef} type="file" accept=".ctstock,application/json" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (file) void importStock(file); e.target.value = "";
          }} />
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
      {(stockStatus || stockError) && <p className={cn("mt-2 text-sm", stockError ? "text-stamp" : "text-ledger")}>{stockError ?? stockStatus}</p>}

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
            {withFamilyHeaders(products).map((row) => {
              if ("header" in row) {
                return (
                  <tr key={`fam-${row.header}`} className="border-b border-ink/5 bg-paper/60">
                    <td colSpan={5} className="px-4 py-2">
                      <span className="font-sans text-sm font-semibold text-ink">{row.header}</span>
                      {row.first.brand && (
                        <span className="ml-2 text-xs text-ink/50">{row.first.brand}</span>
                      )}
                      <span className="ml-2 text-xs text-ink/40">
                        {row.count} variant{row.count === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() =>
                          setDrawer({
                            mode: "new",
                            initial: {
                              family: row.header,
                              brand: row.first.brand,
                              supplier: row.first.supplier,
                              category_id: row.first.category_id,
                            },
                          })
                        }
                        className="rounded-lg border border-ledger px-3 py-1 text-xs font-medium text-ledger hover:bg-ledger/5 focus:outline-none focus:ring-2 focus:ring-carbon"
                      >
                        + Variant
                      </button>
                    </td>
                  </tr>
                );
              }
              const p = row;
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
                  <td className={cn("px-4 py-3 font-sans font-medium text-ink", p.family && "pl-8")}>
                    <span className="flex items-center gap-2">
                      {low && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-stamp" />}
                      {p.image && (
                        <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                      )}
                      <span>
                        {p.name}
                        {p.sku && <span className="ml-2 text-xs font-normal text-ink/40">{p.sku}</span>}
                        {p.active !== 1 && (
                          <span className="ml-2 text-xs uppercase text-ink/40">inactive</span>
                        )}
                      </span>
                    </span>
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

      <section className="mt-5 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-lg font-semibold text-ink">Restock history</h2>
            <p className="text-sm text-ink/50">Original quantities stay fixed; sales reduce each batch's balance.</p>
          </div>
        </div>
        {restocks.length === 0 ? (
          <p className="py-4 text-sm text-ink/40">No restock cycles recorded yet.</p>
        ) : (
          <div className="overflow-auto">
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
                  <tr key={restock.id} className="border-b border-ink/5 last:border-0">
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

      {drawer && (
        <ProductDrawer
          product={drawer.mode === "edit" ? drawer.product : null}
          initial={drawer.mode === "new" ? drawer.initial : undefined}
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
