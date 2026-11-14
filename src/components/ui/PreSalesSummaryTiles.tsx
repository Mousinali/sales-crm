"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// Scoped to the period picked in SuperAdminPeriodDropdown (shared via
// SuperAdminPeriodProvider) — same wiring as MarketingHeadSummaryTiles,
// for the Pre-Sales welcome row's 4 stat tiles.
export default function PreSalesSummaryTiles() {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<{
    leadsCreated: number;
    leadsAwaitingReview: number;
    followUpsDueToday: number;
    upcomingTasks: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/pre-sales-summary?period=${period}`)
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
      <StatTile label="Leads created" value={summary?.leadsCreated ?? 0} icon="ri-add-circle-line" tone="brand" />
      <StatTile label="Awaiting review" value={summary?.leadsAwaitingReview ?? 0} icon="ri-time-line" tone="amber" />
      <StatTile label="Follow-ups due today" value={summary?.followUpsDueToday ?? 0} icon="ri-calendar-check-line" tone="sky" />
      <StatTile label="Upcoming tasks" value={summary?.upcomingTasks ?? 0} icon="ri-list-check" tone="teal" />
    </div>
  );
}
