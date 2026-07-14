// User + auth queries. Types are colocated here (CLAUDE.md: types live with their
// query module).

import { native } from "@/native";

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
