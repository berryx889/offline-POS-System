// Wrap the fixed-width receipt text in the minimal ESC/POS command set that every
// generic 58/80mm thermal printer understands (pos-prd.md §8 — target the command
// set, not a brand). Characters are encoded as CP437-ish single bytes.

const ESC = 0x1b;
const GS = 0x1d;

function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // Everything we print (ASCII + the — dash we normalize) fits in a byte.
    bytes.push(code < 0x100 ? code : 0x3f /* '?' */);
  }
  return bytes;
}

export interface EscPosOptions {
  cut?: boolean; // partial-cut the paper at the end
  openDrawer?: boolean; // pulse the cash drawer (cash sales)
  feedLines?: number; // blank lines before the cut so the tear-off clears the head
  /** Print this as a Code128 barcode under the text (v3 §20 — the receipt number,
   *  so a reprint is one scan away). */
  barcode?: string;
}

export function encodeEscPos(text: string, opts: EscPosOptions = {}): Uint8Array {
  const out: number[] = [];

  out.push(ESC, 0x40); // ESC @  — initialize
  out.push(ESC, 0x61, 0x00); // ESC a 0 — left align

  // Normalize the em dash to a hyphen so it renders on ASCII printers.
  const body = text.replace(/—/g, "-");
  for (const line of body.split("\n")) {
    out.push(...encodeText(line), 0x0a);
  }

  if (opts.barcode) {
    out.push(0x0a);
    out.push(ESC, 0x61, 0x01); // center
    out.push(GS, 0x68, 50); // GS h — barcode height (dots)
    out.push(GS, 0x77, 0x02); // GS w — module width
    out.push(GS, 0x48, 0x02); // GS H — HRI text below the bars
    // GS k m=73 (CODE128) n data — data starts with the {B code-set selector.
    const data = [0x7b, 0x42, ...encodeText(opts.barcode)];
    out.push(GS, 0x6b, 0x49, data.length, ...data);
    out.push(0x0a);
    out.push(ESC, 0x61, 0x00); // back to left align
  }

  const feed = opts.feedLines ?? 4;
  for (let i = 0; i < feed; i++) out.push(0x0a);

  if (opts.openDrawer) {
    // ESC p 0 t1 t2 — pulse drawer pin 2.
    out.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  }
  if (opts.cut) {
    // GS V 1 — partial cut.
    out.push(GS, 0x56, 0x01);
  }

  return Uint8Array.from(out);
}
