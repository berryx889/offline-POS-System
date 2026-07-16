// Dashboard — the live feed (pos-prd.md §6.4). Everything refreshes on the
// sale:completed event, so it moves the moment the cashier finishes a sale.
// Slice 1: today strip, cash position, live feed. Chart / top / low-stock next.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  todaySummary,
  cashPositionToday,
  topProductsToday,
  lowStockProducts,
  hourlyRevenue,
} from "@/db/queries/analytics";
import { listSales, getSaleDetail, type SaleRow } from "@/db/queries/sales";
import { getSettings } from "@/db/queries/settings";
import type { Product } from "@/db/queries/products";
import { todayStartISO, humanDate } from "@/lib/dates";
import { useAppEvent } from "@/lib/useAppEvent";
import { MoneyText } from "@/components/MoneyText";
import { HourlyChart } from "@/components/HourlyChart";
import { SaleReceiptView } from "@/components/SaleReceiptView";
import { RestockDialog } from "@/screens/Products/RestockDialog";
import { formatStock } from "@/stock";
import { cn } from "@/lib/cn";

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const methodLabel: Record<string, string> = { cash: "Cash", momo: "MoMo", split: "Split" };

export function DashboardScreen() {
  const queryClient = useQueryClient();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);

  const { data: summary } = useQuery({ queryKey: ["today-summary"], queryFn: todaySummary });
  const { data: cash } = useQuery({ queryKey: ["cash-position"], queryFn: cashPositionToday });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: hourly = [] } = useQuery({ queryKey: ["hourly"], queryFn: hourlyRevenue });
  const { data: top = [] } = useQuery({ queryKey: ["top-today"], queryFn: () => topProductsToday(10) });
  const { data: lowStock = [] } = useQuery({ queryKey: ["low-stock"], queryFn: lowStockProducts });
  const { data: feed = [] } = useQuery({
    queryKey: ["today-feed"],
    queryFn: () => listSales({ from: todayStartISO(), limit: 50 }),
  });

  // Live: re-query the whole dashboard whenever a sale commits.
  useAppEvent("sale:completed", () => {
    queryClient.invalidateQueries({ queryKey: ["today-summary"] });
    queryClient.invalidateQueries({ queryKey: ["cash-position"] });
    queryClient.invalidateQueries({ queryKey: ["today-feed"] });
    queryClient.invalidateQueries({ queryKey: ["top-today"] });
    queryClient.invalidateQueries({ queryKey: ["hourly"] });
    queryClient.invalidateQueries({ queryKey: ["low-stock"] });
  });
  useAppEvent("stock:changed", () => {
    queryClient.invalidateQueries({ queryKey: ["low-stock"] });
  });

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-sans text-xl font-semibold text-ink">Today</h1>
          <p className="text-sm text-ink/50">{humanDate()}</p>
        </div>
      </div>

      {/* Today strip — revenue is the loud 48px brass figure */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="col-span-2 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
          <p className="text-sm text-ink/50">Revenue</p>
          <MoneyText pesewas={summary?.revenue ?? 0} size="loud" currency className="text-brass" />
        </div>
        <Stat label="Sales" value={String(summary?.salesCount ?? 0)} />
        <Stat label="Items sold" value={String(summary?.itemsSold ?? 0)} />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-6">
        {/* Left column: chart, top products, low stock */}
        <div className="space-y-6">
          <Card title="Hourly sales — today vs last week">
            <HourlyChart data={hourly} />
          </Card>

          <Card title="Gross profit (today)">
            <MoneyText pesewas={summary?.grossProfit ?? 0} size="xl" currency className="text-ledger" />
            <p className="mt-1 text-xs text-ink/50">Revenue minus cost of items sold.</p>
          </Card>

          <Card title="Top products today">
            {top.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/40">No sales yet today.</p>
            ) : (
              <ul className="space-y-1">
                {top.map((t, i) => (
                  <li key={t.product_name} className="flex items-center justify-between py-1 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-right text-ink/40">{i + 1}</span>
                      <span className="font-sans font-medium text-ink">{t.product_name}</span>
                      <span className="text-xs text-ink/50">×{t.qty}</span>
                    </span>
                    <MoneyText pesewas={t.revenue} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right column: cash position + live feed */}
        <div className="space-y-6">
          <Card title="Cash position">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-ink/50">Expected in drawer</p>
                <MoneyText pesewas={cash?.expectedCash ?? 0} size="lg" currency className="font-semibold" />
              </div>
              <div className="text-right">
                <p className="text-xs text-ink/50">MoMo</p>
                <MoneyText pesewas={cash?.momoTotal ?? 0} size="lg" currency className="text-carbon" />
              </div>
            </div>
          </Card>

          <Card title={`Low stock (${lowStock.length})`}>
            {lowStock.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/40">Everything's above threshold.</p>
            ) : (
              <ul className="space-y-1">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-stamp" />
                      <span className="font-sans font-medium text-ink">{p.name}</span>
                      <span className="text-xs text-ink/50">{formatStock(p.stock_pieces, p.pieces_per_box)}</span>
                    </span>
                    <button
                      onClick={() => setRestockTarget(p)}
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-medium text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
                    >
                      Restock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Live feed">
            {feed.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/40">No sales yet today.</p>
            ) : (
              <ul className="max-h-[360px] space-y-1 overflow-auto">
                {feed.map((s) => (
                  <FeedRow key={s.id} sale={s} onClick={() => setPreviewId(s.id)} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {restockTarget && (
        <RestockDialog product={restockTarget} onClose={() => setRestockTarget(null)} />
      )}

      {previewId != null && settings && (
        <SalePreviewModal saleId={previewId} onClose={() => setPreviewId(null)} settings={settings} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <p className="text-sm text-ink/50">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FeedRow({ sale, onClick }: { sale: SaleRow; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
          "motion-safe:animate-[slidein_0.3s_ease-out] hover:bg-ink/[0.03] focus:outline-none focus:ring-2 focus:ring-carbon"
        )}
      >
        <div>
          <span className="font-sans font-semibold text-ink">{sale.receipt_no}</span>
          <span className="ml-2 text-xs text-ink/50">
            {time(sale.created_at)} · {sale.cashier_name} · {methodLabel[sale.payment_method]}
          </span>
        </div>
        <MoneyText pesewas={sale.total_pesewas} />
      </button>
    </li>
  );
}

function SalePreviewModal({
  saleId,
  onClose,
  settings,
}: {
  saleId: number;
  onClose: () => void;
  settings: Record<string, string>;
}) {
  const { data: detail } = useQuery({
    queryKey: ["sale", saleId],
    queryFn: () => getSaleDetail(saleId),
  });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="w-80" onClick={(e) => e.stopPropagation()}>
        {detail && <SaleReceiptView detail={detail} settings={settings} />}
      </div>
    </div>
  );
}
