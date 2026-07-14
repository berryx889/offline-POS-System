// PIN-pad login (pos-prd.md §2 — no email/password, there's no server). Pick a
// user, enter the PIN, land on the sales screen. Admin PIN is 6 digits, cashier 4.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listActiveUsers, authenticate, type User } from "@/db/queries/users";
import { getSettings } from "@/db/queries/settings";
import { useSession } from "@/store/sessionStore";
import { PinPad } from "./PinPad";
import { cn } from "@/lib/cn";

export function LoginScreen() {
  const login = useSession((s) => s.login);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listActiveUsers });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const maxLength = selected?.role === "admin" ? 6 : 4;

  async function submit() {
    if (!selected || pin.length < maxLength || busy) return;
    setBusy(true);
    const user = await authenticate(selected.id, pin);
    setBusy(false);
    if (user) {
      login(user);
    } else {
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-tape p-8 shadow-card">
        <div className="mb-8 text-center">
          <h1 className="font-sans text-xl font-semibold text-ledger">
            {settings?.business_name ?? "CounterTop POS"}
          </h1>
          <p className="mt-1 text-xs text-ink/50">{settings?.address ?? ""}</p>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-ink/60">Who's on the counter?</p>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setSelected(u);
                  setPin("");
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-ink/10 bg-paper",
                  "px-4 py-4 text-left transition-colors hover:bg-ledger/5",
                  "focus:outline-none focus:ring-2 focus:ring-carbon"
                )}
              >
                <span className="font-sans font-semibold text-ink">{u.name}</span>
                <span className="text-xs uppercase tracking-wide text-ink/40">{u.role}</span>
              </button>
            ))}
            {users.length === 0 && (
              <p className="py-6 text-center text-sm text-ink/40">Setting up…</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <button
              onClick={() => setSelected(null)}
              className="mb-4 self-start text-xs text-carbon hover:underline"
            >
              ← {selected.name}
            </button>
            <PinPad
              value={pin}
              onChange={setPin}
              onSubmit={submit}
              maxLength={maxLength}
              shake={shake}
            />
            <button
              onClick={submit}
              disabled={pin.length < maxLength || busy}
              className={cn(
                "mt-6 h-14 w-full max-w-xs rounded-xl bg-ledger text-lg font-semibold text-tape",
                "transition-colors hover:bg-ledger-deep disabled:opacity-40",
                "focus:outline-none focus:ring-2 focus:ring-carbon"
              )}
            >
              {busy ? "Checking…" : "Enter"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
