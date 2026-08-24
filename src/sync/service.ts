// Background sync loop — the seam a future cloud backend plugs into. Drains
// sync_queue and POSTs each row to `settings.sync_endpoint_url` once one is
// configured; until then every tick reads that one setting and returns,
// which is intentionally the entire cost of running this with no backend.
//
// Actually standing up a cloud endpoint (hosting, database, auth) needs
// decisions only the business owner can make (which provider, what it costs)
// — out of scope here. What's real: the queue fills correctly, the retry/
// backoff logic is correct, and pointing sync_endpoint_url at a real URL that
// implements the POST contract below is the only thing left to do.

import { native } from "@/native";
import { getSettings } from "@/db/queries/settings";

const POLL_INTERVAL_MS = 30_000; // also the retry backoff after a failed attempt
const BATCH_SIZE = 50;

interface QueueRow {
  id: number;
  entity: string;
  entity_id: number;
  op: string;
  payload: string;
}

let timer: ReturnType<typeof setInterval> | null = null;
let draining = false;

/** Drain whatever's pending right now. Safe to call anytime (e.g. right after
 *  a sale commits, for the "sync immediately" case) — a no-op with no
 *  endpoint configured, and re-entrant calls just skip while one is running. */
export async function syncNow(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const settings = await getSettings();
    const endpoint = settings.sync_endpoint_url;
    if (!endpoint) return;

    const rows = await native.select<QueueRow>(
      "SELECT id, entity, entity_id, op, payload FROM sync_queue WHERE synced = 0 ORDER BY id LIMIT ?",
      [BATCH_SIZE]
    );
    for (const row of rows) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: row.entity,
            entityId: row.entity_id,
            op: row.op,
            payload: JSON.parse(row.payload),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await native.execute("UPDATE sync_queue SET synced = 1, synced_at = ? WHERE id = ?", [
          new Date().toISOString(),
          row.id,
        ]);
      } catch (e) {
        await native.execute(
          "UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?",
          [String(e instanceof Error ? e.message : e), row.id]
        );
        // Stop this pass on the first failure rather than hammering a downed
        // endpoint for the rest of the batch; the next tick (30s) retries.
        break;
      }
    }
  } finally {
    draining = false;
  }
}

/** Start the periodic loop. Safe to call once at boot. */
export function startSyncLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    syncNow().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function stopSyncLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
