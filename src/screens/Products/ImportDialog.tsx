// Excel import dialog (pos-prd.md §6.3): download template → upload → validate and
// preview → commit. Invalid rows are shown with reasons and skipped on import.

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { downloadTemplate, parseWorkbook, commitRows, type ParsedRow } from "@/importer/products";
import { useSession } from "@/store/sessionStore";
import { MoneyText } from "@/components/MoneyText";
import { emit } from "@/lib/events";
import { cn } from "@/lib/cn";

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const userId = useSession((s) => s.user?.id) ?? 0;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = (rows?.length ?? 0) - validCount;

  async function onFile(file: File) {
    setError(null);
    setDone(null);
    setFileName(file.name);
    try {
      setRows(await parseWorkbook(file));
    } catch (e) {
      setError(`Could not read the file: ${e instanceof Error ? e.message : e}`);
      setRows(null);
    }
  }

  async function doImport() {
    if (!rows || validCount === 0) return;
    setBusy(true);
    try {
      const n = await commitRows(rows, userId);
      queryClient.invalidateQueries({ queryKey: ["products-manage"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["top-products"] });
      emit("stock:changed");
      setDone(n);
      setRows(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-ink/10 bg-tape p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-lg font-semibold text-ink">Import products from Excel</h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink">✕</button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={downloadTemplate}
            className="h-10 rounded-lg border border-ledger px-4 text-sm font-medium text-ledger hover:bg-ledger/5"
          >
            Download template
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="h-10 rounded-lg bg-ledger px-4 text-sm font-semibold text-tape hover:bg-ledger-deep"
          >
            Choose file
          </button>
          {fileName && <span className="text-sm text-ink/50">{fileName}</span>}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-stamp">{error}</p>}
        {done != null && (
          <p className="mt-4 rounded-lg border border-ledger/30 bg-ledger/5 px-4 py-3 text-sm text-ledger">
            Imported {done} product{done === 1 ? "" : "s"}.
          </p>
        )}

        {rows && (
          <>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-ledger">{validCount} ready</span>
              {invalidCount > 0 && <span className="text-stamp">{invalidCount} with errors (skipped)</span>}
            </div>

            <div className="mt-2 flex-1 overflow-auto rounded-lg border border-ink/10">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Retail</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNum} className={cn("border-b border-ink/5", r.errors.length > 0 && "bg-stamp/5")}>
                      <td className="px-3 py-2 text-ink/50">{r.rowNum}</td>
                      <td className="px-3 py-2 font-medium text-ink">{r.name || "—"}</td>
                      <td className="px-3 py-2 text-ink/60">{r.category || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {r.retailPesewas ? <MoneyText pesewas={r.retailPesewas} /> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-ink/70">{r.openingStock}</td>
                      <td className="px-3 py-2">
                        {r.errors.length === 0 ? (
                          <span className="text-ledger">✓ ready</span>
                        ) : (
                          <span className="text-xs text-stamp">{r.errors.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={doImport}
              disabled={busy || validCount === 0}
              className="mt-4 h-12 rounded-xl bg-ledger font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-carbon"
            >
              {busy ? "Importing…" : `Import ${validCount} product${validCount === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
