// First-time setup wizard. Shown once, right after the first admin-tier login
// on a fresh install, instead of dropping straight into the POS. The seed
// (src/db/seed.ts) already created a demo Owner/Ama + a "Main" branch so the
// app is usable immediately in dev/testing; this wizard's job is to let the
// real owner confirm/replace those with their own details rather than create
// a second, confusing set of accounts.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting } from "@/db/queries/settings";
import { resetPin, createUser, type Role } from "@/db/queries/users";
import { setRecoveryPhrase } from "@/db/queries/recovery";
import { mainBranch, updateBranch } from "@/db/queries/branches";
import { useSession } from "@/store/sessionStore";
import { ROLE_LABELS, pinLengthFor } from "@/auth/permissions";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/cn";

const CURRENCIES = ["GHS", "NGN", "USD", "EUR", "GBP"];
const TIMEZONES = ["Africa/Accra", "Africa/Lagos", "UTC"];

type Step =
  | "welcome"
  | "offline"
  | "features"
  | "backup"
  | "security"
  | "company"
  | "admin"
  | "branch"
  | "employees"
  | "done";

const STEPS: Step[] = [
  "welcome",
  "offline",
  "features",
  "backup",
  "security",
  "company",
  "admin",
  "branch",
  "employees",
  "done",
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const queryClient = useQueryClient();

  async function finish() {
    await setSetting("onboarding_complete", "1");
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    onComplete();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-ink/8 bg-tape shadow-card">
        <div className="flex-1 overflow-auto p-8">
          {step === "welcome" && <Welcome />}
          {step === "offline" && <Offline />}
          {step === "features" && <Features />}
          {step === "backup" && <Backup />}
          {step === "security" && <Security />}
          {step === "company" && <CompanyStep />}
          {step === "admin" && <AdminStep />}
          {step === "branch" && <BranchStep />}
          {step === "employees" && <EmployeesStep />}
          {step === "done" && <Done />}
        </div>

        <div className="flex items-center justify-between border-t border-ink/8 px-8 py-5">
          <div className="flex gap-1.5">
            {STEPS.map((s, idx) => (
              <span
                key={s}
                className={cn("h-1.5 w-1.5 rounded-full", idx === i ? "bg-ledger" : "bg-ink/15")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && step !== "done" && (
              <button
                onClick={() => setI((n) => n - 1)}
                className="h-11 rounded-xl border border-ink/15 px-5 text-sm font-semibold text-ink/70 hover:bg-paper focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                Back
              </button>
            )}
            {step === "done" ? (
              <button
                onClick={finish}
                className="h-11 rounded-xl bg-ledger px-6 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                Start using POS
              </button>
            ) : (
              <button
                onClick={() => setI((n) => n + 1)}
                className="h-11 rounded-xl bg-ledger px-6 text-sm font-semibold text-tape hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
              >
                {["company", "admin", "branch", "employees"].includes(step) ? "Save & continue" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-ledger text-tape">
      <Icon name="store" size={30} />
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-2xl font-semibold text-ink">Welcome to CounterTop POS</h1>
      <p className="mt-3 max-w-sm text-sm text-ink/60">
        Built for retail stores, supermarkets, pharmacies, wholesalers and distributors.
      </p>
    </div>
  );
}

function Offline() {
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-xl font-semibold text-ink">Offline first</h1>
      <p className="mt-3 max-w-sm text-sm text-ink/60">
        Every sale, restock, and receipt works with no internet connection at all — the counter
        never stops because the Wi-Fi went down.
      </p>
    </div>
  );
}

function Features() {
  const items = ["Barcode scanning", "Wholesale & retail pricing", "Inventory tracking", "Receipts", "Reports"];
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-xl font-semibold text-ink">Everything a counter needs</h1>
      <ul className="mt-4 grid w-full grid-cols-2 gap-2 text-left text-sm">
        {items.map((it) => (
          <li key={it} className="rounded-lg border border-ink/8 bg-paper px-3 py-2 text-ink/80">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Backup() {
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-xl font-semibold text-ink">Backups & multiple branches</h1>
      <p className="mt-3 max-w-sm text-sm text-ink/60">
        Automatic local backups keep the last two weeks safe, and one company can run more than
        one branch. Cloud sync and phone monitoring for owners are on the roadmap.
      </p>
    </div>
  );
}

function Security() {
  const items = ["Role-based permissions", "Audit logs for every change", "PIN protection", "Local backups"];
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-xl font-semibold text-ink">Security built in</h1>
      <ul className="mt-4 w-full space-y-2 text-left text-sm">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-2 text-ink/80">
            <span className="h-1.5 w-1.5 rounded-full bg-ledger" /> {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink/70">{label}</span>
      {children}
    </label>
  );
}

function inputCls() {
  return "w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon";
}

function CompanyStep() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!loaded) {
    getSettings().then((s) => {
      setForm(s);
      setLoaded(true);
    });
    return <p className="text-sm text-ink/40">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-1 font-sans text-xl font-semibold text-ink">Company setup</h1>
      <p className="mb-5 text-sm text-ink/60">
        You can leave anything blank and fill it in later from Settings.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StepField label="Business name">
          <input className={inputCls()} value={form.business_name ?? ""} onChange={(e) => { set("business_name", e.target.value); setSetting("business_name", e.target.value); }} />
        </StepField>
        <StepField label="Phone">
          <input className={inputCls()} value={form.phone ?? ""} onChange={(e) => { set("phone", e.target.value); setSetting("phone", e.target.value); }} />
        </StepField>
        <StepField label="Address">
          <input className={inputCls()} value={form.address ?? ""} onChange={(e) => { set("address", e.target.value); setSetting("address", e.target.value); }} />
        </StepField>
        <StepField label="TIN">
          <input className={inputCls()} value={form.tin_number ?? ""} onChange={(e) => { set("tin_number", e.target.value); setSetting("tin_number", e.target.value); }} />
        </StepField>
        <StepField label="VAT number">
          <input className={inputCls()} value={form.vat_number ?? ""} onChange={(e) => { set("vat_number", e.target.value); setSetting("vat_number", e.target.value); }} />
        </StepField>
        <StepField label="Currency">
          <select className={inputCls()} value={form.currency ?? "GHS"} onChange={(e) => { set("currency", e.target.value); setSetting("currency", e.target.value); }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </StepField>
        <StepField label="Timezone">
          <select className={inputCls()} value={form.timezone ?? "Africa/Accra"} onChange={(e) => { set("timezone", e.target.value); setSetting("timezone", e.target.value); }}>
            {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </StepField>
      </div>
    </div>
  );
}

function AdminStep() {
  const user = useSession((s) => s.user);
  const name = user?.name ?? "Owner";
  const [pin, setPin] = useState("");
  const [recovery, setRecovery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const need = user ? pinLengthFor(user.role) : 6;

  async function apply() {
    if (!user) return;
    if (pin && (pin.length !== need || !/^\d+$/.test(pin))) {
      return setStatus(`PIN must be ${need} digits.`);
    }
    if (pin) await resetPin(user.id, pin, user.id);
    if (recovery.trim()) await setRecoveryPhrase(recovery.trim(), user.id);
    setStatus("Saved.");
  }

  return (
    <div>
      <h1 className="mb-1 font-sans text-xl font-semibold text-ink">Admin account</h1>
      <p className="mb-5 text-sm text-ink/60">
        This is your existing {user ? ROLE_LABELS[user.role] : "admin"} login ({name}). Set a new
        PIN and a recovery phrase now, or keep the current one and do it later in Settings.
      </p>
      <div className="space-y-3">
        <StepField label={`New ${need}-digit PIN (optional)`}>
          <input type="password" inputMode="numeric" className={inputCls()} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="leave blank to keep current PIN" />
        </StepField>
        <StepField label="Recovery phrase (optional — resets a forgotten PIN)">
          <input className={inputCls()} value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="e.g. a memorable phrase only you know" />
        </StepField>
        <button onClick={apply} className="h-10 rounded-lg bg-ledger px-4 text-sm font-semibold text-tape hover:bg-ledger-deep">
          Save
        </button>
        {status && <p className="text-sm text-ledger">{status}</p>}
      </div>
    </div>
  );
}

function BranchStep() {
  const [name, setName] = useState("Main");
  const [code, setCode] = useState("MAIN");
  const [location, setLocation] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const user = useSession((s) => s.user);
  const [status, setStatus] = useState<string | null>(null);

  if (!loaded) {
    mainBranch().then((b) => {
      if (b) {
        setBranchId(b.id);
        setName(b.name);
        setCode(b.code);
        setLocation(b.location ?? "");
      }
      setLoaded(true);
    });
    return <p className="text-sm text-ink/40">Loading…</p>;
  }

  async function save() {
    if (!branchId || !user) return;
    await updateBranch(branchId, name, code, location || null, user.id);
    setStatus("Saved.");
  }

  return (
    <div>
      <h1 className="mb-1 font-sans text-xl font-semibold text-ink">Branch setup</h1>
      <p className="mb-5 text-sm text-ink/60">
        Every shop starts with one branch. Add more later from Settings if you open other
        locations.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StepField label="Branch name">
          <input className={inputCls()} value={name} onChange={(e) => setName(e.target.value)} />
        </StepField>
        <StepField label="Branch code">
          <input className={inputCls()} value={code} onChange={(e) => setCode(e.target.value)} />
        </StepField>
        <StepField label="Location">
          <input className={inputCls()} value={location} onChange={(e) => setLocation(e.target.value)} />
        </StepField>
      </div>
      <button onClick={save} className="mt-3 h-10 rounded-lg bg-ledger px-4 text-sm font-semibold text-tape hover:bg-ledger-deep">
        Save
      </button>
      {status && <p className="mt-2 text-sm text-ledger">{status}</p>}
    </div>
  );
}

function EmployeesStep() {
  const user = useSession((s) => s.user);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const need = pinLengthFor(role);

  async function add() {
    if (!user) return;
    if (!name.trim()) return setStatus("Name is required.");
    if (pin.length !== need || !/^\d+$/.test(pin)) return setStatus(`PIN must be ${need} digits.`);
    await createUser(name, role, pin, user.id);
    setName("");
    setPin("");
    setStatus(`${name} added.`);
  }

  return (
    <div>
      <h1 className="mb-1 font-sans text-xl font-semibold text-ink">First employees</h1>
      <p className="mb-5 text-sm text-ink/60">
        A cashier account (Ama) already exists for testing. Add real employees now, or do this
        later from Settings → Users & PINs.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input className={cn(inputCls(), "flex-1")} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls()} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(["cashier", "supervisor", "manager", "admin"] as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <input type="password" inputMode="numeric" className={cn(inputCls(), "w-32")} placeholder={`${need}-digit PIN`} value={pin} onChange={(e) => setPin(e.target.value)} />
        <button onClick={add} className="h-10 rounded-lg bg-ledger px-4 text-sm font-semibold text-tape hover:bg-ledger-deep">
          Add
        </button>
      </div>
      {status && <p className="mt-2 text-sm text-ledger">{status}</p>}
    </div>
  );
}

function Done() {
  return (
    <div className="flex flex-col items-center text-center">
      <Logo />
      <h1 className="font-sans text-xl font-semibold text-ink">All set</h1>
      <p className="mt-3 max-w-sm text-sm text-ink/60">
        Your shop is ready. You can change anything from Settings at any time.
      </p>
    </div>
  );
}
