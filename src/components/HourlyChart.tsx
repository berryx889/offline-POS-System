// Hand-rolled SVG bar chart (no chart library, per CLAUDE.md). Revenue per hour
// 7am–9pm, today in ledger green with the same weekday last week as a ghost bar
// behind it (pos-prd.md §6.4). Bar heights are dynamic runtime values, so inline
// geometry here is the sanctioned exception to Tailwind-first.

import type { HourBucket } from "@/db/queries/analytics";
import { formatPesewas } from "@/money";

const W = 600;
const H = 220;
const PAD_L = 44;
const PAD_B = 26;
const PAD_T = 10;

export function HourlyChart({ data }: { data: HourBucket[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.today, d.lastWeek]));
  const chartW = W - PAD_L - 8;
  const chartH = H - PAD_B - PAD_T;
  const slot = chartW / data.length;
  const y = (v: number) => PAD_T + chartH - (v / max) * chartH;

  const labelHours = new Set([7, 10, 13, 16, 19, 21]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hourly revenue today vs last week">
      {/* baseline */}
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - 8} y2={PAD_T + chartH} stroke="#1C2522" strokeOpacity={0.15} />
      {/* max label */}
      <text x={PAD_L - 8} y={PAD_T + 10} textAnchor="end" fontSize="11" fill="#1C2522" fillOpacity={0.5}>
        {formatPesewas(max)}
      </text>

      {data.map((d, i) => {
        const cx = PAD_L + i * slot;
        const ghostW = slot * 0.62;
        const todayW = slot * 0.42;
        return (
          <g key={d.hour}>
            {/* ghost: last week */}
            <rect
              x={cx + (slot - ghostW) / 2}
              y={y(d.lastWeek)}
              width={ghostW}
              height={PAD_T + chartH - y(d.lastWeek)}
              fill="#1C2522"
              fillOpacity={0.1}
              rx={2}
            >
              <title>{`${d.hour}:00 last week — ${formatPesewas(d.lastWeek)}`}</title>
            </rect>
            {/* today */}
            <rect
              x={cx + (slot - todayW) / 2}
              y={y(d.today)}
              width={todayW}
              height={PAD_T + chartH - y(d.today)}
              fill="#0E5A45"
              rx={2}
            >
              <title>{`${d.hour}:00 today — ${formatPesewas(d.today)}`}</title>
            </rect>
            {labelHours.has(d.hour) && (
              <text
                x={cx + slot / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#1C2522"
                fillOpacity={0.5}
              >
                {d.hour}
              </text>
            )}
          </g>
        );
      })}

      {/* legend */}
      <g transform={`translate(${PAD_L}, ${PAD_T})`}>
        <rect width={10} height={10} fill="#0E5A45" rx={2} />
        <text x={14} y={9} fontSize="11" fill="#1C2522" fillOpacity={0.6}>Today</text>
        <rect x={64} width={10} height={10} fill="#1C2522" fillOpacity={0.1} rx={2} />
        <text x={78} y={9} fontSize="11" fill="#1C2522" fillOpacity={0.6}>Last week</text>
      </g>
    </svg>
  );
}
