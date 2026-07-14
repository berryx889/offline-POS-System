// Add/edit product drawer (pos-prd.md §6.3). Retail (per PC) and wholesale (per
// BOX) are independent prices. Stock is set here only as OPENING stock on create;
// on edit it's read-only and changed through Restock, which writes a movement.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  updateProduct,
  listCategories,
  ensureCategory,
  setProductActive,
  deleteProduct,
  productSalesCount,
  type Product,
  type ProductInput,
} from "@/db/queries/products";
import { useSession } from "@/store/sessionStore";
import { toPesewas, formatPesewas } from "@/money";
import { formatStock } from "@/stock";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";

const money = (p: number | null) => (p == null ? "" : formatPesewas(p));

export function ProductDrawer({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const isEdit = product != null;
  const userId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ? String(product.category_id) : "");
  const [newCategory, setNewCategory] = useState("");
  const [piecesPerBox, setPiecesPerBox] = useState(String(product?.pieces_per_box ?? 1));
  const [retail, setRetail] = useState(money(product?.retail_price_pesewas ?? null));
  const [wholesale, setWholesale] = useState(money(product?.wholesale_price_pesewas ?? null));
  const [cost, setCost] = useState(money(product?.cost_price_pesewas ?? null));
  const [openingStock, setOpeningStock] = useState("0");
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [salesCount, setSalesCount] = useState<number | null>(null);

  useEffect(() => {
    if (product) productSalesCount(product.id).then(setSalesCount);
  }, [product]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["products-manage"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["top-products"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    emit("stock:changed");
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const retailP = toPesewas(retail);
    if (retailP <= 0) return setError("Retail price is required.");
    const ppb = Math.max(1, parseInt(piecesPerBox, 10) || 1);

    setBusy(true);
    try {
      let catId: number | null = categoryId ? Number(categoryId) : null;
      if (newCategory.trim()) catId = await ensureCategory(newCategory);

      const input: ProductInput = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        category_id: catId,
        pieces_per_box: ppb,
        retail_price_pesewas: retailP,
        wholesale_price_pesewas: wholesale.trim() ? toPesewas(wholesale) : null,
        cost_price_pesewas: cost.trim() ? toPesewas(cost) : null,
        low_stock_threshold: Math.max(0, parseInt(threshold, 10) || 0),
      };

      if (isEdit) {
        await updateProduct(product!.id, input, userId);
      } else {
        await createProduct(input, Math.max(0, parseInt(openingStock, 10) || 0), userId);
      }
      refresh();
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!product) return;
    await setProductActive(product.id, product.active !== 1, userId);
    refresh();
    onClose();
  }

  async function remove() {
    if (!product) return;
    if (!confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteProduct(product.id, userId);
      refresh();
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 bg-tape px-5 py-4">
          <h2 className="font-sans text-lg font-semibold text-ink">
            {isEdit ? "Edit product" : "Add product"}
          </h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          <L label="Name">
            <In value={name} onChange={setName} autoFocus={!isEdit} />
          </L>

          <L label="Barcode">
            <div className="flex gap-2">
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault(); // scanner Enter must not submit
                }}
                placeholder="Scan or type"
                className="flex-1 rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
              />
              <button
                type="button"
                onClick={() => barcodeRef.current?.focus()}
                className="rounded-lg border border-ledger px-3 text-sm font-medium text-ledger hover:bg-ledger/5"
              >
                Scan to fill
              </button>
            </div>
          </L>

          <L label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="…or type a new category"
              className="mt-2 w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          </L>

          <div className="grid grid-cols-2 gap-3">
            <L label="Pieces per box">
              <In value={piecesPerBox} onChange={setPiecesPerBox} type="number" />
            </L>
            <L label="Low-stock threshold (pcs)">
              <In value={threshold} onChange={setThreshold} type="number" />
            </L>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Retail price / PC (GHS)">
              <In value={retail} onChange={setRetail} placeholder="0.00" />
            </L>
            <L label="Wholesale / BOX (GHS)">
              <In value={wholesale} onChange={setWholesale} placeholder="optional" />
            </L>
          </div>

          <L label="Cost price / PC (GHS, admin only)">
            <In value={cost} onChange={setCost} placeholder="optional" />
          </L>

          {isEdit ? (
            <div className="rounded-lg border border-ink/10 bg-tape px-3 py-2 text-sm text-ink/60">
              Current stock: {formatStock(product!.stock_pieces, product!.pieces_per_box)} — change it with Restock.
            </div>
          ) : (
            <L label="Opening stock (pieces)">
              <In value={openingStock} onChange={setOpeningStock} type="number" />
            </L>
          )}

          {error && <p className="text-sm font-medium text-stamp">{error}</p>}
        </div>

        <div className="border-t border-ink/10 bg-tape px-5 py-4">
          <button
            onClick={save}
            disabled={busy}
            className="h-12 w-full rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Add product"}
          </button>
          {isEdit && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button onClick={toggleActive} className="font-medium text-carbon hover:underline">
                {product!.active === 1 ? "Deactivate" : "Reactivate"}
              </button>
              {salesCount === 0 && (
                <button onClick={remove} className="font-medium text-stamp hover:underline">
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink/70">{label}</span>
      {children}
    </label>
  );
}

function In({
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      type={type}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-carbon"
      )}
    />
  );
}
