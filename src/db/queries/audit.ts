// Audit trail. Every price change, void, override, PIN reset, login/logout,
// product create/delete, stock adjustment, and permissions change lands here
// (pos-prd.md §10 non-negotiable). detail is JSON.
//
// Immutable by construction: this module is the only writer of audit_log, and
// it only ever INSERTs (see logAudit below and the raw INSERT in
// queries/sales.ts's voidSale). No UPDATE or DELETE against this table exists
// anywhere in the app — don't add one.

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
