// The cashier's home (pos-prd.md §6.1).
// Slice 1: manual search → cart with PC/BOX pricing and totals.
// Slice 2: always-focused barcode scan capture, quick grid, scan feedback.
// Cash tender + the sale transaction arrive in slice 3.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchProducts, findByBarcode, type Product } from "@/db/queries/products";
import { getSettings } from "@/db/queries/settings";
import { useCart } from "@/store/cartStore";
import { ReceiptTape } from "@/components/ReceiptTape";
import { MoneyText } from "@/components/MoneyText";
import { CartLineRow } from "./CartLineRow";
import { QuickGrid } from "./QuickGrid";
import { beepSuccess, beepError } from "@/lib/sound";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

export function SellScreen() {
  const [term, setTerm] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const soundOn = settings?.sound_enabled !== "0";
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

  const focusScan = () => scanRef.current?.focus();

  // The scan input stays focused so a scan is never lost to a stray click. We keep
  // it out of the way of deliberate typing: clicks on any input/search area don't
  // get yanked back (pos-prd.md §6.1 focus rule, made humane).
  useEffect(() => {
    focusScan();
    function onDocClick(e: MouseEvent) {
      if (notFound) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [data-search]")) return;
      setTimeout(focusScan, 0);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [notFound]);

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    const product = await findByBarcode(trimmed);
    if (product) {
      add(product, "piece");
      beepSuccess(soundOn);
    } else {
      beepError(soundOn);
      setNotFound(trimmed);
    }
    focusScan();
  }

  function pick(p: Product) {
    add(p, "piece");
    beepSuccess(soundOn);
    setTerm("");
    focusScan();
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px]">
      {/* Hidden HID scan capture — types like a keyboard, ends with Enter (§8). */}
      <input
        ref={scanRef}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const el = e.currentTarget;
            handleScan(el.value);
            el.value = "";
          }
        }}
      />

      {/* Left: search + (results | quick grid) */}
      <section className="flex flex-col overflow-hidden p-5">
        <input
          ref={searchRef}
          data-search
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0]);
            if (e.key === "Escape") {
              setTerm("");
              focusScan();
            }
          }}
          placeholder="Search products by name or category…  (F2)"
          className="h-14 w-full rounded-xl border border-ink/15 bg-tape px-4 text-lg shadow-card focus:outline-none focus:ring-2 focus:ring-carbon"
        />

        <div className="mt-4 flex-1 overflow-auto">
          {term.trim().length === 0 ? (
            <QuickGrid onPick={pick} />
          ) : results.length === 0 ? (
            <div className="pt-8 text-center text-sm text-ink/40">
              No products match “{term}”.
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pick(p)}
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

      {/* Unregistered barcode modal — shows the code verbatim (§9.7). */}
      {notFound && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-tape p-6 shadow-card">
            <p className="text-sm text-ink/60">Barcode not registered</p>
            <p className="my-2 font-mono text-lg font-semibold text-ink">{notFound}</p>
            <p className="text-sm text-ink/60">
              Search for it manually, or register it in Products.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setNotFound(null);
                  setTerm("");
                  searchRef.current?.focus();
                }}
                className="h-11 flex-1 rounded-xl bg-ledger text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                Search manually
              </button>
              <button
                onClick={() => {
                  setNotFound(null);
                  focusScan();
                }}
                className="h-11 flex-1 rounded-xl border border-ink/15 text-sm text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
