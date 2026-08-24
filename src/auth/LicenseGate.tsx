// License activation, shown before the app opens at all on a fresh install
// (install → welcome → enter license key → verify → stored → continue).
// PIN setup isn't duplicated here — it's the OnboardingWizard's job
// (src/auth/OnboardingWizard.tsx), which already runs right after this on the
// first admin login; combining both into one flow would mean asking for a PIN
// twice for no reason.

import { useState } from "react";
import { setSetting } from "@/db/queries/settings";
import { verifyLicenseKey } from "./license";
import { Icon } from "@/components/Icon";

export function LicenseGate({ onActivated }: { onActivated: () => void }) {
  const [step, setStep] = useState<"welcome" | "key">("welcome");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setError(null);
    if (!key.trim()) return setError("Enter your license key.");
    setBusy(true);
    // "Verify online" per the product flow -- this app has no license server
    // yet, so verifyLicenseKey() checks the key's format/checksum locally
    // instead (see src/auth/license.ts for exactly what that does and doesn't
    // guarantee). The seam for a real online check lives there.
    const result = await verifyLicenseKey(key);
    setBusy(false);
    if (!result.valid) return setError(result.reason ?? "That license key is not valid.");
    await setSetting("license_key", key.trim().toUpperCase());
    await setSetting("license_status", "active");
    onActivated();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-2xl border border-ink/8 bg-tape p-8 shadow-card">
        <div className="mb-5 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ledger text-tape">
            <Icon name="store" size={30} />
          </div>
        </div>

        {step === "welcome" ? (
          <div className="text-center">
            <h1 className="font-sans text-xl font-semibold text-ink">CounterTop POS</h1>
            <p className="mt-2 text-sm text-ink/60">
              This copy needs to be activated with a license key before it can be used.
            </p>
            <button
              onClick={() => setStep("key")}
              className="mt-6 h-12 w-full rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              Enter license key
            </button>
          </div>
        ) : (
          <div>
            <h1 className="mb-1 text-center font-sans text-xl font-semibold text-ink">
              Activate CounterTop POS
            </h1>
            <p className="mb-5 text-center text-sm text-ink/60">
              Enter the license key you received when you purchased CounterTop POS.
            </p>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="SPT-XXXX-XXXX-XXXX"
              className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-3 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-carbon"
            />
            {error && <p className="mt-3 text-center text-sm font-medium text-stamp">{error}</p>}
            <button
              onClick={activate}
              disabled={busy}
              className="mt-5 h-12 w-full rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              {busy ? "Verifying…" : "Activate"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
