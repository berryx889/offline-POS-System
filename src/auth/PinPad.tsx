// Reusable numeric PIN pad. Big touch targets (≥56px), keyboard-driveable. Used
// on the login screen now; later for manager-override prompts (void, price).

import { useEffect } from "react";
import { cn } from "@/lib/cn";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 6,
  shake = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  maxLength?: number;
  shake?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        if (value.length < maxLength) onChange(value + e.key);
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      } else if (e.key === "Enter") {
        onSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, maxLength, onChange, onSubmit]);

  function press(k: (typeof KEYS)[number]) {
    if (k === "clear") onChange("");
    else if (k === "back") onChange(value.slice(0, -1));
    else if (value.length < maxLength) onChange(value + k);
  }

  return (
    <div className="w-full max-w-xs">
      {/* PIN dots */}
      <div
        className={cn(
          "mb-6 flex justify-center gap-3",
          shake && "motion-safe:animate-[shake_0.4s]"
        )}
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2",
              i < value.length ? "border-ledger bg-ledger" : "border-ink/25 bg-transparent"
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "flex h-16 items-center justify-center rounded-xl text-xl font-semibold",
              "border border-ink/8 bg-tape shadow-card transition-colors",
              "hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon",
              (k === "clear" || k === "back") && "text-sm font-medium text-ink/60"
            )}
          >
            {k === "back" ? "⌫" : k === "clear" ? "Clear" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
