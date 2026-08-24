// Commercial-software-style "About" panel: product, version, who it's licensed
// to, license key, branch, and vendor support contact. The goal (per the
// product vision this was requested from) is that a shop owner sees this and
// trusts they're running professionally licensed software, not a one-off app.

import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/db/queries/settings";
import { mainBranch } from "@/db/queries/branches";
import { Icon } from "@/components/Icon";
import { APP_VERSION } from "@/version";

/** Show only the last group in full; the rest as bullets, e.g. •••• •••• 4F2A. */
function maskLicenseKey(key: string): string {
  const groups = key.split("-");
  if (groups.length < 2) return key;
  return groups.map((g, i) => (i === groups.length - 1 ? g : "•".repeat(g.length))).join("-");
}

export function AboutSection() {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: branch } = useQuery({ queryKey: ["main-branch"], queryFn: mainBranch });

  const year = new Date().getFullYear();

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-ink/8 bg-tape shadow-card">
      <div className="flex items-center gap-3 bg-ledger px-5 py-4 text-tape">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tape/15">
          <Icon name="store" size={20} />
        </div>
        <div>
          <p className="font-sans text-base font-semibold">CounterTop POS</p>
          <p className="text-xs text-tape/70">Version {APP_VERSION}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-4">
        <Item label="Licensed to">{settings?.business_name || "—"}</Item>
        <Item label="License">
          {settings?.license_key ? maskLicenseKey(settings.license_key) : "Not activated"}
        </Item>
        <Item label="Branch">{branch?.name ?? "—"}</Item>
        <Item label="Support">{settings?.support_phone || "—"}</Item>
      </dl>

      <p className="border-t border-ink/8 px-5 py-3 text-xs text-ink/40">
        © {year} {settings?.vendor_name || "September Incorporation"}. All Rights Reserved.
      </p>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink/40">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
