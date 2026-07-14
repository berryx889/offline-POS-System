// Money is always integer pesewas (GHS × 100). These helpers are the only place
// pesewas become a display string, so formatting stays consistent everywhere.

export type Pesewas = number;

/** 34250 -> "342.50" (no currency symbol). */
export function formatPesewas(pesewas: Pesewas): string {
  const negative = pesewas < 0;
  const abs = Math.abs(Math.round(pesewas));
  const cedis = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = cedis.toLocaleString("en-GH");
  return `${negative ? "-" : ""}${grouped}.${rem.toString().padStart(2, "0")}`;
}

/** 34250 -> "GHS 342.50". */
export function formatGHS(pesewas: Pesewas): string {
  return `GHS ${formatPesewas(pesewas)}`;
}

/** "342.50" or "342.5" or 342.5 -> 34250. Returns 0 for blank/garbage. */
export function toPesewas(input: string | number): Pesewas {
  const n = typeof input === "number" ? input : parseFloat(input.replace(/,/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}
