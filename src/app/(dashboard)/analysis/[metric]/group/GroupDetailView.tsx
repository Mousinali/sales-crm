"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Pagination from "@/components/ui/Pagination";
import StatTile from "@/components/ui/StatTile";
import Timeline, { type TimelineEntry } from "@/components/ui/Timeline";
import type { Dimension, getGroupDetail } from "@/lib/analysis/performance";
import type { RankingRange } from "@/lib/dashboard/topClients";

const RANGE_LABELS: Record<RankingRange, string> = { MONTH: "This month", QUARTER: "This quarter", YEAR: "This year", ALL_TIME: "All time" };
const KIND_STYLE: Record<string, { icon: string; iconClass: string }> = {
  SALE: { icon: "ri-money-rupee-circle-line", iconClass: "bg-emerald-50 text-emerald-600" },
  PAYMENT: { icon: "ri-hand-coin-line", iconClass: "bg-violet-50 text-violet-600" },
  LEAD: { icon: "ri-chat-3-line", iconClass: "bg-sky-50 text-sky-600" },
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default function GroupDetailView({ detail, range }: { detail: Awaited<ReturnType<typeof getGroupDetail>>; dimension: Dimension; range: RankingRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { totals, sales, events } = detail;

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  const entries: TimelineEntry[] = events.map((e) => ({
    id: e.id,
    ...(KIND_STYLE[e.kind] ?? KIND_STYLE.LEAD),
    title: e.title,
    description: e.description,
    meta: e.actor ? `by ${e.actor}` : null,
    timestamp: e.at,
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">Sales made {RANGE_LABELS[range].toLowerCase()}, and what has been paid against them.</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total sales" value={rupees(totals.sales)} icon="ri-money-rupee-circle-line" tone="brand" />
        <StatTile label="Paid" value={rupees(totals.paid)} icon="ri-hand-coin-line" tone="violet" />
        <StatTile label="Due" value={rupees(totals.due)} icon="ri-time-line" tone="amber" />
        <StatTile label="Number of sales" value={totals.count} icon="ri-file-list-3-line" tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white xl:col-span-2">
          <p className="px-4 pt-4 text-sm font-semibold text-zinc-900">Sales ({totals.count})</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Sale</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Sold by</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sales.items.map((s) => (
                  <tr key={s.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2">
                      <Link href={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">
                        {s.saleNumber ?? `#${s.id}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-zinc-900">{s.company}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{new Date(s.saleDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="px-3 py-2 text-zinc-500">{s.owner ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-900">{rupees(s.amount)}</td>
                    <td className="px-3 py-2 text-right text-violet-700">{rupees(s.paid)}</td>
                    <td className={`px-4 py-2 text-right ${s.amount - s.paid > 0 ? "text-amber-600" : "text-zinc-400"}`}>{rupees(s.amount - s.paid)}</td>
                  </tr>
                ))}
                {sales.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No sales in this period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-zinc-100">
            <Pagination page={sales.page} totalPages={sales.totalPages} total={sales.total} onChange={goToPage} />
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Activity</p>
          <Timeline entries={entries} emptyText="No activity yet." />
        </div>
      </div>
    </div>
  );
}
