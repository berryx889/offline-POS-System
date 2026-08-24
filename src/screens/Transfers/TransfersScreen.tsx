// Stock transfers between branches (v4, pos-prd-style §7 extension). Never a
// manual stock edit — request, manager approval, then mark received.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTransfers,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  completeTransfer,
  type StockTransfer,
} from "@/db/queries/transfers";
import { listActiveBranches } from "@/db/queries/branches";
import { listProducts } from "@/db/queries/products";
import { useSession } from "@/store/sessionStore";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

const STATUS_STYLE: Record<StockTransfer["status"], string> = {
  pending: "bg-brass/15 text-brass",
  approved: "bg-carbon/15 text-carbon",
  completed: "bg-ledger/15 text-ledger-deep",
  rejected: "bg-stamp/15 text-stamp",
};

export function TransfersScreen() {
  const user = useSession((s) => s.user);
  const canApprove = useSession((s) => s.can("approve_transfers"));
  const queryClient = useQueryClient();
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers"], queryFn: () => listTransfers() });
  const { data: branches = [] } = useQuery({ queryKey: ["active-branches"], queryFn: listActiveBranches });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: listProducts });

  const [productId, setProductId] = useState<number | "">("");
  const [toBranchId, setToBranchId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["transfers"] });

  const selectedProduct = products.find((p) => p.id === productId);

  async function submit() {
    setError(null);
    if (!user || !productId || !toBranchId) return setError("Pick a product and destination branch.");
    if (!selectedProduct?.branch_id) return setError("This product has no source branch.");
    const qtyN = parseInt(qty, 10);
    if (!qtyN || qtyN <= 0) return setError("Enter a quantity in pieces.");
    try {
      await requestTransfer(productId, selectedProduct.branch_id, toBranchId, qtyN, reason, user.id);
      setProductId("");
      setToBranchId("");
      setQty("");
      setReason("");
      refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function doApprove(id: number) {
    if (!user) return;
    try {
      await approveTransfer(id, user.id);
      refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function doReject(id: number) {
    if (!user || !rejectReason.trim()) return;
    await rejectTransfer(id, user.id, rejectReason.trim());
    setRejecting(null);
    setRejectReason("");
    refresh();
  }

  async function doReceive(id: number) {
    if (!user) return;
    try {
      await completeTransfer(id, user.id);
      refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 font-sans text-xl font-semibold text-ink">Stock transfers</h1>

      <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
          New transfer
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Product</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatStock(p.stock_pieces, p.pieces_per_box)} available)
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Destination branch</span>
            <select
              value={toBranchId}
              onChange={(e) => setToBranchId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              <option value="">Select a branch…</option>
              {branches
                .filter((b) => b.id !== selectedProduct?.branch_id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Quantity (pieces)</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              type="number"
              min={1}
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink/70">Reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. restock new branch"
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          </label>
        </div>
        <button
          onClick={submit}
          className="mt-4 h-11 rounded-xl bg-ledger px-6 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Submit request
        </button>
        {error && <p className="mt-2 text-sm font-medium text-stamp">{error}</p>}
      </section>

      <section className="rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
          History
        </h2>
        <ul className="divide-y divide-ink/5">
          {transfers.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs text-ink/40">{t.transfer_no}</span>
                  <span className="ml-2 font-sans font-medium text-ink">{t.product_name}</span>
                  <span className="ml-2 text-sm text-ink/60">
                    {t.qty_pieces} pcs: {t.from_branch_name} → {t.to_branch_name}
                  </span>
                </div>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold uppercase", STATUS_STYLE[t.status])}>
                  {t.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink/50">
                Requested by {t.requested_by_name} on {new Date(t.created_at).toLocaleDateString()}
                {t.reason && ` — ${t.reason}`}
                {t.status === "rejected" && t.rejected_reason && ` — rejected: ${t.rejected_reason}`}
              </p>
              {t.status === "pending" && canApprove && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => doApprove(t.id)}
                    className="rounded-lg bg-ledger px-3 py-1.5 text-xs font-semibold text-tape hover:bg-ledger-deep"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejecting(rejecting === t.id ? null : t.id)}
                    className="rounded-lg border border-stamp/30 px-3 py-1.5 text-xs font-semibold text-stamp hover:bg-stamp/5"
                  >
                    Reject
                  </button>
                </div>
              )}
              {rejecting === t.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejecting"
                    className="flex-1 rounded-lg border border-ink/15 bg-tape px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
                  />
                  <button
                    onClick={() => doReject(t.id)}
                    className="rounded-lg bg-stamp px-3 py-1.5 text-xs font-semibold text-tape hover:opacity-90"
                  >
                    Confirm reject
                  </button>
                </div>
              )}
              {t.status === "approved" && canApprove && (
                <button
                  onClick={() => doReceive(t.id)}
                  className="mt-2 rounded-lg bg-carbon px-3 py-1.5 text-xs font-semibold text-tape hover:opacity-90"
                >
                  Mark received at destination
                </button>
              )}
            </li>
          ))}
          {transfers.length === 0 && (
            <p className="py-6 text-center text-sm text-ink/40">No transfers yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
