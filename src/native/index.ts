// Chooses the native adapter for the current environment. Import `native` from
// here everywhere in the app — never import the tauri/mock modules directly.
//
// ── Room to grow: an online mode ──────────────────────────────────────────
// Because every platform + data call goes through this one boundary, adding a
// hosted/online mode later is a CONTAINED change — no screen, store, or query
// module changes. To do it:
//   1. Add `src/native/web.ts` implementing NativeAdapter, where select/execute
//      call a backend API instead of local SQLite (a libSQL/Turso HTTP client,
//      or your own server). The SQL itself can stay the same.
//   2. Move PIN hashing/verification server-side — hashPin/verifyPin must NOT be
//      trusted in the browser (the mock's stub is dev-only). The web adapter
//      calls an auth endpoint that runs argon2 on the server.
//   3. Add a `kind: "web"` branch below (selected by an env flag or the URL).
// Everything above this boundary keeps working unchanged. That is the payoff of
// routing all native calls through `src/native/`.
// ──────────────────────────────────────────────────────────────────────────

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
  // Future: `if (isWeb()) return (await import("./web")).webAdapter;`
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
  async exportDatabase() {
    cached ??= await resolveAdapter();
    return cached.exportDatabase();
  },
  async importDatabase(bytes) {
    cached ??= await resolveAdapter();
    return cached.importDatabase(bytes);
  },
  async readBackupFile(path) {
    cached ??= await resolveAdapter();
    return cached.readBackupFile(path);
  },
  async writeBackupFile(path, bytes) {
    cached ??= await resolveAdapter();
    return cached.writeBackupFile(path, bytes);
  },
};

export type { NativeAdapter } from "./types";
