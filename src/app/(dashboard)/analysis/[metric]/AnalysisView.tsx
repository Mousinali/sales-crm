"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CustomSelect from "@/components/ui/CustomSelect";
import Pagination from "@/components/ui/Pagination";
import StatTile from "@/components/ui/StatTile";
import Tabs from "@/components/ui/Tabs";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { Dimension, Metric } from "@/lib/analysis/performance";

type Row = { label: string; key: string; sales: number; paid: number; due: number; count: number };
type Result = { items: Row[]; page: number; pageSize: number; total: number; totalPages: number; grandSales: number; grandPaid: number; grandDue: number; grandCount: number };

const DIMENSIONS: { id: Dimension; label: string; icon: string; plural: string }[] = [
  { id: "client", label: "Client performance", icon: "ri-building-line", plural: "Clients" },
  { id: "employee", label: "Employee performance", icon: "ri-user-star-line", plural: "Employees" },
  { id: "industry", label: "By industry", icon: "ri-store-2-line", plural: "Industries" },
  { id: "category", label: "By employee category", icon: "ri-team-line", plural: "Categories" },
];
const RANGE_OPTIONS = [
  { value: "MONTH", label: "This month" },
  { value: "QUARTER", label: "This quarter" },
  { value: "YEAR", label: "This year" },
  { value: "ALL_TIME", label: "All time" },
];
const PAGE_SIZE = 10;

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const RANK_BADGE = ["bg-amber-100 text-amber-700", "bg-zinc-200 text-zinc-700", "bg-orange-100 text-orange-700"];

function Rank({ n }: { n: number }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${RANK_BADGE[n - 1] ?? "text-zinc-400"}`}>
      {n}
    </span>
  );
}

// Share of the amount actually collected, as a bar + percentage.
function Collected({ paid, sales }: { paid: number; sales: number }) {
  const pct = sales ? Math.min(100, (paid / sales) * 100) : 0;
  return (
    <div className="ml-auto flex w-32 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-zinc-500">{Math.round(pct)}%</span>
    </div>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return Array.from({ length: 6 }, (_, i) => (
    <tr key={i}>
      {Array.from({ length: cols }, (_, j) => (
        <td key={j} className="px-3 py-3">
          <div className="h-4 animate-pulse rounded bg-zinc-100" />
        </td>
      ))}
    </tr>
  ));
}

export default function AnalysisView({ metric }: { metric: Metric }) {
  const router = useRouter();
  const [dimension, setDimension] = useState<Dimension>("client");
  const [range, setRange] = useState("MONTH");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch(`/api/analysis/performance?metric=${metric}&dimension=${dimension}&range=${range}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load the analysis."));
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setResult(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, dimension, range, page]);

  const current = DIMENSIONS.find((d) => d.id === dimension)!;
  const isSales = metric === "sales";
  // Category rows carry the raw role key; show its label instead.
  const items = (result?.items ?? []).map((r) => ({ ...r, label: dimension === "category" ? formatRoleLabel(r.label) : r.label }));
  const rankOffset = ((result?.page ?? 1) - 1) * PAGE_SIZE;

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isSales ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <StatTile label="Total sales" value={rupees(result?.grandSales ?? 0)} icon="ri-money-rupee-circle-line" tone="brand" />
        {isSales ? (
          <StatTile label="Number of sales" value={result?.grandCount ?? 0} icon="ri-file-list-3-line" tone="sky" />
        ) : (
          <>
            <StatTile label="Total paid" value={rupees(result?.grandPaid ?? 0)} icon="ri-hand-coin-line" tone="violet" />
            <StatTile label="Total due" value={rupees(result?.grandDue ?? 0)} icon="ri-time-line" tone="amber" />
          </>
        )}
        <StatTile label={current.plural} value={result?.total ?? 0} icon={current.icon} tone="teal" />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-1">
          <div className="min-w-0 flex-1">
            <Tabs
              tabs={DIMENSIONS.map(({ id, label, icon }) => ({ id, label, icon }))}
              activeId={dimension}
              onChange={(id) => {
                setDimension(id as Dimension);
                setPage(1);
              }}
            />
          </div>
          <div className="w-44 pb-1 sm:pb-0">
            <CustomSelect
              aria-label="Period"
              value={range}
              options={RANGE_OPTIONS}
              onChange={(value) => {
                setRange(value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div>
          {error ? (
            <p className="p-4 text-sm text-rose-600">{error}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="w-14 px-4 py-2.5">Rank</th>
                      <th className="px-3 py-2.5">{current.plural.replace(/ies$/, "y").replace(/s$/, "")}</th>
                      <th className="px-3 py-2.5 text-right">Sales</th>
                      {!isSales && <th className="px-3 py-2.5 text-right">Paid</th>}
                      {!isSales && <th className="px-3 py-2.5 text-right">Due</th>}
                      {!isSales && <th className="px-3 py-2.5 text-right">Collected</th>}
                      <th className="px-3 py-2.5 text-right">No. of sales</th>
                      <th className="w-8 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {result === null && <SkeletonRows cols={isSales ? 5 : 8} />}
                    {items.map((r, i) => {
                      const href = `/analysis/${metric}/group?${new URLSearchParams({ dimension, key: r.key, name: r.label, range })}`;
                      return (
                        <tr key={`${r.key}-${i}`} onClick={() => router.push(href)} className="cursor-pointer hover:bg-zinc-50">
                          <td className="px-4 py-3">
                            <Rank n={rankOffset + i + 1} />
                          </td>
                          <td className="px-3 py-3">
                            <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium text-zinc-900 hover:text-brand-700 hover:underline">
                              {r.label}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-zinc-900">{rupees(r.sales)}</td>
                          {!isSales && <td className="px-3 py-3 text-right text-violet-700">{rupees(r.paid)}</td>}
                          {!isSales && <td className={`px-3 py-3 text-right ${r.due > 0 ? "text-amber-600" : "text-zinc-400"}`}>{rupees(r.due)}</td>}
                          {!isSales && (
                            <td className="px-3 py-3">
                              <Collected paid={r.paid} sales={r.sales} />
                            </td>
                          )}
                          <td className="px-3 py-3 text-right text-zinc-600">{r.count}</td>
                          <td className="px-3 py-3 text-zinc-300">
                            <i className="ri-arrow-right-s-line text-lg" aria-hidden="true" />
                          </td>
                        </tr>
                      );
                    })}
                    {result !== null && items.length === 0 && (
                      <tr>
                        <td colSpan={isSales ? 5 : 8} className="px-4 py-10 text-center text-zinc-500">
                          No sales in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {result && <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onChange={setPage} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
