"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// Scoped to the period picked in SuperAdminPeriodDropdown (shared via
// SuperAdminPeriodProvider) — same wiring as SuperAdminSummaryTiles, for
// the Marketing Head welcome row's 4 stat tiles.
export default function MarketingHeadSummaryTiles() {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<{
    totalLeads: number;
    totalVisits: number;
    mySales: number;
    myPayments: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/marketing-head-summary?period=${period}`)
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

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <StatTile loading={summary === null} label="Total sales" value={`₹${(summary?.mySales ?? 0).toLocaleString("en-IN")}`} icon="ri-money-rupee-circle-line" tone="emerald" />
      <StatTile loading={summary === null} label="Total payments" value={`₹${(summary?.myPayments ?? 0).toLocaleString("en-IN")}`} icon="ri-hand-coin-line" tone="violet" />
      <StatTile loading={summary === null} label="Total leads" value={summary?.totalLeads ?? 0} icon="ri-contacts-line" tone="brand" />
      <StatTile loading={summary === null} label="Total visits" value={summary?.totalVisits ?? 0} icon="ri-calendar-event-line" tone="teal" />
    </div>
  );
}
