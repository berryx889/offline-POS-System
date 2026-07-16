// Printing orchestration. If a thermal printer is configured, send ESC/POS bytes
// through the native adapter; otherwise (or if that fails) fall back to the OS
// print dialog with an HTML receipt (pos-prd.md §6.2). Printing is best-effort and
// never throws — the sale is already committed.

import { native } from "@/native";
import type { SaleDetail } from "@/db/queries/sales";
import type { Settings } from "@/db/queries/settings";
import { buildReceiptText } from "./text";
import { encodeEscPos } from "./escpos";
import { barcodeSvgString } from "@/barcode/svg";

export type PrintMethod = "thermal" | "html";

export interface PrintResult {
  ok: boolean;
  method: PrintMethod;
  error?: string;
}

/** A print-ready HTML page for a single receipt, styled like the paper tape.
 *  `barcode` (the receipt number) prints as Code128 under the text (v3 §20). */
export function receiptHtml(text: string, barcode?: string): string {
  const barcodeBlock = barcode
    ? `<div style="text-align:center;margin-top:8px">${barcodeSvgString(barcode, { height: 36, moduleWidth: 1.2 })}
       <div style="font-family:'IBM Plex Mono',monospace;font-size:10px">${barcode}</div></div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { margin: 0; }
  pre { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px;
        line-height: 1.35; white-space: pre; margin: 0; }
</style></head>
<body><pre>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>${barcodeBlock}</body></html>`;
}

/** Print an arbitrary full HTML document via a hidden iframe → the OS print dialog.
 *  Shared by receipts and the barcode-label sheet. */
export function printHtmlDoc(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  // Give the iframe a tick to lay out before printing.
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 150);
}

/** Print an HTML receipt via the OS print dialog. */
export function openHtmlReceipt(text: string, barcode?: string): void {
  printHtmlDoc(receiptHtml(text, barcode));
}

export async function printSale(
  detail: SaleDetail,
  settings: Settings,
  opts: { reprint?: boolean } = {}
): Promise<PrintResult> {
  const text = buildReceiptText(detail, settings, opts);
  const printerName = settings.printer_name?.trim();
  const receiptNo = detail.sale.receipt_no;

  if (printerName) {
    try {
      const bytes = encodeEscPos(text, {
        cut: true,
        openDrawer: settings.cash_drawer_enabled === "1" && detail.sale.payment_method !== "momo",
        barcode: receiptNo,
      });
      await native.printReceipt(bytes, printerName);
      return { ok: true, method: "thermal" };
    } catch (e) {
      // Thermal failed — fall back to HTML so the receipt still prints.
      openHtmlReceipt(text, receiptNo);
      return { ok: false, method: "html", error: String(e) };
    }
  }

  openHtmlReceipt(text, receiptNo);
  return { ok: true, method: "html" };
}

/** Print arbitrary fixed-width text (used by the test print and the Z-report).
 *  Routes to the thermal printer if configured, else the OS/HTML dialog. */
export async function printPlainText(text: string, settings: Settings): Promise<PrintResult> {
  const printerName = settings.printer_name?.trim();
  if (printerName) {
    try {
      await native.printReceipt(encodeEscPos(text, { cut: true }), printerName);
      return { ok: true, method: "thermal" };
    } catch (e) {
      openHtmlReceipt(text);
      return { ok: false, method: "html", error: String(e) };
    }
  }
  openHtmlReceipt(text);
  return { ok: true, method: "html" };
}

/** Settings → test print: a tiny fixed receipt to confirm the printer works. */
export async function testPrint(settings: Settings): Promise<PrintResult> {
  const width = settings.paper_width === "58" ? 32 : 42;
  const text = [
    center("CounterTop POS", width),
    center("Test print", width),
    "-".repeat(width),
    "If you can read this, the",
    "printer is set up correctly.",
    "-".repeat(width),
  ].join("\n");
  const printerName = settings.printer_name?.trim();
  if (printerName) {
    try {
      await native.printReceipt(encodeEscPos(text, { cut: true }), printerName);
      return { ok: true, method: "thermal" };
    } catch (e) {
      openHtmlReceipt(text);
      return { ok: false, method: "html", error: String(e) };
    }
  }
  openHtmlReceipt(text);
  return { ok: true, method: "html" };
}

function center(s: string, width: number): string {
  if (s.length >= width) return s;
  return " ".repeat(Math.floor((width - s.length) / 2)) + s;
}
