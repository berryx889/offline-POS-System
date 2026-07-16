// End of day (pos-prd.md §6.6). A closing ritual: today's totals, expected drawer
// cash, counted cash → over/short, top products, and a printed Z-report. Closing
// records a day_close audit entry with the counted figure; it locks nothing.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { todaySummary, cashPositionToday, topProductsToday } from "@/db/queries/analytics";
import { getSettings } from "@/db/queries/settings";
import { logAudit } from "@/db/queries/audit";
import { useSession } from "@/store/sessionStore";
import { humanDate } from "@/lib/dates";
import { toPesewas } from "@/money";
import { buildDayReportText } from "@/receipt/dayReport";
import { printPlainText } from "@/receipt/print";
import { MoneyText } from "@/components/MoneyText";
import { cn } from "@/lib/cn";

export function EndOfDayScreen() {
  const user = useSession((s) => s.user);
  const [counted, setCounted] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: summary } = useQuery({ queryKey: ["today-summary"], queryFn: todaySummary });
  const { data: cash } = useQuery({ queryKey: ["cash-position"], queryFn: cashPositionToday });
  const { data: top = [] } = useQuery({ queryKey: ["top-today"], queryFn: () => topProductsToday(10) });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const countedPesewas = toPesewas(counted || "0");
  const expected = cash?.expectedCash ?? 0;
  const overShort = countedPesewas - expected;
  const hasCount = counted.trim().length > 0;

  async function closeDay() {
    if (!summary || !cash || !settings || !user) return;
    setBusy(true);
    await logAudit(user.id, "day_close", {
      date: new Date().toISOString(),
      revenue: summary.revenue,
      sales: summary.salesCount,
      expected_cash: expected,
      counted_cash: countedPesewas,
      over_short: overShort,
    });
    await printPlainText(
      buildDayReportText(
        {
          dateLabel: humanDate(),
          summary,
          cash,
          top,
          countedCashPesewas: countedPesewas,
          cashierName: user.name,
        },
        settings
      ),
      settings
    );
    setBusy(false);
    setStatus("Day closed and summary printed.");
    setTimeout(() => setStatus(null), 4000);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="font-sans text-xl font-semibold text-ink">End of day</h1>
      <p className="mb-6 text-sm text-ink/50">{humanDate()}</p>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Revenue" value={<MoneyText pesewas={summary?.revenue ?? 0} currency className="font-semibold" />} />
        <Stat label="Sales" value={<span className="tabular-nums">{summary?.salesCount ?? 0}</span>} />
        <Stat label="Items" value={<span className="tabular-nums">{summary?.itemsSold ?? 0}</span>} />
        <Stat label="Gross profit" value={<MoneyText pesewas={summary?.grossProfit ?? 0} currency className="text-ledger font-semibold" />} />
      </div>

      <div className="mt-6 rounded-2xl border border-ink/8 bg-tape p-6 shadow-card">
        <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
          Drawer reconciliation
        </h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Line label="Expected cash in drawer">
              <MoneyText pesewas={expected} currency className="font-semibold" />
            </Line>
            <Line label="MoMo total (not in drawer)">
              <MoneyText pesewas={cash?.momoTotal ?? 0} currency className="text-carbon" />
            </Line>
            <label className="block pt-2">
              <span className="mb-1 block text-sm text-ink/70">Counted cash (GHS)</span>
              <input
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-right text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
              />
            </label>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl bg-paper p-6">
            <span className="text-sm text-ink/60">{overShort < 0 ? "Short" : "Over / balanced"}</span>
            <MoneyText
              pesewas={Math.abs(overShort)}
              size="loud"
              className={cn(hasCount && overShort < 0 ? "text-stamp" : "text-ledger")}
            />
            {!hasCount && <span className="mt-1 text-xs text-ink/40">Enter the counted cash</span>}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={closeDay}
          disabled={busy || !hasCount}
          className="h-12 rounded-xl bg-ledger px-8 font-semibold text-tape shadow-card hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          {busy ? "Closing…" : "Close day & print summary"}
        </button>
        {status && <span className="text-sm text-ledger">{status}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-tape p-4 shadow-card">
      <p className="text-sm text-ink/50">{label}</p>
      <p className="mt-1 text-lg">{value}</p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink/60">{label}</span>
      {children}
    </div>
  );
}
