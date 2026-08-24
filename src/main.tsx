// App entry. Runs the DB migration/seed once, then mounts the providers and shell.

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { migrate } from "./db/migrate";
import { LicenseGate } from "./auth/LicenseGate";
import { startSyncLoop } from "./sync/service";
import { Icon } from "./components/Icon";
import { APP_VERSION } from "./version";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false } },
});

function Boot() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<{ business_name?: string; vendor_name?: string } | null>(null);
  const [licensed, setLicensed] = useState(false);

  useEffect(() => {
    // migrate() is often fast enough (mock DB, or a warm real DB) that the
    // splash would otherwise flash by unreadably; hold it for a minimum time.
    const minDelay = new Promise((resolve) => setTimeout(resolve, 10_800));
    Promise.all([migrate(), minDelay])
      .then(async () => {
        // Best-effort: the settings table only exists once migrate() has run,
        // so this has to happen after — decorative, must never fail boot.
        try {
          const { getSettings } = await import("./db/queries/settings");
          const settings = await getSettings();
          setBrand(settings);
          setLicensed(settings.license_status === "active");
        } catch {
          /* branding is decorative; boot must not fail because of it */
        }
        setReady(true);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    // No-op until settings.sync_endpoint_url is configured (see src/sync/).
    if (licensed) startSyncLoop();
  }, [licensed]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6 text-center">
        <div className="max-w-md rounded-xl border border-stamp/30 bg-tape p-6 shadow-card">
          <p className="mb-2 font-semibold text-stamp">Database failed to start</p>
          <p className="text-sm text-ink/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper">
        <div className="animate-splash-logo flex h-20 w-20 items-center justify-center rounded-2xl bg-ledger shadow-card">
          <Icon name="store" size={36} className="text-tape" />
        </div>
        <p className="font-sans text-lg font-semibold text-ink">CounterTop</p>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-ledger/60"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        {/* Commercial-software branding, not just a bare loading spinner. */}
        <div className="mt-3 text-center text-xs leading-relaxed text-ink/40">
          <p>Version {APP_VERSION}</p>
          {brand?.business_name && <p>Licensed to: {brand.business_name}</p>}
          <p>
            © {new Date().getFullYear()} {brand?.vendor_name || "September Incorporation"}
          </p>
        </div>
      </div>
    );
  }

  if (!licensed) {
    return <LicenseGate onActivated={() => setLicensed(true)} />;
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Boot />
    </QueryClientProvider>
  </React.StrictMode>
);
