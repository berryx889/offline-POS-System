// On-screen receipt preview for a committed sale — the same ReceiptTape shell the
// live cart uses (pos-prd.md §9.4: "one component, three uses"). Used in Reprints
// and sale detail. Static: no controls, just the receipt as it printed.

import { ReceiptTape } from "./ReceiptTape";
import { MoneyText } from "./MoneyText";
import type { SaleDetail } from "@/db/queries/sales";
import type { Settings } from "@/db/queries/settings";

function metaDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SaleReceiptView({
  detail,
  settings,
  reprint = false,
}: {
  detail: SaleDetail;
  settings: Settings;
  reprint?: boolean;
}) {
  const { sale, items } = detail;

  const payment =
    sale.payment_method === "cash" ? (
      <>
        <Row label="CASH" pesewas={sale.amount_paid_pesewas} />
        <Row label="CHANGE" pesewas={sale.change_pesewas} />
      </>
    ) : sale.payment_method === "momo" ? (
      <>
        <Row label="MOMO" pesewas={sale.total_pesewas} />
        {sale.momo_reference && (
          <div className="flex justify-between text-xs text-ink/60">
            <span>Ref</span>
            <span>{sale.momo_reference}</span>
          </div>
        )}
      </>
    ) : (
      <>
        <Row label="CASH" pesewas={sale.cash_part_pesewas} />
        <Row label="MOMO" pesewas={sale.momo_part_pesewas} />
      </>
    );

  return (
    <ReceiptTape
      businessName={settings.business_name ?? "CounterTop POS"}
      subtitle={[settings.address, settings.phone].filter(Boolean).join(" — ")}
      banner={reprint ? "*REPRINT*" : undefined}
      subtotalPesewas={sale.subtotal_pesewas}
      totalPesewas={sale.total_pesewas}
      footer={
        <div className="mt-1">
          {sale.discount_pesewas > 0 && <Row label="DISCOUNT" pesewas={sale.discount_pesewas} muted />}
          {payment}
          {settings.receipt_footer && (
            <p className="mt-3 border-t border-dashed border-ink/30 pt-2 text-center text-xs text-ink/60">
              {settings.receipt_footer}
            </p>
          )}
        </div>
      }
    >
      <div className="mb-2 text-xs text-ink/70">
        <div>Receipt: {sale.receipt_no}</div>
        <div>Date: {metaDate(sale.created_at)}</div>
        <div>Cashier: {sale.cashier_name}</div>
      </div>
      <div className="border-t border-dashed border-ink/30 pt-2">
        {items.map((it, i) => (
          <div key={i} className="mb-1">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{it.product_name}</span>
              <span>
                {it.qty} {it.unit === "box" ? "BOX" : "PC"}
              </span>
            </div>
            <div className="flex justify-between text-xs text-ink/60">
              <span>@ <MoneyText pesewas={it.unit_price_pesewas} size="sm" /></span>
              <MoneyText pesewas={it.line_total_pesewas} size="sm" />
            </div>
          </div>
        ))}
      </div>
    </ReceiptTape>
  );
}

function Row({ label, pesewas, muted }: { label: string; pesewas: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${muted ? "text-ink/60" : ""}`}>
      <span>{label}</span>
      <MoneyText pesewas={pesewas} size="sm" />
    </div>
  );
}
