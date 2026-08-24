// Local change log a future cloud sync service drains — see service.ts for
// the drain/retry loop. No backend exists yet (that needs hosting/provider
// decisions only the business owner can make), so rows just accumulate with
// synced = 0 until one does. This module only appends; it never sends anything.

import { native } from "@/native";

export type SyncOp = "insert" | "update" | "delete";

export async function enqueueChange(
  entity: string,
  entityId: number,
  op: SyncOp,
  payload: Record<string, unknown>
): Promise<void> {
  await native.execute(
    "INSERT INTO sync_queue (entity, entity_id, op, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    [entity, entityId, op, JSON.stringify(payload), new Date().toISOString()]
  );
}

export interface QueueStatus {
  pending: number;
  failedLastAttempt: number;
  oldestPending: string | null;
}

export async function queueStatus(): Promise<QueueStatus> {
  const [row] = await native.select<{ pending: number; failed: number; oldest: string | null }>(
    `SELECT COUNT(*) AS pending,
            SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS failed,
            MIN(created_at) AS oldest
       FROM sync_queue WHERE synced = 0`
  );
  return { pending: row.pending, failedLastAttempt: row.failed ?? 0, oldestPending: row.oldest };
}
