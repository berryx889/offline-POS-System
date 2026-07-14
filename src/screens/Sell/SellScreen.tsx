// The cashier's home (pos-prd.md §6.1).
// Slice 1: manual search → cart with PC/BOX pricing and totals.
// Slice 2: always-focused barcode scan capture, quick grid, scan feedback.
// Slice 3: cash tender + the sale committed in one transaction, stock decrement.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchProducts, findByBarcode, type Product } from "@/db/queries/products";
import { getSettings } from "@/db/queries/settings";
import { getSaleDetail, getLastSale, type CommittedSale } from "@/db/queries/sales";
import { printSale } from "@/receipt/print";
import { useCart } from "@/store/cartStore";
import { ReceiptTape } from "@/components/ReceiptTape";
import { MoneyText } from "@/components/MoneyText";
import { CartLineRow } from "./CartLineRow";
import { QuickGrid } from "./QuickGrid";
import { TenderPanel } from "./TenderPanel";
import { beepSuccess, beepError } from "@/lib/sound";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

export function SellScreen() {
  const [term, setTerm] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);
  const [tenderOpen, setTenderOpen] = useState(false);
  const [lastSale, setLastSale] = useState<CommittedSale | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
  const openTender = () => {
    if (useCart.getState().lines.length > 0) setTenderOpen(true);
  };

  useEffect(() => {
    focusScan();
    function onDocClick(e: MouseEvent) {
      if (notFound || tenderOpen) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [data-search]")) return;
      setTimeout(focusScan, 0);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        openTender();
      } else if (e.key === "F6") {
        // Toggle the last cart line between PC and BOX.
        e.preventDefault();
        const { lines: ls, setUnit } = useCart.getState();
        const last = ls[ls.length - 1];
        if (last) setUnit(last.id, last.unit === "piece" ? "box" : "piece");
      } else if (e.key === "F9") {
        e.preventDefault();
        reprintLast();
      }
    }
    document.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [notFound, tenderOpen]);

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

  // F9: reprint the most recent receipt without leaving the sale flow (§6.2).
  async function reprintLast() {
    const [detail, freshSettings] = await Promise.all([getLastSale(), getSettings()]);
    if (detail) await printSale(detail, freshSettings, { reprint: true });
  }

  async function onSaleDone(sale: CommittedSale) {
    setTenderOpen(false);
    setLastSale(sale);
    // Stock changed — refresh reads that depend on it.
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["top-products"] });
    queryClient.invalidateQueries({ queryKey: ["search"] });
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    focusScan();

    // Auto-print the receipt (best-effort; the sale is already committed).
    try {
      const detail = await getSaleDetail(sale.saleId);
      if (detail && settings) await printSale(detail, settings);
    } catch {
      /* printing never blocks the sale */
    }
    setTimeout(() => setLastSale(null), 6000);
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px]">
      {/* Hidden HID scan capture — types like a keyboard, ends with Enter (§8). */}
      <input
        ref={scanRef}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onKeyDown={(e) => {
          if (tenderOpen) return;
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

        {/* Keyboard shortcut hints — cashiers learn these fast (§6.1). */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/40">
          {[
            ["F2", "search"],
            ["F4", "charge"],
            ["F6", "PC/BOX"],
            ["F9", "reprint last"],
            ["Esc", "cancel"],
          ].map(([k, label]) => (
            <span key={k}>
              <kbd className="rounded border border-ink/15 bg-tape px-1.5 py-0.5 font-mono text-[10px] text-ink/60">
                {k}
              </kbd>{" "}
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Right: the receipt-tape cart (relative so the tender panel overlays it) */}
      <aside className="relative flex flex-col bg-paper p-4">
        {lastSale && (
          <div className="mb-2 rounded-xl border border-ledger/30 bg-ledger/5 px-4 py-3 text-sm">
            <span className="font-semibold text-ledger">Sale {lastSale.receiptNo}</span> saved.
            {lastSale.changePesewas > 0 && (
              <>
                {" "}
                Change <MoneyText pesewas={lastSale.changePesewas} currency className="text-brass" />.
              </>
            )}
          </div>
        )}

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
            onClick={openTender}
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

        {tenderOpen && (
          <TenderPanel
            totalPesewas={total}
            onCancel={() => {
              setTenderOpen(false);
              focusScan();
            }}
            onDone={onSaleDone}
          />
        )}
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
