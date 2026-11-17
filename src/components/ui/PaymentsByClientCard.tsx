"use client";

import { useEffect, useState } from "react";
import BarChart from "@/components/ui/BarChart";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// The user's own payments received, per client company, for the period
// picked in SuperAdminPeriodDropdown.
export default function PaymentsByClientCard() {
  const { period } = useSuperAdminPeriod();
  const [clients, setClients] = useState<{ label: string; value: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/my-payments-by-client?period=${period}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load payments by client."));
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

  const total = (clients ?? []).reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-900">Payments by client</p>
      <p className="mb-3 text-xs text-zinc-500">₹{total.toLocaleString("en-IN")} received in the selected period</p>
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : clients === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-zinc-500">No payments received yet.</p>
      ) : (
        <BarChart data={clients.map((c) => ({ ...c, color: "#7c3aed" }))} />
      )}
    </div>
  );
}
