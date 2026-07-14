// Export the reports to a multi-sheet .xlsx for the accountant (pos-prd.md §6.5).
// Money is written in GHS (not pesewas) so the sheet reads naturally.

import * as XLSX from "xlsx";
import type {
  SalesSummary,
  ProductRow,
  CategoryRow,
  CashierRow,
  VoidedRow,
} from "@/db/queries/reports";

const ghs = (pesewas: number) => Number((pesewas / 100).toFixed(2));

export interface ReportBundle {
  rangeLabel: string;
  summary: SalesSummary;
  byProduct: ProductRow[];
  byCategory: CategoryRow[];
  byCashier: CashierRow[];
  voided: VoidedRow[];
}

export function exportReportsToExcel(data: ReportBundle): void {
  const wb = XLSX.utils.book_new();

  const summary = [
    { Metric: "Period", Value: data.rangeLabel },
    { Metric: "Sales", Value: data.summary.count },
    { Metric: "Revenue (GHS)", Value: ghs(data.summary.revenue) },
    { Metric: "Average sale (GHS)", Value: ghs(data.summary.avgSale) },
    { Metric: "Gross profit (GHS)", Value: ghs(data.summary.profit) },
    { Metric: "Cash (GHS)", Value: ghs(data.summary.cashTotal) },
    { Metric: "MoMo (GHS)", Value: ghs(data.summary.momoTotal) },
  ];
  add(wb, "Summary", summary);

  add(
    wb,
    "By product",
    data.byProduct.map((r) => ({
      Product: r.product_name,
      Qty: r.qty,
      "Revenue (GHS)": ghs(r.revenue),
      "Profit (GHS)": ghs(r.profit),
    }))
  );
  add(
    wb,
    "By category",
    data.byCategory.map((r) => ({ Category: r.category, Qty: r.qty, "Revenue (GHS)": ghs(r.revenue) }))
  );
  add(
    wb,
    "By cashier",
    data.byCashier.map((r) => ({ Cashier: r.cashier, Sales: r.count, "Revenue (GHS)": ghs(r.revenue) }))
  );
  add(
    wb,
    "Voided",
    data.voided.map((r) => ({
      Receipt: r.receipt_no,
      Cashier: r.cashier,
      "Voided by": r.voided_by_name ?? "",
      Reason: r.void_reason ?? "",
      "Total (GHS)": ghs(r.total_pesewas),
      Date: new Date(r.created_at).toLocaleString("en-GB"),
    }))
  );

  XLSX.writeFile(wb, `countertop-report-${data.rangeLabel.replace(/\s+/g, "-")}.xlsx`);
}

function add(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, name);
}
