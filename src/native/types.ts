// The native adapter interface. THE ONLY surface the app uses to touch the
// platform. Both the real Tauri adapter and the dev browser mock implement it,
// which is what keeps the Electron escape hatch (pos-prd.md §3) open — swapping
// implementations here never touches a screen.

export interface ExecuteResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface NativeAdapter {
  /** Run the schema/migration script (may contain multiple statements). */
  executeScript(sql: string): Promise<void>;
  /** Read rows. Params bind positionally as $1, $2, ... */
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Write. Returns rows affected and last insert id where available. */
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;

  /** argon2 hash of a PIN (Rust in Tauri; a dev-only fallback in the mock). */
  hashPin(pin: string): Promise<string>;
  verifyPin(pin: string, hash: string): Promise<boolean>;

  /** Best-effort hardware. Failures never block a committed sale. */
  printReceipt(bytes: Uint8Array, printerName?: string): Promise<void>;
  openCashDrawer(printerName?: string): Promise<void>;

  /** The whole database as bytes, for backups. */
  exportDatabase(): Promise<Uint8Array>;
  /** Replace the database with these bytes (restore). Caller reloads after. */
  importDatabase(bytes: Uint8Array): Promise<void>;

  /** 'tauri' in the installed app, 'mock' during `npm run dev` in a browser. */
  readonly kind: "tauri" | "mock";
}
