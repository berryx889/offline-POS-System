import * as XLSX from "xlsx";
import type { StockMovementHistoryRow, StockOverview, StockRow, RestockRow } from "@/db/queries/restocks";

const ghs = (pesewas: number) => Number((pesewas / 100).toFixed(2));

export function exportStockHistory(
  overview: StockOverview,
  stock: StockRow[],
  restocks: RestockRow[],
  movements: StockMovementHistoryRow[]
): void {
  const workbook = XLSX.utils.book_new();
  add(workbook, "Overview", [
    { Metric: "Total stock added", Units: overview.total_added, "Value (GHS)": ghs(overview.initial_value_pesewas) },
    { Metric: "Stock remaining", Units: overview.remaining, "Value (GHS)": ghs(overview.remaining_value_pesewas) },
    { Metric: "Units sold", Units: overview.units_sold, "Value (GHS)": ghs(overview.revenue_pesewas) },
    { Metric: "Gross profit", Units: "", "Value (GHS)": ghs(overview.gross_profit_pesewas) },
  ]);
  add(workbook, "Current stock", stock.map((row) => ({
    Product: row.name, SKU: row.sku ?? "", Category: row.category_name ?? "",
    "Initial quantity": row.initial_quantity, "Current quantity": row.current_quantity,
    "Cost price (GHS)": ghs(row.cost_price_pesewas), "Selling price (GHS)": ghs(row.selling_price_pesewas),
    "Initial value (GHS)": ghs(row.initial_value_pesewas), "Current value (GHS)": ghs(row.current_value_pesewas),
    Status: row.current_quantity <= row.low_stock_threshold ? "Low stock" : "In stock",
  })));
  add(workbook, "Restocks", restocks.map((row) => ({
    Restock: row.restock_no, Date: new Date(row.restock_date).toLocaleDateString("en-GB"), Product: row.product_name,
    "Initial quantity": row.quantity_added, "Units sold": row.units_sold, Remaining: row.remaining_quantity,
    "Total cost (GHS)": ghs(row.total_cost_pesewas), "Revenue (GHS)": ghs(row.revenue_pesewas),
    "Remaining value (GHS)": ghs(row.remaining_value_pesewas), "Created by": row.created_by_name,
  })));
  add(workbook, "Movement history", movements.map((row) => ({
    Date: new Date(row.created_at).toLocaleString("en-GB"), Product: row.product_name,
    Category: row.category_name ?? "", Action: row.action, Quantity: row.quantity,
    "Value (GHS)": ghs(row.value_pesewas), User: row.user_name,
  })));
  XLSX.writeFile(workbook, `countertop-stock-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function add(workbook: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]): void {
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
}