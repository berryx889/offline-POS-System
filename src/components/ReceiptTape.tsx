// The signature element (pos-prd.md §9.4): the cart rendered as an actual receipt
// — white tape, IBM Plex Mono, dashed rules, a zig-zag perforated bottom edge. One
// component, three uses: the live cart (interactive rows as children), receipt
// previews, and sale detail (static rows). This is the visual shell; callers pass
// the line rows and the totals.

import type { ReactNode } from "react";
import { MoneyText } from "./MoneyText";

// CSS zig-zag perforation. Inline because clip-path polygons are dynamic values
// the design system explicitly allows as an inline exception.
const perforation = {
  clipPath:
    "polygon(0 0, 100% 0, 100% calc(100% - 8px), 96% 100%, 92% calc(100% - 8px), 88% 100%, 84% calc(100% - 8px), 80% 100%, 76% calc(100% - 8px), 72% 100%, 68% calc(100% - 8px), 64% 100%, 60% calc(100% - 8px), 56% 100%, 52% calc(100% - 8px), 48% 100%, 44% calc(100% - 8px), 40% 100%, 36% calc(100% - 8px), 32% 100%, 28% calc(100% - 8px), 24% 100%, 20% calc(100% - 8px), 16% 100%, 12% calc(100% - 8px), 8% 100%, 4% calc(100% - 8px), 0 100%)",
};

export function ReceiptTape({
  businessName,
  subtitle,
  children,
  subtotalPesewas,
  discountPesewas,
  totalPesewas,
  banner,
  footer,
}: {
  businessName: string;
  subtitle?: string;
  children: ReactNode;
  subtotalPesewas?: number;
  discountPesewas?: number;
  totalPesewas?: number;
  banner?: string; // e.g. "*REPRINT*"
  footer?: ReactNode;
}) {
  const showTotals = totalPesewas != null;
  return (
    <div
      className="flex h-full flex-col bg-tape font-mono text-ink shadow-card"
      style={perforation}
    >
      {/* Header */}
      <div className="px-5 pt-5 text-center">
        <div className="text-sm font-semibold uppercase tracking-wide">{businessName}</div>
        {subtitle && <div className="text-xs text-ink/60">{subtitle}</div>}
        {banner && <div className="mt-1 text-xs font-bold text-stamp">{banner}</div>}
        <div className="mt-3 border-t border-dashed border-ink/30" />
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto px-5 py-2">{children}</div>

      {/* Totals */}
      {showTotals && (
        <div className="px-5 pb-8 pt-2">
          <div className="border-t border-dashed border-ink/30 pt-2" />
          {subtotalPesewas != null && (
            <div className="flex justify-between text-sm text-ink/70">
              <span>SUBTOTAL</span>
              <MoneyText pesewas={subtotalPesewas} />
            </div>
          )}
          {discountPesewas != null && discountPesewas > 0 && (
            <div className="flex justify-between text-sm text-brass">
              <span>DISCOUNT</span>
              <span>
                −<MoneyText pesewas={discountPesewas} />
              </span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-semibold">TOTAL</span>
            <MoneyText pesewas={totalPesewas!} size="lg" currency className="font-semibold" />
          </div>
          {footer}
        </div>
      )}
    </div>
  );
}
