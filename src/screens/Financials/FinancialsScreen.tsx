// Financial dashboard (v4). Daily/weekly/monthly/yearly profit, margin, tax,
// sales trend, and cash flow — built on the same sales data as Reports, plus
// hand-entered operating expenses so net margin is a real number, not just
// gross dressed up.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { salesSummary, revenueTrend, type Range } from "@/db/queries/reports";
import { listExpenses, totalExpenses, addExpense } from "@/db/queries/expenses";
import { startOfDay, startOfWeek, startOfMonth, startOfYear, addDays } from "@/lib/dates";
import { useSession } from "@/store/sessionStore";
import { MoneyText } from "@/components/MoneyText";
import { TrendChart } from "@/components/TrendChart";
import { formatPesewas, toPesewas } from "@/money";
import { cn } from "@/lib/cn";

type Period = "daily" | "weekly" | "monthly" | "yearly";

function rangeFor(period: Period): { range: Range; granularity: "day" | "month" } {
  const now = new Date();
  const from =
    period === "daily"
      ? startOfDay(now)
      : period === "weekly"
        ? startOfWeek(now)
        : period === "monthly"
          ? startOfMonth(now)
          : startOfYear(now);
  return {
    range: { from: from.toISOString(), toExclusive: startOfDay(addDays(now, 1)).toISOString() },
    granularity: period === "yearly" ? "month" : "day",
  };
}

export function FinancialsScreen() {
  const user = useSession((s) => s.user);
  const [period, setPeriod] = useState<Period>("monthly");
  const [expCategory, setExpCategory] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { range, granularity } = useMemo(() => rangeFor(period), [period]);
  const key = [period, range.from, range.toExclusive];

  const summary = useQuery({ queryKey: ["fin-summary", ...key], queryFn: () => salesSummary(range) }).data;
  const trend = useQuery({ queryKey: ["fin-trend", ...key], queryFn: () => revenueTrend(range, granularity) }).data ?? [];
  const expenses = useQuery({ queryKey: ["fin-expenses", ...key], queryFn: () => listExpenses(range) }).data ?? [];
  const expensesTotal = useQuery({ queryKey: ["fin-exp-total", ...key], queryFn: () => totalExpenses(range) }).data ?? 0;

  const grossProfit = summary?.profit ?? 0;
  const revenue = summary?.revenue ?? 0;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netProfit = grossProfit - expensesTotal;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  async function submitExpense() {
    setError(null);
    if (!user) return;
    const amount = toPesewas(expAmount);
    if (!expCategory.trim() || !amount) return setError("Category and amount are required.");
    try {
      await addExpense(expCategory, amount, expNote, user.id);
      setExpCategory("");
      setExpAmount("");
      setExpNote("");
      queryClient.invalidateQueries({ queryKey: ["fin-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["fin-exp-total"] });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 font-sans text-xl font-semibold text-ink">Financial dashboard</h1>

      <div className="mb-5 flex gap-2">
        {(["daily", "weekly", "monthly", "yearly"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "h-10 rounded-lg border px-4 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-carbon",
              period === p ? "border-ledger bg-ledger text-tape" : "border-ink/15 bg-tape text-ink/60 hover:bg-paper"
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <Kpi label="Revenue" node={<MoneyText pesewas={revenue} currency className="font-semibold" />} />
        <Kpi label="Gross profit" node={<MoneyText pesewas={grossProfit} currency className="text-ledger font-semibold" />} />
        <Kpi label="Gross margin" node={<span className="text-lg font-semibold tabular-nums">{grossMargin.toFixed(1)}%</span>} />
        <Kpi label="Tax collected" node={<MoneyText pesewas={summary?.taxTotal ?? 0} currency />} />
        <Kpi label="Expenses" node={<MoneyText pesewas={expensesTotal} currency className="text-stamp" />} />
        <Kpi label="Net profit" node={<MoneyText pesewas={netProfit} currency className={netProfit >= 0 ? "text-ledger font-semibold" : "text-stamp font-semibold"} />} />
        <Kpi label="Net margin" node={<span className="text-lg font-semibold tabular-nums">{netMargin.toFixed(1)}%</span>} />
        <Kpi
          label="Cash flow (cash / MoMo)"
          node={
            <span className="text-sm">
              {formatPesewas(summary?.cashTotal ?? 0)} / {formatPesewas(summary?.momoTotal ?? 0)}
            </span>
          }
        />
      </div>

      <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
          Sales trend
        </h2>
        <TrendChart data={trend} />
      </section>

      <section className="rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
        <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
          Expenses
        </h2>
        <ul className="mb-4 divide-y divide-ink/5">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-sans font-medium text-ink">{e.category}</span>
                {e.note && <span className="ml-2 text-ink/50">{e.note}</span>}
              </div>
              <MoneyText pesewas={e.amount_pesewas} className="text-stamp" />
            </li>
          ))}
          {expenses.length === 0 && <p className="py-4 text-center text-sm text-ink/40">No expenses logged in this period.</p>}
        </ul>
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-ink/8 bg-paper p-4">
          <input
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
            placeholder="Category (e.g. Rent, Wages)"
            className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <input
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="Amount (GHS)"
            className="h-10 w-36 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <input
            value={expNote}
            onChange={(e) => setExpNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <button
            onClick={submitExpense}
            className="h-10 rounded-lg bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-stamp">{error}</p>}
      </section>
    </div>
  );
}

function Kpi({ label, node }: { label: string; node: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink/8 bg-tape p-3 shadow-card">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="mt-1">{node}</p>
    </div>
  );
}
