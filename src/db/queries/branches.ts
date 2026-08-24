// Branches (v4). A single local DB can hold more than one branch's data; see
// CONTEXT.md and schema.sql for why this models multi-branch ownership without
// needing real multi-machine sync.

import { native } from "@/native";
import { logAudit } from "./audit";

export interface Branch {
  id: number;
  name: string;
  code: string;
  location: string | null;
  active: number;
  created_at: string;
}

export async function listBranches(): Promise<Branch[]> {
  return native.select<Branch>("SELECT * FROM branches ORDER BY name");
}

export async function listActiveBranches(): Promise<Branch[]> {
  return native.select<Branch>("SELECT * FROM branches WHERE active = 1 ORDER BY name");
}

/** The oldest active branch — used as the default when a screen needs "a"
 *  branch and nothing more specific has been picked (e.g. the About panel). */
export async function mainBranch(): Promise<Branch | null> {
  const rows = await native.select<Branch>(
    "SELECT * FROM branches WHERE active = 1 ORDER BY id LIMIT 1"
  );
  return rows[0] ?? null;
}

/** Which branch this physical terminal tags new products/sales with (settings
 *  key `current_branch_id`). A shop with only one branch never has to think
 *  about this -- it just resolves to that branch. A shop opening a second
 *  location sets this once per terminal (Settings > Branches). */
export async function getCurrentBranchId(): Promise<number> {
  const rows = await native.select<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'current_branch_id'"
  );
  if (rows.length && rows[0].value) return parseInt(rows[0].value, 10);
  const branch = await mainBranch();
  if (!branch) throw new Error("No branch exists — this shouldn't happen after migrate().");
  return branch.id;
}

export async function setCurrentBranchId(branchId: number): Promise<void> {
  await native.execute(
    "INSERT INTO settings (key, value) VALUES ('current_branch_id', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(branchId)]
  );
}

export async function createBranch(
  name: string,
  code: string,
  location: string | null,
  actorId: number
): Promise<number> {
  const res = await native.execute(
    "INSERT INTO branches (name, code, location, active, created_at) VALUES (?, ?, ?, 1, ?)",
    [name.trim(), code.trim().toUpperCase(), location, new Date().toISOString()]
  );
  await logAudit(actorId, "branch_create", { branch_id: res.lastInsertId, name, code });
  return res.lastInsertId!;
}

export async function setBranchActive(id: number, active: boolean, actorId: number): Promise<void> {
  await native.execute("UPDATE branches SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
  await logAudit(actorId, active ? "branch_activate" : "branch_deactivate", { branch_id: id });
}

export async function updateBranch(
  id: number,
  name: string,
  code: string,
  location: string | null,
  actorId: number
): Promise<void> {
  await native.execute("UPDATE branches SET name = ?, code = ?, location = ? WHERE id = ?", [
    name.trim(),
    code.trim().toUpperCase(),
    location,
    id,
  ]);
  await logAudit(actorId, "branch_update", { branch_id: id, name, code });
}
