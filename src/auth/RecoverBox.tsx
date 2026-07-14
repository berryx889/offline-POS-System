// "Forgot PIN?" recovery on the login screen (pos-prd.md §2). Enter the recovery
// phrase, pick a user, set a new PIN. No admin session needed — that's the point.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listActiveUsers, pinLengthFor, type User } from "@/db/queries/users";
import { hasRecoveryPhrase, verifyRecoveryPhrase, resetPinViaRecovery } from "@/db/queries/recovery";
import { cn } from "@/lib/cn";

export function RecoverBox({ onDone }: { onDone: () => void }) {
  const { data: isSet } = useQuery({ queryKey: ["recovery-set"], queryFn: hasRecoveryPhrase });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: listActiveUsers });

  const [step, setStep] = useState<"phrase" | "reset">("phrase");
  const [phrase, setPhrase] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function checkPhrase() {
    setError(null);
    if (await verifyRecoveryPhrase(phrase)) setStep("reset");
    else setError("That recovery phrase is not correct.");
  }

  async function reset() {
    setError(null);
    if (!user) return setError("Choose a user.");
    const need = pinLengthFor(user.role);
    if (newPin.length !== need || !/^\d+$/.test(newPin)) return setError(`${user.role} PIN must be ${need} digits.`);
    await resetPinViaRecovery(user.id, newPin);
    setDone(true);
  }

  if (isSet === false) {
    return (
      <div className="text-center text-sm text-ink/60">
        No recovery phrase has been set yet. An admin can set one in Settings.
        <button onClick={onDone} className="mt-4 block w-full text-carbon hover:underline">
          Back to login
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm text-ledger">PIN reset. You can log in now.</p>
        <button onClick={onDone} className="mt-4 w-full rounded-xl bg-ledger py-3 font-semibold text-tape hover:bg-ledger-deep">
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div>
      {step === "phrase" ? (
        <>
          <p className="mb-3 text-sm text-ink/60">Enter the shop's recovery phrase.</p>
          <input
            type="password"
            autoFocus
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkPhrase()}
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <button onClick={checkPhrase} className="mt-4 w-full rounded-xl bg-ledger py-3 font-semibold text-tape hover:bg-ledger-deep">
            Continue
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink/60">Whose PIN are you resetting?</p>
          <div className="mb-3 space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => setUser(u)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm",
                  user?.id === u.id ? "border-ledger bg-ledger/5" : "border-ink/15 hover:bg-paper"
                )}
              >
                <span className="font-medium text-ink">{u.name}</span>
                <span className="text-xs uppercase text-ink/40">{u.role}</span>
              </button>
            ))}
          </div>
          {user && (
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder={`New ${pinLengthFor(user.role)}-digit PIN`}
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2.5 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
            />
          )}
          <button onClick={reset} className="mt-4 w-full rounded-xl bg-ledger py-3 font-semibold text-tape hover:bg-ledger-deep">
            Reset PIN
          </button>
        </>
      )}
      {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}
      <button onClick={onDone} className="mt-3 w-full text-center text-sm text-ink/50 hover:text-ink">
        Cancel
      </button>
    </div>
  );
}
