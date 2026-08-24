// Users & PINs management (pos-prd.md §6.7). Add an employee, reset a PIN,
// deactivate, and (v4) fine-tune their permissions beyond their role's default.
// Every change is audited via the queries.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAllUsers,
  createUser,
  resetPin,
  setUserActive,
  setUserPermissions,
  type Role,
  type User,
} from "@/db/queries/users";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ALL_ROLES,
  pinLengthFor,
  can,
} from "@/auth/permissions";
import { useSession } from "@/store/sessionStore";
import { cn } from "@/lib/cn";

export function UsersSection() {
  const actorId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ["all-users"], queryFn: listAllUsers });

  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [editingPerms, setEditingPerms] = useState<number | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  async function add() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const need = pinLengthFor(role);
    if (pin.length !== need || !/^\d+$/.test(pin)) return setError(`${ROLE_LABELS[role]} PIN must be ${need} digits.`);
    await createUser(name, role, pin, actorId);
    setName("");
    setPin("");
    refresh();
  }

  async function doReset(userId: number, userRole: Role) {
    const need = pinLengthFor(userRole);
    if (resetPinValue.length !== need || !/^\d+$/.test(resetPinValue)) {
      return setError(`New PIN must be ${need} digits.`);
    }
    await resetPin(userId, resetPinValue, actorId);
    setResetting(null);
    setResetPinValue("");
    setError(null);
  }

  async function togglePermission(u: User, key: (typeof ALL_PERMISSIONS)[number]) {
    const current = can(u, key);
    await setUserPermissions(u.id, { [key]: !current }, actorId);
    refresh();
  }

  async function clearOverride(u: User, key: (typeof ALL_PERMISSIONS)[number]) {
    // Removing the key entirely (not just setting it false) restores the role default.
    const overrides: Record<string, boolean> = u.permissions ? JSON.parse(u.permissions) : {};
    delete overrides[key];
    await setUserPermissions(u.id, overrides, actorId);
    refresh();
  }

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Users & PINs
      </h2>

      <ul className="mb-5 divide-y divide-ink/5">
        {users.map((u) => {
          const overrides: Record<string, boolean> = u.permissions ? JSON.parse(u.permissions) : {};
          return (
            <li key={u.id} className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-sans font-medium text-ink">{u.name}</span>
                  <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">
                    {ROLE_LABELS[u.role]}
                  </span>
                  {u.active !== 1 && <span className="ml-2 text-xs text-stamp">inactive</span>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    onClick={() => setEditingPerms(editingPerms === u.id ? null : u.id)}
                    className="font-medium text-carbon hover:underline"
                  >
                    Permissions
                  </button>
                  <button
                    onClick={() => {
                      setResetting(resetting === u.id ? null : u.id);
                      setResetPinValue("");
                      setError(null);
                    }}
                    className="font-medium text-carbon hover:underline"
                  >
                    Reset PIN
                  </button>
                  <button
                    onClick={async () => {
                      await setUserActive(u.id, u.active !== 1, actorId);
                      refresh();
                    }}
                    className="font-medium text-ink/60 hover:underline"
                    disabled={u.id === actorId}
                  >
                    {u.active === 1 ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </div>
              {resetting === u.id && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={resetPinValue}
                    onChange={(e) => setResetPinValue(e.target.value)}
                    placeholder={`${pinLengthFor(u.role)}-digit PIN`}
                    className="w-40 rounded-lg border border-ink/15 bg-tape px-3 py-2 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
                  />
                  <button
                    onClick={() => doReset(u.id, u.role)}
                    className="rounded-lg bg-ledger px-4 py-2 text-sm font-semibold text-tape hover:bg-ledger-deep"
                  >
                    Save PIN
                  </button>
                </div>
              )}
              {editingPerms === u.id && (
                <div className="mt-3 rounded-lg border border-ink/8 bg-paper p-3">
                  <p className="mb-2 text-xs text-ink/50">
                    Unchecked items follow the {ROLE_LABELS[u.role]} default. Toggling one here
                    overrides it for this person only.
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                    {ALL_PERMISSIONS.map((key) => {
                      const overridden = key in overrides;
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 text-sm text-ink/80"
                          title={overridden ? "Overridden — click label to reset to role default" : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={can(u, key)}
                            onChange={() => togglePermission(u, key)}
                            className="h-4 w-4 accent-ledger"
                          />
                          <span
                            className={cn(overridden && "font-semibold text-ledger-deep underline decoration-dotted")}
                            onClick={overridden ? () => clearOverride(u, key) : undefined}
                            style={overridden ? { cursor: "pointer" } : undefined}
                          >
                            {PERMISSION_LABELS[key]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-ink/8 bg-paper p-4">
        <p className="mb-3 text-sm font-medium text-ink">Add user</p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-10 flex-1 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 rounded-lg border border-ink/15 bg-tape px-3 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={`${pinLengthFor(role)}-digit PIN`}
            className="h-10 w-40 rounded-lg border border-ink/15 bg-tape px-3 text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <button
            onClick={add}
            className={cn(
              "h-10 rounded-lg bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
            )}
          >
            Add
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-medium text-stamp">{error}</p>}
      </div>
    </section>
  );
}
