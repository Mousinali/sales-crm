"use client";

import { useEffect, useState } from "react";
import { SkeletonList } from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

type Employee = { id: number; name: string; role: string; sales: number; count: number };

const RANGE_TABS = [
  { id: "MONTH", label: "This month" },
  { id: "QUARTER", label: "This quarter" },
  { id: "YEAR", label: "This year" },
  { id: "ALL_TIME", label: "All time" },
];

// Super admin's leaderboard of which employee brought in the most sales.
// Has its own range tabs (calendar month/quarter/year) rather than the
// page-wide period dropdown, which has no quarter or year.
export default function EmployeeRankingCard() {
  const [range, setRange] = useState("MONTH");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/dashboard/employee-ranking?range=${range}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load the ranking."));
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setEmployees(body.employees ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-2 text-sm font-semibold text-zinc-900">Top employees by sales</p>
      <Tabs tabs={RANGE_TABS} activeId={range} onChange={setRange} />
      <div className="mt-3">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : employees === null ? (
          <SkeletonList />
        ) : employees.length === 0 ? (
          <p className="text-sm text-zinc-500">No sales in this period.</p>
        ) : (
          <ol className="slim-scrollbar -mr-2 flex max-h-72 flex-col divide-y divide-zinc-100 overflow-y-auto pr-2">
            {employees.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="w-5 text-sm font-semibold text-zinc-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{e.name}</p>
                  <p className="text-xs text-zinc-500">{formatRoleLabel(e.role)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-zinc-900">₹{e.sales.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-zinc-500">{e.count} {e.count === 1 ? "sale" : "sales"}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
