// Hand-rolled single-series SVG bar chart (no chart library, per CLAUDE.md) —
// revenue per bucket (day or month) for the Financial dashboard's sales trend.

import type { TrendPoint } from "@/db/queries/reports";
import { formatPesewas } from "@/money";

const W = 600;
const H = 200;
const PAD_L = 52;
const PAD_B = 24;
const PAD_T = 10;

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const chartW = W - PAD_L - 8;
  const chartH = H - PAD_B - PAD_T;
  const slot = data.length ? chartW / data.length : chartW;
  const y = (v: number) => PAD_T + chartH - (v / max) * chartH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue trend">
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - 8} y2={PAD_T + chartH} stroke="#1C2522" strokeOpacity={0.15} />
      <text x={PAD_L - 8} y={PAD_T + 10} textAnchor="end" fontSize="11" fill="#1C2522" fillOpacity={0.5}>
        {formatPesewas(max)}
      </text>

      {data.map((d, i) => {
        const cx = PAD_L + i * slot;
        const barW = slot * 0.6;
        const showLabel = data.length <= 14 || i % Math.ceil(data.length / 14) === 0;
        return (
          <g key={d.bucket}>
            <rect
              x={cx + (slot - barW) / 2}
              y={y(d.revenue)}
              width={barW}
              height={PAD_T + chartH - y(d.revenue)}
              fill="#27A567"
              rx={2}
            >
              <title>{`${d.bucket} — ${formatPesewas(d.revenue)} revenue, ${formatPesewas(d.profit)} profit`}</title>
            </rect>
            {showLabel && (
              <text x={cx + slot / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#1C2522" fillOpacity={0.5}>
                {d.bucket.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      {data.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#1C2522" fillOpacity={0.4}>
          No sales in this period.
        </text>
      )}
    </svg>
  );
}
