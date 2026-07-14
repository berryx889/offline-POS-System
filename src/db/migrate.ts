// Runs the schema on first launch and records a version so later phases can add
// migrations without re-running everything. Idempotent: safe to call every start.

import { native } from "@/native";
import schema from "./schema.sql?raw";
import { seedIfEmpty } from "./seed";

const SCHEMA_VERSION = 1;

// Guard against concurrent callers (e.g. React StrictMode invoking the boot
// effect twice) racing the seed and inserting duplicate rows. Everyone shares
// the same in-flight run.
let inFlight: Promise<void> | null = null;

export function migrate(): Promise<void> {
  if (!inFlight) inFlight = runMigrate();
  return inFlight;
}

async function runMigrate(): Promise<void> {
  // The schema uses IF NOT EXISTS throughout, so applying it repeatedly is safe.
  await native.executeScript(schema);

  await native.executeScript(
    "CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT);"
  );
  const rows = await native.select<{ value: string }>(
    "SELECT value FROM schema_meta WHERE key = ?",
    ["version"]
  );
  const current = rows.length ? parseInt(rows[0].value, 10) : 0;

  // Seed the receipt-number sequence once.
  await native.execute(
    "INSERT OR IGNORE INTO sequences (name, value) VALUES ('receipt', 0), ('sale_seq', 0)"
  );

  if (current < SCHEMA_VERSION) {
    await native.execute(
      "INSERT INTO schema_meta (key, value) VALUES ('version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(SCHEMA_VERSION)]
    );
  }

  await seedIfEmpty();
}
