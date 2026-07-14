// The end-of-day Z-report as fixed-width text (pos-prd.md §6.6). Reuses the same
// print pipeline as receipts (thermal ESC/POS or HTML fallback).

import { formatPesewas, formatGHS } from "@/money";
import type { Settings } from "@/db/queries/settings";
import type { TodaySummary, CashPosition, TopProduct } from "@/db/queries/analytics";

export interface DayReportData {
  dateLabel: string;
  summary: TodaySummary;
  cash: CashPosition;
  top: TopProduct[];
  countedCashPesewas: number;
  cashierName: string;
}

export function buildDayReportText(data: DayReportData, settings: Settings): string {
  const width = settings.paper_width === "58" ? 32 : 42;
  const center = (s: string) => (s.length >= width ? s : " ".repeat(Math.floor((width - s.length) / 2)) + s);
  const lr = (l: string, r: string) => {
    const gap = width - l.length - r.length;
    return gap < 1 ? `${l} ${r}` : l + " ".repeat(gap) + r;
  };
  const rule = "-".repeat(width);
  const overShort = data.countedCashPesewas - data.cash.expectedCash;

  const lines: string[] = [];
  if (settings.business_name) lines.push(center(settings.business_name.toUpperCase()));
  lines.push(center("END OF DAY — Z REPORT"));
  lines.push(center(data.dateLabel));
  lines.push(rule);
  lines.push(lr("Revenue", formatGHS(data.summary.revenue)));
  lines.push(lr("Sales", String(data.summary.salesCount)));
  lines.push(lr("Items sold", String(data.summary.itemsSold)));
  lines.push(lr("Gross profit", formatGHS(data.summary.grossProfit)));
  lines.push(rule);
  lines.push(lr("Expected cash", formatPesewas(data.cash.expectedCash)));
  lines.push(lr("MoMo", formatPesewas(data.cash.momoTotal)));
  lines.push(lr("Counted cash", formatPesewas(data.countedCashPesewas)));
  lines.push(lr(overShort < 0 ? "SHORT" : "OVER", formatPesewas(Math.abs(overShort))));
  lines.push(rule);
  if (data.top.length) {
    lines.push("Top products");
    for (const t of data.top.slice(0, 5)) {
      lines.push(lr(`  ${t.product_name.slice(0, width - 12)} x${t.qty}`, formatPesewas(t.revenue)));
    }
    lines.push(rule);
  }
  lines.push(lr("Closed by", data.cashierName));
  lines.push(center(new Date().toLocaleString("en-GB")));
  return lines.join("\n");
}
