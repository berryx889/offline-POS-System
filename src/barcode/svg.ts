// Code-128 as an SVG markup string, for the printable HTML label sheet (the React
// <Barcode> component covers on-screen previews).

import { encodeCode128B } from "./code128";

export function barcodeSvgString(
  value: string,
  { height = 48, moduleWidth = 1.6 }: { height?: number; moduleWidth?: number } = {}
): string {
  const widths = encodeCode128B(value);
  const total = widths.reduce((a, b) => a + b, 0);
  const width = total * moduleWidth;

  let x = 0;
  const rects: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${(x * moduleWidth).toFixed(2)}" y="0" width="${(w * moduleWidth).toFixed(2)}" height="${height}" fill="#000"/>`);
    x += w;
  });

  return `<svg width="${width.toFixed(2)}" height="${height}" viewBox="0 0 ${width.toFixed(2)} ${height}" shape-rendering="crispEdges"><rect x="0" y="0" width="${width.toFixed(2)}" height="${height}" fill="#fff"/>${rects.join("")}</svg>`;
}
