"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// Scoped to the period picked in SuperAdminPeriodDropdown (shared via
// SuperAdminPeriodProvider) — same wiring as MarketingHeadSummaryTiles,
// for the Salesperson welcome row's 6 stat tiles.
export default function SalespersonSummaryTiles() {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<{
    assignedLeads: number;
    upcomingVisits: number;
    dueToday: number;
    overdue: number;
    wonCount: number;
    lostCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/salesperson-summary?period=${period}`)
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
      <StatTile label="Assigned leads" value={summary?.assignedLeads ?? 0} icon="ri-briefcase-line" tone="brand" />
      <StatTile label="Upcoming visits" value={summary?.upcomingVisits ?? 0} icon="ri-calendar-event-line" tone="teal" />
      <StatTile label="Due today" value={summary?.dueToday ?? 0} icon="ri-time-line" tone="sky" />
      <StatTile label="Overdue" value={summary?.overdue ?? 0} icon="ri-alarm-warning-line" tone="rose" />
      <StatTile label="Won" value={summary?.wonCount ?? 0} icon="ri-trophy-line" tone="emerald" />
      <StatTile label="Lost" value={summary?.lostCount ?? 0} icon="ri-close-circle-line" tone="rose" />
    </div>
  );
}
