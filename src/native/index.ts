// Chooses the native adapter for the current environment. Import `native` from
// here everywhere in the app — never import the tauri/mock modules directly.

import type { NativeAdapter } from "./types";
import { mockAdapter } from "./mock";

// Tauri injects a global at runtime; its absence means we're in a plain browser
// (i.e. `npm run dev`). VITE_FORCE_MOCK lets you force the mock inside Tauri too.
function isTauri(): boolean {
  if (import.meta.env.VITE_FORCE_MOCK === "1") return false;
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached: NativeAdapter | null = null;

async function resolveAdapter(): Promise<NativeAdapter> {
  if (isTauri()) {
    // Lazy import so the browser dev build never pulls in the Tauri plugins.
    const { tauriAdapter } = await import("./tauri");
    return tauriAdapter;
  }
  return mockAdapter;
}

// A thin proxy so callers can `import { native }` synchronously and still get the
// right implementation once it resolves.
export const native: NativeAdapter = {
  kind: isTauri() ? "tauri" : "mock",
  async executeScript(sql) {
    cached ??= await resolveAdapter();
    return cached.executeScript(sql);
  },
  async select(sql, params) {
    cached ??= await resolveAdapter();
    return cached.select(sql, params);
  },
  async execute(sql, params) {
    cached ??= await resolveAdapter();
    return cached.execute(sql, params);
  },
  async hashPin(pin) {
    cached ??= await resolveAdapter();
    return cached.hashPin(pin);
  },
  async verifyPin(pin, hash) {
    cached ??= await resolveAdapter();
    return cached.verifyPin(pin, hash);
  },
  async printReceipt(bytes, printerName) {
    cached ??= await resolveAdapter();
    return cached.printReceipt(bytes, printerName);
  },
  async openCashDrawer(printerName) {
    cached ??= await resolveAdapter();
    return cached.openCashDrawer(printerName);
  },
};

export type { NativeAdapter } from "./types";
