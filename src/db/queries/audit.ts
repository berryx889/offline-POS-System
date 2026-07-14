// Audit trail. Every price change, void, override, and PIN reset lands here
// (pos-prd.md §10 non-negotiable). detail is JSON.

import { native } from "@/native";

export async function logAudit(
  userId: number | null,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  await native.execute(
    "INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)",
    [userId, action, JSON.stringify(detail), new Date().toISOString()]
  );
}
