// PIN-pad login (pos-prd.md §2 — no email/password, there's no server). Pick a
// user, enter the PIN, land on the sales screen. Admin PIN is 6 digits, cashier 4.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listActiveUsers, authenticate, type User } from "@/db/queries/users";
import { getSettings } from "@/db/queries/settings";
import { useSession } from "@/store/sessionStore";
import { isAdminTier, pinLengthFor } from "@/auth/permissions";
import { logAudit } from "@/db/queries/audit";
import { Icon } from "@/components/Icon";
import { PinPad } from "./PinPad";
import { RecoverBox } from "./RecoverBox";
import { cn } from "@/lib/cn";

export function LoginScreen() {
  const login = useSession((s) => s.login);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listActiveUsers });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const maxLength = selected ? pinLengthFor(selected.role) : 6;

  async function submit() {
    if (!selected || pin.length < maxLength || busy) return;
    setBusy(true);
    const user = await authenticate(selected.id, pin);
    setBusy(false);
    if (user) {
      login(user);
      logAudit(user.id, "login", {});
    } else {
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      {/* subtle ledger backdrop band */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-ledger" />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ink/8 bg-tape shadow-card">
        {/* Brand header */}
        <div className="flex flex-col items-center bg-ledger px-8 pb-7 pt-8 text-tape">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tape/15">
            <Icon name="store" size={28} />
          </div>
          <h1 className="font-sans text-lg font-semibold">
            {settings?.business_name ?? "CounterTop POS"}
          </h1>
          {settings?.address && <p className="mt-0.5 text-xs text-tape/70">{settings.address}</p>}
        </div>

        <div className="p-8">
          {recovering ? (
            <RecoverBox onDone={() => setRecovering(false)} />
          ) : !selected ? (
            <div className="space-y-3">
              <p className="mb-4 text-center text-sm text-ink/50">Who's on the counter?</p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelected(u);
                    setPin("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-ink/8 bg-paper px-4 py-3.5 text-left",
                    "transition-colors hover:border-ledger/30 hover:bg-ledger/5",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-carbon"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
                      isAdminTier(u.role) ? "bg-ledger text-tape" : "bg-carbon/15 text-carbon"
                    )}
                  >
                    {u.name[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block font-sans font-semibold text-ink">{u.name}</span>
                    <span className="block text-xs uppercase tracking-wide text-ink/40">{u.role}</span>
                  </span>
                  <span className="text-lg text-ink/25">›</span>
                </button>
              ))}
              {users.length === 0 && (
                <p className="py-6 text-center text-sm text-ink/40">Setting up…</p>
              )}
              <button
                onClick={() => setRecovering(true)}
                className="mt-2 w-full pt-2 text-center text-sm text-carbon hover:underline"
              >
                Forgot PIN?
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setSelected(null)}
                className="mb-5 flex items-center gap-1 self-start text-sm text-carbon hover:underline"
              >
                ‹ Not {selected.name}?
              </button>
              <p className="mb-5 text-sm text-ink/60">
                Enter {selected.name}'s {maxLength}-digit PIN
              </p>
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
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-carbon"
                )}
              >
                {busy ? "Checking…" : "Enter"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
