// Barcode label printing (pos-prd.md §6.3, v1.5). Pick products → print Code-128
// labels. Thermal printers render the barcode natively via GS k; otherwise we lay
// the labels out as an HTML sheet for an ordinary printer.

import { native } from "@/native";
import { barcodeSvgString } from "@/barcode/svg";
import { printHtmlDoc, type PrintResult } from "./print";
import type { Settings } from "@/db/queries/settings";

export interface LabelSpec {
  name: string;
  priceText: string; // e.g. "GHS 3.50"
  code: string; // the barcode value (scannable)
  copies: number;
}

function expand(labels: LabelSpec[]): LabelSpec[] {
  const out: LabelSpec[] = [];
  for (const l of labels) for (let i = 0; i < Math.max(1, l.copies); i++) out.push(l);
  return out;
}

// ---- HTML sheet (ordinary printer / preview) ------------------------------

function labelSheetHtml(labels: LabelSpec[]): string {
  const cells = expand(labels)
    .map(
      (l) => `
      <div class="label">
        <div class="name">${escapeHtml(l.name)}</div>
        <div class="price">${escapeHtml(l.priceText)}</div>
        ${barcodeSvgString(l.code, { height: 40, moduleWidth: 1.4 })}
        <div class="code">${escapeHtml(l.code)}</div>
      </div>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title>
<style>
  @page { margin: 8mm; }
  body { margin: 0; font-family: Arial, sans-serif; }
  .sheet { display: flex; flex-wrap: wrap; gap: 4mm; }
  .label { width: 45mm; border: 1px solid #ddd; padding: 3mm; text-align: center; break-inside: avoid; }
  .name { font-size: 11px; font-weight: 600; }
  .price { font-size: 13px; margin: 1mm 0; }
  .code { font-family: monospace; font-size: 10px; letter-spacing: 1px; }
  svg { max-width: 100%; }
</style></head>
<body><div class="sheet">${cells}</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

// ---- ESC/POS (thermal, native barcode) ------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0) & 0xff);
}

/** One strip with each label: name, price, a native Code-128 barcode, the digits. */
export function encodeLabelsEscPos(labels: LabelSpec[]): Uint8Array {
  const out: number[] = [ESC, 0x40, ESC, 0x61, 0x01]; // init, center
  for (const l of expand(labels)) {
    out.push(...ascii(l.name), 0x0a);
    out.push(...ascii(l.priceText), 0x0a);
    out.push(GS, 0x68, 0x50); // GS h 80 — barcode height
    out.push(GS, 0x77, 0x02); // GS w 2  — module width
    out.push(GS, 0x48, 0x02); // GS H 2  — HRI text below
    // GS k 73 n {B<data>  (Code-128, function-B form with subset selector)
    const data = ascii("{B" + l.code);
    out.push(GS, 0x6b, 0x49, data.length, ...data);
    out.push(0x0a, 0x0a); // spacing between labels
  }
  out.push(GS, 0x56, 0x01); // partial cut at the end of the strip
  return Uint8Array.from(out);
}

// ---- Orchestrator ---------------------------------------------------------

export async function printLabels(labels: LabelSpec[], settings: Settings): Promise<PrintResult> {
  const printerName = settings.printer_name?.trim();
  if (printerName && native.kind === "tauri") {
    try {
      await native.printReceipt(encodeLabelsEscPos(labels), printerName);
      return { ok: true, method: "thermal" };
    } catch (e) {
      printHtmlDoc(labelSheetHtml(labels));
      return { ok: false, method: "html", error: String(e) };
    }
  }
  printHtmlDoc(labelSheetHtml(labels));
  return { ok: true, method: "html" };
}

/** Exposed for tests/preview: the label sheet as an HTML string. */
export { labelSheetHtml };
