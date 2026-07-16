// Users & PINs management (pos-prd.md §6.7). Add a cashier, reset a PIN, deactivate.
// Admin PINs are 6 digits, cashier 4. Every change is audited via the queries.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAllUsers,
  createUser,
  resetPin,
  setUserActive,
  pinLengthFor,
  type Role,
} from "@/db/queries/users";
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

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-users"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  async function add() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const need = pinLengthFor(role);
    if (pin.length !== need || !/^\d+$/.test(pin)) return setError(`${role} PIN must be ${need} digits.`);
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

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Users & PINs
      </h2>

      <ul className="mb-5 divide-y divide-ink/5">
        {users.map((u) => (
          <li key={u.id} className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-sans font-medium text-ink">{u.name}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-ink/40">{u.role}</span>
                {u.active !== 1 && <span className="ml-2 text-xs text-stamp">inactive</span>}
              </div>
              <div className="flex items-center gap-3 text-sm">
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
          </li>
        ))}
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
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
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
