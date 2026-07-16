// Add/edit variant drawer (pos-prd.md §6.3 + v3 product model). Each row is a
// sellable variant; variants group under a `family` ("Milo"). Retail (per PC),
// wholesale (per BOX), bulk (per PC at qty) and promo are independent prices.
// Stock is set here only as OPENING stock on create; on edit it's read-only and
// changed through Restock, which writes a movement.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  updateProduct,
  listCategories,
  listFamilies,
  ensureCategory,
  setProductActive,
  deleteProduct,
  productSalesCount,
  ensureShopCode,
  listAliases,
  addAlias,
  removeAlias,
  type Product,
  type ProductInput,
} from "@/db/queries/products";
import { useSession } from "@/store/sessionStore";
import { toPesewas, formatPesewas } from "@/money";
import { formatStock } from "@/stock";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";

const money = (p: number | null) => (p == null ? "" : formatPesewas(p));

/** Downscale a picked image to a small square thumbnail data-URL so the DB stays
 *  light. 96px is plenty for list/grid thumbnails on a counter screen. */
async function toThumbnail(file: File, size = 96): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // Cover-crop: scale the shorter side to `size`, center the overflow.
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProductDrawer({
  product,
  initial,
  onClose,
}: {
  product: Product | null;
  /** Prefill for "Add variant": family/brand/supplier/category copied from a sibling. */
  initial?: Partial<ProductInput>;
  onClose: () => void;
}) {
  const isEdit = product != null;
  const userId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: families = [] } = useQuery({ queryKey: ["families"], queryFn: listFamilies });
  const barcodeRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [family, setFamily] = useState(product?.family ?? initial?.family ?? "");
  const [brand, setBrand] = useState(product?.brand ?? initial?.brand ?? "");
  const [supplier, setSupplier] = useState(product?.supplier ?? initial?.supplier ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [image, setImage] = useState<string | null>(product?.image ?? null);
  const [categoryId, setCategoryId] = useState<string>(
    product?.category_id != null
      ? String(product.category_id)
      : initial?.category_id != null
        ? String(initial.category_id)
        : ""
  );
  const [newCategory, setNewCategory] = useState("");
  const [piecesPerBox, setPiecesPerBox] = useState(String(product?.pieces_per_box ?? 1));
  const [retail, setRetail] = useState(money(product?.retail_price_pesewas ?? null));
  const [wholesale, setWholesale] = useState(money(product?.wholesale_price_pesewas ?? null));
  const [bulk, setBulk] = useState(money(product?.bulk_price_pesewas ?? null));
  const [bulkMinQty, setBulkMinQty] = useState(
    product?.bulk_min_qty != null ? String(product.bulk_min_qty) : "12"
  );
  const [promo, setPromo] = useState(money(product?.promo_price_pesewas ?? null));
  const [cost, setCost] = useState(money(product?.cost_price_pesewas ?? null));
  const [openingStock, setOpeningStock] = useState("0");
  const [threshold, setThreshold] = useState(String(product?.low_stock_threshold ?? 10));
  const [expiry, setExpiry] = useState(product?.expiry_date ?? "");
  const [batch, setBatch] = useState(product?.batch_number ?? "");
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
    queryClient.invalidateQueries({ queryKey: ["families"] });
    emit("stock:changed");
  }

  async function pickImage(file: File | null) {
    if (!file) return;
    try {
      setImage(await toThumbnail(file));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const retailP = toPesewas(retail);
    if (retailP <= 0) return setError("Retail price is required.");
    const ppb = Math.max(1, parseInt(piecesPerBox, 10) || 1);
    const bulkP = bulk.trim() ? toPesewas(bulk) : null;

    setBusy(true);
    try {
      let catId: number | null = categoryId ? Number(categoryId) : null;
      if (newCategory.trim()) catId = await ensureCategory(newCategory);

      const input: ProductInput = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        sku: sku.trim() || null,
        family: family.trim() || null,
        brand: brand.trim() || null,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        image,
        category_id: catId,
        pieces_per_box: ppb,
        retail_price_pesewas: retailP,
        wholesale_price_pesewas: wholesale.trim() ? toPesewas(wholesale) : null,
        promo_price_pesewas: promo.trim() ? toPesewas(promo) : null,
        bulk_price_pesewas: bulkP,
        bulk_min_qty: bulkP != null ? Math.max(2, parseInt(bulkMinQty, 10) || 12) : null,
        cost_price_pesewas: cost.trim() ? toPesewas(cost) : null,
        low_stock_threshold: Math.max(0, parseInt(threshold, 10) || 0),
        expiry_date: expiry.trim() || null,
        batch_number: batch.trim() || null,
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
        <div className="flex items-center justify-between border-b border-ink/8 bg-tape px-5 py-4">
          <h2 className="font-sans text-lg font-semibold text-ink">
            {isEdit ? "Edit product" : initial?.family ? `Add variant — ${initial.family}` : "Add product"}
          </h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <L label="Name">
                <In value={name} onChange={setName} autoFocus={!isEdit} placeholder="e.g. Milo 400g Tin" />
              </L>
            </div>
            {/* Image thumbnail picker */}
            <div className="shrink-0">
              <span className="mb-1 block text-sm text-ink/70">Image</span>
              <input
                ref={imageRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-lg border border-ink/15 bg-tape text-lg text-ink/30 hover:bg-paper"
                title={image ? "Change image" : "Add image"}
              >
                {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : "+"}
              </button>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="mt-1 block text-[11px] text-ink/40 hover:text-stamp"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <L label="Product family (groups variants, e.g. “Milo”)">
            <In value={family} onChange={setFamily} placeholder="optional" list="family-options" />
            <datalist id="family-options">
              {families.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </L>

          <div className="grid grid-cols-2 gap-3">
            <L label="Brand">
              <In value={brand} onChange={setBrand} placeholder="optional" />
            </L>
            <L label="Supplier">
              <In value={supplier} onChange={setSupplier} placeholder="optional" />
            </L>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="SKU">
              <In value={sku} onChange={setSku} placeholder="optional" />
            </L>
            <L label="Barcode">
              <div className="flex gap-1">
                <input
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault(); // scanner Enter must not submit
                  }}
                  placeholder="Scan or type"
                  className="w-full min-w-0 rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
                />
                {isEdit && !barcode.trim() && (
                  <button
                    type="button"
                    onClick={async () => setBarcode(await ensureShopCode(product!.id))}
                    title="Mint an internal shop code for unlabeled goods, then print it from Labels"
                    className="shrink-0 rounded-lg border border-ledger px-2 text-xs font-medium text-ledger hover:bg-ledger/5"
                  >
                    Generate
                  </button>
                )}
              </div>
            </L>
          </div>

          {isEdit && <AliasEditor productId={product!.id} userId={userId} />}

          <L label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="optional"
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            />
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

          <SectionRule label="Pricing" />

          <div className="grid grid-cols-2 gap-3">
            <L label="Retail price / PC (GHS)">
              <In value={retail} onChange={setRetail} placeholder="0.00" />
            </L>
            <L label="Wholesale / BOX (GHS)">
              <In value={wholesale} onChange={setWholesale} placeholder="optional" />
            </L>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Wholesale / PC (GHS)">
              <In value={bulk} onChange={setBulk} placeholder="optional" />
            </L>
            <L label="…from qty (pcs)">
              <In value={bulkMinQty} onChange={setBulkMinQty} type="number" />
            </L>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Promo price / PC (GHS)">
              <In value={promo} onChange={setPromo} placeholder="optional" />
            </L>
            <L label="Cost price / PC (GHS)">
              <In value={cost} onChange={setCost} placeholder="optional" />
            </L>
          </div>

          <SectionRule label="Stock" />

          <div className="grid grid-cols-2 gap-3">
            <L label="Pieces per box">
              <In value={piecesPerBox} onChange={setPiecesPerBox} type="number" />
            </L>
            <L label="Reorder level (pcs)">
              <In value={threshold} onChange={setThreshold} type="number" />
            </L>
          </div>

          {isEdit ? (
            <div className="rounded-lg border border-ink/8 bg-tape px-3 py-2 text-sm text-ink/60">
              Current stock: {formatStock(product!.stock_pieces, product!.pieces_per_box)} — change it with Restock.
            </div>
          ) : (
            <L label="Opening stock (pieces)">
              <In value={openingStock} onChange={setOpeningStock} type="number" />
            </L>
          )}

          <div className="grid grid-cols-2 gap-3">
            <L label="Expiry date">
              <In value={expiry} onChange={setExpiry} type="date" />
            </L>
            <L label="Batch number">
              <In value={batch} onChange={setBatch} placeholder="optional" />
            </L>
          </div>

          {error && <p className="text-sm font-medium text-stamp">{error}</p>}
        </div>

        <div className="border-t border-ink/8 bg-tape px-5 py-4">
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

/** Extra barcodes that resolve to this variant (v3 §6 — suppliers change codes).
 *  Add by scanning into the input; each alias removes individually. */
function AliasEditor({ productId, userId }: { productId: number; userId: number }) {
  const queryClient = useQueryClient();
  const { data: aliases = [] } = useQuery({
    queryKey: ["aliases", productId],
    queryFn: () => listAliases(productId),
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await addAlias(productId, code, userId);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["aliases", productId] });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="rounded-lg border border-ink/8 bg-tape px-3 py-2">
      <span className="block text-sm text-ink/70">Barcode aliases</span>
      <p className="mt-0.5 text-xs text-ink/40">
        Other codes that load this product (e.g. a supplier's changed barcode).
      </p>
      {aliases.length > 0 && (
        <ul className="mt-2 space-y-1">
          {aliases.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="font-mono text-ink/80">{a.barcode}</span>
              <button
                type="button"
                onClick={async () => {
                  await removeAlias(a.id, userId);
                  queryClient.invalidateQueries({ queryKey: ["aliases", productId] });
                }}
                className="text-ink/30 hover:text-stamp"
                aria-label={`Remove alias ${a.barcode}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // scanner Enter adds instead of submitting
              add();
            }
          }}
          placeholder="Scan or type another code"
          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-tape px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
        />
        <button
          type="button"
          onClick={add}
          disabled={!code.trim()}
          className="shrink-0 rounded-lg border border-ledger px-3 text-xs font-medium text-ledger hover:bg-ledger/5 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-stamp">{error}</p>}
    </div>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</span>
      <div className="h-px flex-1 bg-ink/8" />
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
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  list?: string;
}) {
  return (
    <input
      value={value}
      type={type}
      autoFocus={autoFocus}
      placeholder={placeholder}
      list={list}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-carbon"
      )}
    />
  );
}
