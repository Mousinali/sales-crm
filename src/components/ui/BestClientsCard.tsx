"use client";

import { useEffect, useState } from "react";
import CustomSelect from "@/components/ui/CustomSelect";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

type Client = { company: string; sales: number; payments: number; owners: { name: string; role: string }[] };

const PERIOD_OPTIONS = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "This week" },
  { value: "MONTH", label: "This month" },
  { value: "ALL_TIME", label: "All time" },
];

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// Top clients by sale amount for the card's own period dropdown (independent
// of the page-wide one) — the user's own for every role but the super admin, who sees all clients
// and who owns each sale.
export default function BestClientsCard({ showOwners = false }: { showOwners?: boolean }) {
  const [period, setPeriod] = useState<SummaryPeriod>("MONTH");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/best-clients?period=${period}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load best clients."));
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setClients(body.clients ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Best performing clients</p>
        <div className="w-36">
          <CustomSelect aria-label="Period" value={period} options={PERIOD_OPTIONS} onChange={(value) => setPeriod(value as SummaryPeriod)} />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : clients === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-zinc-500">No sales in the selected period.</p>
      ) : (
        <ol className="slim-scrollbar -mr-2 flex max-h-72 flex-col divide-y divide-zinc-100 overflow-y-auto pr-2">
          {clients.map((c, i) => (
            <li key={c.company} className="flex items-center gap-3 py-2">
              <span className="w-5 text-sm font-semibold text-zinc-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{c.company}</p>
                {showOwners && c.owners.length > 0 && (
                  <p className="truncate text-xs text-zinc-500">
                    {c.owners.map((o) => `${o.name} (${formatRoleLabel(o.role)})`).join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-zinc-900">{rupees(c.sales)}</p>
                <p className="text-xs text-zinc-500">{rupees(c.payments)} paid</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
