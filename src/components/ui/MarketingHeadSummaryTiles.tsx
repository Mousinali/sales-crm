"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// Scoped to the period picked in SuperAdminPeriodDropdown (shared via
// SuperAdminPeriodProvider) — same wiring as SuperAdminSummaryTiles, for
// the Marketing Head welcome row's 8 stat tiles instead of 4.
export default function MarketingHeadSummaryTiles() {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<{
    totalLeads: number;
    pendingReviewLeads: number;
    qualifiedLeads: number;
    convertedLeads: number;
    upcomingVisits: number;
    missedVisits: number;
    transferHistoryCount: number;
    conversionRate: number;
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
      <StatTile label="Total leads" value={summary?.totalLeads ?? 0} icon="ri-contacts-line" tone="brand" />
      <StatTile label="Awaiting review" value={summary?.pendingReviewLeads ?? 0} icon="ri-time-line" tone="amber" />
      <StatTile label="Qualified" value={summary?.qualifiedLeads ?? 0} icon="ri-shield-check-line" tone="sky" />
      <StatTile label="Converted" value={summary?.convertedLeads ?? 0} icon="ri-trophy-line" tone="emerald" />
      <StatTile label="Conversion rate" value={`${((summary?.conversionRate ?? 0) * 100).toFixed(1)}%`} icon="ri-pie-chart-line" tone="violet" />
      <StatTile label="Upcoming visits" value={summary?.upcomingVisits ?? 0} icon="ri-calendar-event-line" tone="teal" />
      <StatTile label="Missed visits" value={summary?.missedVisits ?? 0} icon="ri-calendar-close-line" tone="rose" />
      <StatTile label="Transfer history" value={summary?.transferHistoryCount ?? 0} icon="ri-arrow-left-right-line" tone="zinc" />
    </div>
  );
}
