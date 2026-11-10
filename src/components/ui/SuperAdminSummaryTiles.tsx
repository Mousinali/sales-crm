"use client";

import { useEffect, useState } from "react";
import StatTile from "@/components/ui/StatTile";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

// Scoped to the period picked in SuperAdminPeriodDropdown (shared via
// SuperAdminPeriodProvider); team members is a current headcount, not a
// time-series value, so it stays fixed regardless of the period.
export default function SuperAdminSummaryTiles({ totalTeamMembers }: { totalTeamMembers: number }) {
  const { period } = useSuperAdminPeriod();
  const [summary, setSummary] = useState<{ totalSales: number; totalLeads: number; totalCompanies: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/super-admin-summary?period=${period}`)
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
    <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0">
      <div className="min-w-[160px] shrink-0 sm:min-w-0 sm:shrink">
        <StatTile label="Total sales" value={`₹${(summary?.totalSales ?? 0).toLocaleString("en-IN")}`} icon="ri-money-rupee-circle-line" tone="emerald" />
      </div>
      <div className="min-w-[160px] shrink-0 sm:min-w-0 sm:shrink">
        <StatTile label="Total leads" value={summary?.totalLeads ?? 0} icon="ri-contacts-line" tone="brand" />
      </div>
      <div className="min-w-[160px] shrink-0 sm:min-w-0 sm:shrink">
        <StatTile label="Total companies" value={summary?.totalCompanies ?? 0} icon="ri-building-line" tone="sky" />
      </div>
      <div className="min-w-[160px] shrink-0 sm:min-w-0 sm:shrink">
        <StatTile label="Total team members" value={totalTeamMembers} icon="ri-team-line" tone="violet" />
      </div>
    </div>
  );
}
