// User + auth queries. Types are colocated here (CLAUDE.md: types live with their
// query module).

import { native } from "@/native";
import { logAudit } from "./audit";

export type Role = "admin" | "cashier";

export interface User {
  id: number;
  name: string;
  role: Role;
  active: number;
}

export async function listActiveUsers(): Promise<User[]> {
  return native.select<User>(
    "SELECT id, name, role, active FROM users WHERE active = 1 ORDER BY role, name"
  );
}

export async function listAllUsers(): Promise<User[]> {
  return native.select<User>("SELECT id, name, role, active FROM users ORDER BY role, name");
}

/** Admin PINs are 6 digits, cashier PINs 4 (pos-prd.md §2). */
export function pinLengthFor(role: Role): number {
  return role === "admin" ? 6 : 4;
}

export async function createUser(
  name: string,
  role: Role,
  pin: string,
  actorId: number
): Promise<number> {
  const hash = await native.hashPin(pin);
  const res = await native.execute(
    "INSERT INTO users (name, role, pin_hash, active, created_at) VALUES (?, ?, ?, 1, ?)",
    [name.trim(), role, hash, new Date().toISOString()]
  );
  await logAudit(actorId, "user_create", { user_id: res.lastInsertId, name, role });
  return res.lastInsertId!;
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

/** Verify a PIN belongs to any active admin (manager-override for voids, price
 *  overrides, discounts). Returns the admin User or null. */
export async function verifyAdminPin(pin: string): Promise<User | null> {
  const admins = await native.select<User & { pin_hash: string }>(
    "SELECT id, name, role, active, pin_hash FROM users WHERE role = 'admin' AND active = 1"
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
    "SELECT id, name, role, active, pin_hash FROM users WHERE id = ? AND active = 1",
    [userId]
  );
  if (!rows.length) return null;
  const ok = await native.verifyPin(pin, rows[0].pin_hash);
  if (!ok) return null;
  const { pin_hash: _omit, ...user } = rows[0];
  void _omit;
  return user;
}
