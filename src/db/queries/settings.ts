// Key/value settings (business name, receipt footer, printer...). Read as a map.

import { native } from "@/native";

export type Settings = Record<string, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await native.select<{ key: string; value: string }>(
    "SELECT key, value FROM settings"
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await native.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}
