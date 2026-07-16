// Settings (pos-prd.md §6.7). Phase 3 covers the receipt + printer configuration
// and a test print. Users, backups, and recovery-phrase reset land in later phases.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, setSetting, type Settings } from "@/db/queries/settings";
import { testPrint } from "@/receipt/print";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";
import { UsersSection } from "./UsersSection";
import { RecoverySection } from "./RecoverySection";
import { BackupSection } from "./BackupSection";
import { AuditSection } from "./AuditSection";

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [form, setForm] = useState<Settings>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    await Promise.all(Object.entries(form).map(([k, v]) => setSetting(k, v ?? "")));
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    emit("settings:changed");
    setStatus("Saved.");
    setTimeout(() => setStatus(null), 2500);
  }

  async function runTestPrint() {
    const res = await testPrint(form);
    setStatus(res.method === "thermal" ? "Sent to printer." : "Opened print dialog (no thermal printer set).");
    setTimeout(() => setStatus(null), 3500);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 font-sans text-xl font-semibold text-ink">Settings</h1>

      <Section title="Business (printed on receipts)">
        <Field label="Business name">
          <Text value={form.business_name} onChange={(v) => set("business_name", v)} />
        </Field>
        <Field label="Address">
          <Text value={form.address} onChange={(v) => set("address", v)} />
        </Field>
        <Field label="Phone">
          <Text value={form.phone} onChange={(v) => set("phone", v)} />
        </Field>
        <Field label="Receipt footer">
          <textarea
            value={form.receipt_footer ?? ""}
            onChange={(e) => set("receipt_footer", e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          />
        </Field>
        <Field label="Tax rate % (0 = no tax; added on top at checkout)">
          <Text
            value={form.tax_rate_percent ?? "0"}
            onChange={(v) => set("tax_rate_percent", v)}
            placeholder="0"
          />
        </Field>
      </Section>

      <Section title="Printer">
        <Field label="Printer name (blank = use the OS print dialog)">
          <Text
            value={form.printer_name}
            onChange={(v) => set("printer_name", v)}
            placeholder="e.g. XP-58 / EPSON TM-T20"
          />
        </Field>
        <Field label="Paper width">
          <select
            value={form.paper_width ?? "80"}
            onChange={(e) => set("paper_width", e.target.value)}
            className="rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            <option value="58">58 mm</option>
            <option value="80">80 mm</option>
          </select>
        </Field>
        <Toggle
          label="Open cash drawer on cash sales"
          checked={form.cash_drawer_enabled === "1"}
          onChange={(c) => set("cash_drawer_enabled", c ? "1" : "0")}
        />
        <Toggle
          label="Scan sounds"
          checked={form.sound_enabled !== "0"}
          onChange={(c) => set("sound_enabled", c ? "1" : "0")}
        />
        <button
          onClick={runTestPrint}
          className="mt-2 h-11 rounded-xl border border-ledger px-5 text-sm font-semibold text-ledger hover:bg-ledger/5 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Test print
        </button>
      </Section>

      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={save}
          className="h-12 rounded-xl bg-ledger px-8 font-semibold text-tape shadow-card hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Save settings
        </button>
        {status && <span className="text-sm text-ledger">{status}</span>}
      </div>

      <UsersSection />
      <RecoverySection />
      <BackupSection />
      <AuditSection />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink/70">{label}</span>
      {children}
    </label>
  );
}

function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between focus:outline-none"
    >
      <span className="text-sm text-ink/70">{label}</span>
      <span
        className={cn(
          "flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-ledger" : "bg-ink/20"
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-tape shadow transition-transform",
            checked && "translate-x-5"
          )}
        />
      </span>
    </button>
  );
}
