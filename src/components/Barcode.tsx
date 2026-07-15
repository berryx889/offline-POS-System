// Renders a Code-128 barcode as SVG bars (for on-screen label previews and the
// HTML/A4 label sheet). Thermal printing uses the printer's native barcode command
// instead — see receipt/labels.ts.

import { encodeCode128B } from "@/barcode/code128";

export function Barcode({
  value,
  height = 48,
  moduleWidth = 1.6,
}: {
  value: string;
  height?: number;
  moduleWidth?: number;
}) {
  let widths: number[];
  try {
    widths = encodeCode128B(value);
  } catch {
    return <span className="text-xs text-stamp">Can't encode “{value}”</span>;
  }

  const totalModules = widths.reduce((a, b) => a + b, 0);
  const width = totalModules * moduleWidth;

  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x: x * moduleWidth, w: w * moduleWidth }); // even index = bar
    x += w;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}
