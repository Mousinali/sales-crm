"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import PieChart from "@/components/ui/PieChart";
import BarChart from "@/components/ui/BarChart";
import EntriesChartCard, { ACCOUNTANT_METRICS } from "@/components/ui/EntriesChartCard";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

type Summary = {
  totalSales: number;
  salesCount: number;
  paymentsReceived: number;
  paymentDue: number;
  totalCompanies: number;
  receivedByMethod: Record<string, number>;
};

const METHOD_LABELS: Record<string, string> = { CASH: "Cash", CHEQUE: "Cheque", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CARD: "Card", OTHER: "Other" };
const METHOD_COLORS: Record<string, string> = { CASH: "#059669", CHEQUE: "#d97706", UPI: "#7c3aed", BANK_TRANSFER: "#0284c7", CARD: "#e11d48", OTHER: "#71717a" };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// Company-wide totals for the period picked in SuperAdminPeriodDropdown.
export default function AccountantDashboard() {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/accountant-summary?period=${period}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load the totals."));
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setSummary(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  const s = summary;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Total sales" value={rupees(s?.totalSales ?? 0)} icon="ri-money-rupee-circle-line" tone="emerald" />
        <StatTile label="Number of sales" value={s?.salesCount ?? 0} icon="ri-shopping-bag-line" tone="brand" />
        <StatTile label="Payment received" value={rupees(s?.paymentsReceived ?? 0)} icon="ri-hand-coin-line" tone="violet" />
        <StatTile label="Payment due" value={rupees(s?.paymentDue ?? 0)} icon="ri-time-line" tone="amber" />
        <StatTile label="Total companies" value={s?.totalCompanies ?? 0} icon="ri-building-line" tone="sky" />
      </div>
      <EntriesChartCard metrics={ACCOUNTANT_METRICS} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Received vs due</p>
          <PieChart
            stacked
            data={[
              { label: "Received", value: s?.paymentsReceived ?? 0, color: "#059669" },
              { label: "Due", value: s?.paymentDue ?? 0, color: "#d97706" },
            ]}
          />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Payments received by method</p>
          <BarChart
            data={Object.entries(s?.receivedByMethod ?? {}).map(([method, value]) => ({
              label: METHOD_LABELS[method] ?? method,
              value,
              color: METHOD_COLORS[method] ?? "#71717a",
            }))}
          />
        </div>
      </div>
    </div>
  );
}
