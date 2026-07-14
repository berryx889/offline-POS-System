// The cashier's home (pos-prd.md §6.1). Slice 1: manual search → add to the live
// receipt-tape cart, with PC/BOX pricing, qty edit, and totals. Scan capture, the
// quick grid, and cash tender arrive in the next slices.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchProducts, type Product } from "@/db/queries/products";
import { getSettings } from "@/db/queries/settings";
import { useCart } from "@/store/cartStore";
import { ReceiptTape } from "@/components/ReceiptTape";
import { MoneyText } from "@/components/MoneyText";
import { CartLineRow } from "./CartLineRow";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

export function SellScreen() {
  const [term, setTerm] = useState("");
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: results = [] } = useQuery({
    queryKey: ["search", term],
    queryFn: () => searchProducts(term),
    enabled: term.trim().length > 0,
  });

  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart((s) => s.subtotal());
  const total = subtotal; // discounts land in Phase 6

  function addAndReset(p: Product) {
    add(p, "piece");
    setTerm("");
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px]">
      {/* Left: search + results */}
      <section className="flex flex-col overflow-hidden p-5">
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search products by name or category…  (F2)"
          className="h-14 w-full rounded-xl border border-ink/15 bg-tape px-4 text-lg shadow-card focus:outline-none focus:ring-2 focus:ring-carbon"
        />

        <div className="mt-4 flex-1 overflow-auto">
          {term.trim().length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-ink/40">
              Start typing to find a product. Barcode scanning and the quick grid
              come next.
            </div>
          ) : results.length === 0 ? (
            <div className="pt-8 text-center text-sm text-ink/40">
              No products match “{term}”.
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => addAndReset(p)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border border-ink/10 bg-tape px-4 py-3 text-left shadow-card",
                      "transition-colors hover:bg-ledger/5 focus:outline-none focus:ring-2 focus:ring-carbon"
                    )}
                  >
                    <div>
                      <div className="font-sans font-semibold text-ink">{p.name}</div>
                      <div className="text-xs text-ink/50">
                        {p.category_name ?? "—"} · {formatStock(p.stock_pieces, p.pieces_per_box)} in stock
                      </div>
                    </div>
                    <div className="text-right">
                      <MoneyText pesewas={p.retail_price_pesewas} /> <span className="text-xs text-ink/40">/pc</span>
                      {p.wholesale_price_pesewas != null && (
                        <div className="text-xs text-ink/50">
                          <MoneyText pesewas={p.wholesale_price_pesewas} size="sm" /> /box
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Right: the receipt-tape cart */}
      <aside className="flex flex-col bg-paper p-4">
        <div className="flex-1 overflow-hidden">
          <ReceiptTape
            businessName={settings?.business_name ?? "CounterTop POS"}
            subtitle={settings?.address}
            subtotalPesewas={lines.length ? subtotal : undefined}
            totalPesewas={lines.length ? total : undefined}
          >
            {lines.length === 0 ? (
              <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-ink/40">
                Scan an item or press F2 to search.
              </div>
            ) : (
              lines.map((l) => <CartLineRow key={l.id} line={l} />)
            )}
          </ReceiptTape>
        </div>

        {/* Actions */}
        <div className="mt-3 space-y-2">
          <button
            disabled={lines.length === 0}
            className={cn(
              "flex h-14 w-full items-center justify-between rounded-xl bg-ledger px-5 text-tape shadow-card",
              "transition-colors hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
            )}
          >
            <span className="text-lg font-semibold">Charge</span>
            <MoneyText pesewas={total} size="lg" currency className="font-semibold" />
          </button>
          {lines.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear the whole sale?")) clear();
              }}
              className="h-10 w-full rounded-xl text-sm text-ink/50 hover:text-stamp focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              Clear sale
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
