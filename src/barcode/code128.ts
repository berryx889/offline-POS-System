// Hand-rolled Code-128 (subset B) encoder — no barcode library, offline-safe,
// same spirit as the hand-rolled SVG charts. Subset B covers all printable ASCII
// (space..~), which is plenty for shop codes. Returns the module widths so an SVG
// or a printer can render the bars.

// The 107 Code-128 symbol patterns (index 0..106). Each is bar/space widths that
// sum to 11 modules (the final STOP is 13). Standard table.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** True if the string can be encoded in subset B (printable ASCII 32..126). */
export function isEncodable(text: string): boolean {
  return [...text].every((c) => {
    const v = c.charCodeAt(0);
    return v >= 32 && v <= 126;
  });
}

/** Encode to a flat array of module widths. Index 0 is a bar, alternating after. */
export function encodeCode128B(text: string): number[] {
  if (!isEncodable(text)) throw new Error("Code-128 B can only encode printable ASCII");

  const values = [START_B];
  for (const ch of text) values.push(ch.charCodeAt(0) - 32);

  // Weighted checksum: start + Σ value_i × position_i (position 1-indexed).
  let sum = START_B;
  [...text].forEach((ch, i) => {
    sum += (ch.charCodeAt(0) - 32) * (i + 1);
  });
  values.push(sum % 103);
  values.push(STOP);

  const widths: number[] = [];
  for (const v of values) {
    for (const d of PATTERNS[v]) widths.push(parseInt(d, 10));
  }
  return widths;
}
