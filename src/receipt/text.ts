// The receipt laid out as fixed-width text (pos-prd.md §6.2). One layout drives
// both the thermal print (wrapped in ESC/POS bytes) and the HTML/A4 fallback, so
// what prints on paper matches what the fallback prints. Width is the character
// count for the paper: 32 for 58mm, 42 for 80mm.

import { formatPesewas, formatGHS } from "@/money";
import { unitLabel } from "@/stock";
import type { SaleDetail } from "@/db/queries/sales";
import type { Settings } from "@/db/queries/settings";

export function widthForPaper(paperWidthMm: string | undefined): number {
  return paperWidthMm === "58" ? 32 : 42;
}

function center(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  const pad = Math.floor((width - s.length) / 2);
  return " ".repeat(pad) + s;
}

/** "LABEL            123.45" — label left, value right, filled to width. */
function lr(left: string, right: string, width: number): string {
  const space = width - left.length - right.length;
  if (space < 1) return `${left} ${right}`;
  return left + " ".repeat(space) + right;
}

function rule(width: number): string {
  return "-".repeat(width);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildReceiptText(
  detail: SaleDetail,
  settings: Settings,
  opts: { reprint?: boolean } = {}
): string {
  const width = widthForPaper(settings.paper_width);
  const { sale, items } = detail;
  const lines: string[] = [];

  // Header
  if (settings.business_name) lines.push(center(settings.business_name.toUpperCase(), width));
  const contact = [settings.address, settings.phone].filter(Boolean).join(" — ");
  if (contact) lines.push(center(contact, width));
  lines.push(rule(width));
  if (opts.reprint) {
    lines.push(center("*REPRINT*", width));
  }

  // Meta
  lines.push(`Receipt: ${sale.receipt_no}`);
  lines.push(`Date: ${formatDate(sale.created_at)}`);
  lines.push(`Cashier: ${sale.cashier_name}`);
  lines.push(rule(width));

  // Items — name + "qty UNIT" on one line, "@ price ... total" on the next.
  for (const it of items) {
    const unit = unitLabel(it.unit);
    lines.push(lr(it.product_name.slice(0, width - 8), `${it.qty} ${unit}`, width));
    lines.push(lr(`  @ ${formatPesewas(it.unit_price_pesewas)}`, formatPesewas(it.line_total_pesewas), width));
  }
  lines.push(rule(width));

  // Totals
  lines.push(lr("SUBTOTAL", formatPesewas(sale.subtotal_pesewas), width));
  if (sale.discount_pesewas > 0) {
    lines.push(lr("DISCOUNT", formatPesewas(sale.discount_pesewas), width));
  }
  if (sale.tax_pesewas > 0) {
    lines.push(lr("TAX", formatPesewas(sale.tax_pesewas), width));
  }
  lines.push(lr("TOTAL", formatGHS(sale.total_pesewas), width));

  if (sale.payment_method === "cash") {
    lines.push(lr("CASH", formatPesewas(sale.amount_paid_pesewas), width));
    lines.push(lr("CHANGE", formatPesewas(sale.change_pesewas), width));
  } else if (sale.payment_method === "momo") {
    lines.push(lr("MOMO", formatPesewas(sale.total_pesewas), width));
    if (sale.momo_reference) lines.push(`Ref: ${sale.momo_reference}`);
  } else if (sale.payment_method === "credit") {
    lines.push(lr("ON CREDIT", formatPesewas(sale.credit_pesewas), width));
    if (sale.customer_name) lines.push(`Customer: ${sale.customer_name}`);
  } else {
    lines.push(lr("CASH", formatPesewas(sale.cash_part_pesewas), width));
    lines.push(lr("MOMO", formatPesewas(sale.momo_part_pesewas), width));
  }
  lines.push(rule(width));

  // Cashier note (v3 §10), then the shop footer.
  if (sale.note) {
    for (const part of wrap(`Note: ${sale.note}`, width)) lines.push(part);
    lines.push(rule(width));
  }
  if (settings.receipt_footer) {
    for (const part of wrap(settings.receipt_footer, width)) lines.push(center(part, width));
  }

  return lines.join("\n");
}

/** Word-wrap a footer to the paper width. */
function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      if (line) out.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
