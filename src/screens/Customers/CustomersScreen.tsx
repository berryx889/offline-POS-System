// Customers & credit (pos-prd.md §1, v2). List customers with balances owed, add/
// edit them, view a statement, and record repayments. Admin screen.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCustomers,
  totalOutstanding,
  customerLedger,
  recordPayment,
  createCustomer,
  updateCustomer,
  setCustomerActive,
  type Customer,
  type CustomerInput,
} from "@/db/queries/customers";
import { useSession } from "@/store/sessionStore";
import { useAppEvent } from "@/lib/useAppEvent";
import { MoneyText } from "@/components/MoneyText";
import { toPesewas } from "@/money";
import { cn } from "@/lib/cn";

export function CustomersScreen() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => listCustomers() });
  const { data: outstanding = 0 } = useQuery({ queryKey: ["outstanding"], queryFn: totalOutstanding });

  useAppEvent("sale:completed", () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["outstanding"] });
    queryClient.invalidateQueries({ queryKey: ["ledger"] });
  });

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid h-full grid-cols-[1fr_400px]">
      <section className="flex flex-col overflow-hidden p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-sans text-xl font-semibold text-ink">Customers</h1>
          <button
            onClick={() => setEditing("new")}
            className="h-11 rounded-xl bg-ledger px-5 font-semibold text-tape shadow-card hover:bg-ledger-deep focus:outline-none focus:ring-2 focus:ring-carbon"
          >
            + Add customer
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-ink/10 bg-tape p-4 shadow-card">
          <p className="text-xs text-ink/50">Total outstanding (owed to the shop)</p>
          <MoneyText pesewas={outstanding} size="xl" currency className={cn("font-semibold", outstanding > 0 ? "text-stamp" : "text-ledger")} />
        </div>

        <div className="flex-1 overflow-auto rounded-2xl border border-ink/8 bg-tape shadow-card">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="sticky top-0 border-b border-ink/10 bg-paper/95 text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "cursor-pointer border-b border-ink/5 last:border-0",
                    selectedId === c.id ? "bg-ledger/10" : "hover:bg-ink/[0.03]"
                  )}
                >
                  <td className="px-4 py-3 font-sans font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-ink/60">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText pesewas={c.balance_pesewas} className={c.balance_pesewas > 0 ? "text-stamp" : "text-ink/50"} />
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-ink/40">
                    No customers yet. Add one to sell on credit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="border-l border-ink/10 bg-paper p-5">
        {selected ? (
          <CustomerDetail customer={selected} onEdit={() => setEditing(selected)} />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink/40">
            Select a customer to see their statement.
          </div>
        )}
      </aside>

      {editing && (
        <CustomerForm
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CustomerDetail({ customer, onEdit }: { customer: Customer; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const userId = useSession((s) => s.user?.id) ?? 0;
  const { data: ledger = [] } = useQuery({
    queryKey: ["ledger", customer.id],
    queryFn: () => customerLedger(customer.id),
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "momo">("cash");
  const [busy, setBusy] = useState(false);

  async function pay() {
    const p = toPesewas(amount);
    if (p <= 0) return;
    setBusy(true);
    await recordPayment(customer.id, p, method, userId);
    setAmount("");
    queryClient.invalidateQueries({ queryKey: ["ledger", customer.id] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    queryClient.invalidateQueries({ queryKey: ["outstanding"] });
    setBusy(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-sans text-lg font-semibold text-ink">{customer.name}</h2>
          <p className="text-sm text-ink/50">{customer.phone ?? "no phone"}</p>
        </div>
        <button onClick={onEdit} className="text-sm text-carbon hover:underline">Edit</button>
      </div>

      <div className="my-4 rounded-xl border border-ink/10 bg-tape p-4">
        <p className="text-xs text-ink/50">Balance owed</p>
        <MoneyText pesewas={customer.balance_pesewas} size="loud" currency className={customer.balance_pesewas > 0 ? "text-stamp" : "text-ledger"} />
      </div>

      {/* Record a repayment */}
      <div className="mb-4 rounded-xl border border-ink/10 bg-tape p-4">
        <p className="mb-2 text-sm font-medium text-ink">Record payment</p>
        <div className="flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="w-24 rounded-lg border border-ink/15 bg-tape px-3 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-carbon"
          />
          <div className="flex overflow-hidden rounded-lg border border-ink/15 text-xs">
            {(["cash", "momo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn("px-3 py-2 font-medium capitalize", method === m ? "bg-ledger text-tape" : "bg-tape text-ink/60")}
              >
                {m === "momo" ? "MoMo" : m}
              </button>
            ))}
          </div>
          <button
            onClick={pay}
            disabled={busy}
            className="ml-auto h-9 rounded-lg bg-ledger px-4 text-sm font-semibold text-tape hover:bg-ledger-deep disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {/* Statement */}
      <p className="mb-2 text-sm font-medium text-ink">Statement</p>
      <div className="flex-1 overflow-auto rounded-xl border border-ink/10 bg-tape">
        {ledger.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink/40">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-ink/5 text-sm">
            {ledger.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className={cn("font-medium", e.kind === "charge" ? "text-stamp" : "text-ledger")}>
                    {e.kind === "charge" ? "Credit sale" : `Payment (${e.method})`}
                  </span>
                  <div className="text-xs text-ink/40">
                    {e.receipt_no ? `${e.receipt_no} · ` : ""}
                    {new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span className={e.kind === "charge" ? "text-stamp" : "text-ledger"}>
                  {e.kind === "charge" ? "+" : "−"}
                  <MoneyText pesewas={e.amount_pesewas} size="sm" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [note, setNote] = useState(customer?.note ?? "");
  const [limit, setLimit] = useState(customer?.credit_limit_pesewas != null ? String(customer.credit_limit_pesewas / 100) : "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    const input: CustomerInput = {
      name,
      phone: phone.trim() || null,
      note: note.trim() || null,
      credit_limit_pesewas: limit.trim() ? toPesewas(limit) : null,
    };
    if (customer) await updateCustomer(customer.id, input);
    else await createCustomer(input);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-tape p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-sans text-lg font-semibold text-ink">{customer ? "Edit customer" : "Add customer"}</h2>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={setName} /></Field>
          <Field label="Phone"><Input value={phone} onChange={setPhone} /></Field>
          <Field label="Credit limit (GHS, optional)"><Input value={limit} onChange={setLimit} placeholder="no limit" /></Field>
          <Field label="Note"><Input value={note} onChange={setNote} /></Field>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-stamp">{error}</p>}
        <div className="mt-5 flex items-center justify-between">
          {customer && (
            <button
              onClick={async () => {
                await setCustomerActive(customer.id, customer.active !== 1);
                onSaved();
              }}
              className="text-sm text-carbon hover:underline"
            >
              {customer.active === 1 ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-11 rounded-xl border border-ink/15 px-5 text-ink/70 hover:bg-paper">Cancel</button>
            <button onClick={save} className="h-11 rounded-xl bg-ledger px-6 font-semibold text-tape hover:bg-ledger-deep">Save</button>
          </div>
        </div>
      </div>
    </div>
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

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-ink/15 bg-tape px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-carbon"
    />
  );
}
