// Every cedi figure in the app renders through this: IBM Plex Mono, tabular
// numerals, so columns of prices line up (pos-prd.md §9.1). The 48px "loud" size
// is reserved for change due and today's revenue only.

import { formatGHS, formatPesewas, type Pesewas } from "@/money";
import { cn } from "@/lib/cn";

type Size = "sm" | "base" | "lg" | "xl" | "loud";

const sizeClass: Record<Size, string> = {
  sm: "text-xs",
  base: "text-sm",
  lg: "text-lg",
  xl: "text-xl",
  loud: "text-3xl", // 48px — change due / today's revenue only
};

export function MoneyText({
  pesewas,
  size = "base",
  currency = false,
  className,
}: {
  pesewas: Pesewas;
  size?: Size;
  currency?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("font-mono tabular-nums", sizeClass[size], className)}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {currency ? formatGHS(pesewas) : formatPesewas(pesewas)}
    </span>
  );
}
