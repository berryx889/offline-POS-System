// Data & backups (pos-prd.md §4.4, §6.7). Back up to a USB/file, restore from one,
// and see the auto-snapshot status. Restore is destructive, so it confirms first.

import { useRef, useState } from "react";
import { backupNow, restoreFromBytes, lastSnapshotDate } from "@/backup/service";
import { native } from "@/native";

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doBackup() {
    setError(null);
    setBusy(true);
    try {
      const where = await backupNow();
      setStatus(where ? `Backed up to ${where}` : "Backup cancelled.");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

  async function pickRestore() {
    if (native.kind === "tauri") {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ filters: [{ name: "CounterTop backup", extensions: ["ctbk"] }] });
      if (typeof path === "string") await runRestore(await readFile(path));
    } else {
      fileRef.current?.click();
    }
  }

  async function runRestore(bytes: Uint8Array) {
    if (!confirm("Restore will replace ALL current data with the backup. Continue?")) return;
    setError(null);
    setBusy(true);
    try {
      await restoreFromBytes(bytes);
      setStatus("Restored. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-ink/8 bg-tape p-5 shadow-card">
      <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-wide text-ink/50">
        Data & backups
      </h2>

      <p className="mb-4 text-sm text-ink/60">
        A backup is a single <span className="font-mono text-xs">.ctbk</span> file — copy it to a
        USB drive for safekeeping. The app also snapshots your data automatically once a day
        (keeping the last 14).
        {lastSnapshotDate() && (
          <> Last auto-snapshot: <span className="font-medium text-ink">{lastSnapshotDate()}</span>.</>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={doBackup}
          disabled={busy}
          className="h-11 rounded-xl bg-ledger px-5 text-sm font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Back up now
        </button>
        <button
          onClick={pickRestore}
          disabled={busy}
          className="h-11 rounded-xl border border-ink/15 px-5 text-sm font-semibold text-ink/70 hover:bg-paper disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
        >
          Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ctbk"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await runRestore(new Uint8Array(await f.arrayBuffer()));
            e.target.value = "";
          }}
        />
      </div>

      {status && <p className="mt-3 text-sm text-ledger">{status}</p>}
      {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}
    </section>
  );
}
