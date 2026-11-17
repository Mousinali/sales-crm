"use client";

import { useEffect, useState } from "react";
import BarChart, { type BarDatum } from "@/components/ui/BarChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import type { EntriesMetric, EntriesPeriod, EntriesPoint } from "@/lib/dashboard/entriesTimeSeries";

type MetricOption = { value: EntriesMetric; label: string };

const DEFAULT_METRICS: MetricOption[] = [
  { value: "LEADS", label: "Leads" },
  { value: "SALES", label: "Sales" },
  { value: "PAYMENTS", label: "Payments" },
];

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const ACCOUNTANT_METRICS: MetricOption[] = [
  { value: "SALES_AMOUNT", label: "Sales" },
  { value: "PAYMENTS_AMOUNT", label: "Payments" },
];

const PERIODS: { value: EntriesPeriod; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "Week" },
  { value: "MONTH", label: "Month" },
];

// The top source bar gets the full brand hue (emphasis), the rest a
// lighter tint of the same hue — same convention as the single-hue bar
// charts elsewhere on the dashboard, since this is a magnitude story
// (busiest period), not a categorical-identity one.
function toEmphasisBarData(points: EntriesPoint[], showAmount: boolean): BarDatum[] {
  const max = Math.max(0, ...points.map((p) => p.value));
  return points.map((p) => ({
    label: p.label,
    value: p.value,
    color: p.value > 0 && p.value === max ? "#d1155a" : "#f9bed4",
    // Leads have no money side, so they keep the plain count row.
    tooltipRows: showAmount
      ? [
          { label: "Count", value: p.count.toLocaleString("en-IN") },
          { label: "Amount", value: rupees(p.amount) },
        ]
      : undefined,
  }));
}

export default function EntriesChartCard({ metrics = DEFAULT_METRICS }: { metrics?: MetricOption[] }) {
  const [metric, setMetric] = useState<EntriesMetric>(metrics[0].value);
  const [period, setPeriod] = useState<EntriesPeriod>("WEEK");
  const [points, setPoints] = useState<EntriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Same fetch-on-dependency-change shape used elsewhere in the app;
    // react-hooks v7's set-state-in-effect rule flags the loading/error
    // reset even though there's no external system to synchronize with
    // here — the effect's whole job is to start and track the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/entries-series?metric=${metric}&period=${period}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await parseErrorMessage(response, "Could not load the chart."));
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setPoints(body.points ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [metric, period]);

  const isMoney = metric === "SALES_AMOUNT" || metric === "PAYMENTS_AMOUNT";
  // Leads are the only metric with nothing to total in rupees.
  const showAmount = metric !== "LEADS";
  const totalCount = points.reduce((sum, p) => sum + p.count, 0);
  const totalAmount = points.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {metrics.find((m) => m.value === metric)?.label} {isMoney ? "amount" : "entries"}
          </p>
          <p className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-700">{totalCount.toLocaleString("en-IN")}</span>
            {showAmount && <> · <span className="font-medium text-zinc-700">{rupees(totalAmount)}</span></>} in the selected period
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex flex-1 rounded-md border border-zinc-200 p-0.5 sm:flex-none">
            {metrics.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMetric(m.value)}
                className={`flex-1 cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors sm:flex-none ${
                  metric === m.value ? "bg-brand-50 text-brand-700" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 rounded-md border border-zinc-200 p-0.5 sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`flex-1 cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors sm:flex-none ${
                  period === p.value ? "bg-brand-50 text-brand-700" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <BarChart
            data={toEmphasisBarData(points, showAmount)}
            horizontal={false}
            maxBars={points.length}
            sortByValue={false}
            dropZero={false}
            showValueLabels={false}
            showValueAxis
          />
        )}
      </div>
    </div>
  );
}
