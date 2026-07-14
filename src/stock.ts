// Stock is stored in pieces. These helpers convert to/from the "X boxes + Y pcs"
// view the shop thinks in. piecesPerBox of 1 means the item is loose-only.

export function piecesToBoxes(
  pieces: number,
  piecesPerBox: number
): { boxes: number; loose: number } {
  if (piecesPerBox <= 1) return { boxes: 0, loose: pieces };
  return { boxes: Math.floor(pieces / piecesPerBox), loose: pieces % piecesPerBox };
}

/** 55 pieces @ 24/box -> "2 boxes + 7 pcs". Loose-only items -> "55 pcs". */
export function formatStock(pieces: number, piecesPerBox: number): string {
  if (piecesPerBox <= 1) return `${pieces} pcs`;
  const { boxes, loose } = piecesToBoxes(pieces, piecesPerBox);
  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes} box${boxes === 1 ? "" : "es"}`);
  if (loose > 0 || boxes === 0) parts.push(`${loose} pcs`);
  return parts.join(" + ");
}

/** Pieces removed when selling `qty` of a unit. */
export function piecesForUnit(qty: number, unit: "piece" | "box", piecesPerBox: number): number {
  return unit === "box" ? qty * piecesPerBox : qty;
}
