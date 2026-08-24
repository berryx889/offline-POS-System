// User + auth queries. Types are colocated here (CLAUDE.md: types live with their
// query module).

import { native } from "@/native";
import { logAudit } from "./audit";
import type { Permission } from "@/auth/permissions";

// v4 widens this from ("admin" | "cashier") to a full role tier. See
// src/auth/permissions.ts for what each role can do by default, and how a
// user's `permissions` override blob layers on top.
export type Role = "super_admin" | "owner" | "admin" | "manager" | "supervisor" | "cashier";

export interface User {
  id: number;
  name: string;
  role: Role;
  active: number;
  permissions: string | null;
  branch_id: number | null;
}

export async function listActiveUsers(): Promise<User[]> {
  return native.select<User>(
    "SELECT id, name, role, active, permissions, branch_id FROM users WHERE active = 1 ORDER BY role, name"
  );
}

export async function listAllUsers(): Promise<User[]> {
  return native.select<User>(
    "SELECT id, name, role, active, permissions, branch_id FROM users ORDER BY role, name"
  );
}

export { pinLengthFor } from "@/auth/permissions";

export async function createUser(
  name: string,
  role: Role,
  pin: string,
  actorId: number,
  branchId: number | null = null
): Promise<number> {
  const hash = await native.hashPin(pin);
  const res = await native.execute(
    "INSERT INTO users (name, role, pin_hash, active, branch_id, created_at) VALUES (?, ?, ?, 1, ?, ?)",
    [name.trim(), role, hash, branchId, new Date().toISOString()]
  );
  await logAudit(actorId, "user_create", { user_id: res.lastInsertId, name, role });
  return res.lastInsertId!;
}

/** Set (or clear) this user's per-permission overrides. Passing `null` for a
 *  key removes the override so that permission falls back to the role default. */
export async function setUserPermissions(
  userId: number,
  overrides: Partial<Record<Permission, boolean>>,
  actorId: number
): Promise<void> {
  const cleaned = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined)
  );
  const json = Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
  await native.execute("UPDATE users SET permissions = ? WHERE id = ?", [json, userId]);
  await logAudit(actorId, "permissions_change", { user_id: userId, permissions: cleaned });
}

export async function resetPin(userId: number, newPin: string, actorId: number): Promise<void> {
  const hash = await native.hashPin(newPin);
  await native.execute("UPDATE users SET pin_hash = ? WHERE id = ?", [hash, userId]);
  await logAudit(actorId, "pin_reset", { user_id: userId });
}

export async function setUserActive(userId: number, active: boolean, actorId: number): Promise<void> {
  await native.execute("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, userId]);
  await logAudit(actorId, active ? "user_activate" : "user_deactivate", { user_id: userId });
}

/** Verify a PIN belongs to any active admin-tier user (manager-override for
 *  voids, price overrides, discounts). Returns the User or null. */
export async function verifyAdminPin(pin: string): Promise<User | null> {
  const admins = await native.select<User & { pin_hash: string }>(
    `SELECT id, name, role, active, permissions, branch_id, pin_hash FROM users
       WHERE role IN ('super_admin', 'owner', 'admin', 'manager') AND active = 1`
  );
  for (const a of admins) {
    if (await native.verifyPin(pin, a.pin_hash)) {
      const { pin_hash: _omit, ...user } = a;
      void _omit;
      return user;
    }
  }
  return null;
}

/** Verify a user's PIN. Returns the User on success, null otherwise. */
export async function authenticate(userId: number, pin: string): Promise<User | null> {
  const rows = await native.select<User & { pin_hash: string }>(
    "SELECT id, name, role, active, permissions, branch_id, pin_hash FROM users WHERE id = ? AND active = 1",
    [userId]
  );
  if (!rows.length) return null;
  const ok = await native.verifyPin(pin, rows[0].pin_hash);
  if (!ok) return null;
  const { pin_hash: _omit, ...user } = rows[0];
  void _omit;
  return user;
}
