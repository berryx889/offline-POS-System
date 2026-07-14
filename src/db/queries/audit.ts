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

export interface AuditEntry {
  id: number;
  action: string;
  detail: string | null;
  user_name: string | null;
  created_at: string;
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  return native.select<AuditEntry>(
    `SELECT a.id, a.action, a.detail, u.name AS user_name, a.created_at
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC
      LIMIT ?`,
    [limit]
  );
}
