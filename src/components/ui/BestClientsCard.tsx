"use client";

import { useEffect, useState } from "react";
import { SkeletonList } from "@/components/ui/Skeleton";
import Link from "next/link";
import RankBadge from "@/components/ui/RankBadge";
import CustomSelect from "@/components/ui/CustomSelect";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

type Client = { company: string; sales: number; payments: number; due: number; excess: number; owners: { name: string; role: string }[] };

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
    <div className="flex h-full min-h-72 flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 p-4 pb-3">
        <p className="text-sm font-semibold text-zinc-900">Best performing clients</p>
        <div className="w-36">
          <CustomSelect aria-label="Period" value={period} options={PERIOD_OPTIONS} onChange={(value) => setPeriod(value as SummaryPeriod)} />
        </div>
      </div>
      {error ? (
        <p className="px-4 pb-4 text-sm text-rose-600">{error}</p>
      ) : clients === null ? (
        <div className="px-4 pb-4">
          <SkeletonList />
        </div>
      ) : clients.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-zinc-500">No sales in this period.</p>
      ) : (
        <div className="slim-scrollbar max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="w-12 px-4 py-2">#</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {clients.map((c, i) => (
                <tr key={c.company} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5">
                    <RankBadge n={i + 1} />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-zinc-900">{c.company}</p>
                    {showOwners && c.owners.length > 0 && (
                      <p className="text-xs text-zinc-500">{c.owners.map((o) => `${o.name} (${formatRoleLabel(o.role)})`).join(", ")}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-zinc-900">{rupees(c.sales)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-violet-700">{rupees(c.payments)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {c.excess > 0 && c.due === 0 ? (
                      <span className="font-medium text-violet-700">{rupees(c.excess)} excess</span>
                    ) : c.due > 0 ? (
                      <span className="text-amber-600">{rupees(c.due)}</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showOwners && clients && clients.length > 0 && (
        <Link href="/analysis/sales" className="mt-auto px-4 py-3 text-xs font-medium text-brand-700 hover:underline">
          View full analysis →
        </Link>
      )}
    </div>
  );
}
