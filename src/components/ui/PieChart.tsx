"use client";

import "@/components/ui/agChartsSetup";
import { AgCharts } from "ag-charts-react";
import type { AgPolarChartOptions } from "ag-charts-community";
import type { BarDatum } from "@/components/ui/BarChart";

// A donut for part-to-whole stories with a handful of segments (<=6) — the
// legend direct-labels every slice (swatch + name), so identity never rides
// on color alone. For magnitude comparisons or >6 categories, use BarChart
// instead; this is not a drop-in replacement for it.
export default function PieChart({
  data,
  height,
  stacked = false,
}: {
  data: BarDatum[];
  height?: number;
  // Donut-beside-legend needs real width to breathe — stack the legend
  // below instead once the card is too narrow for that (e.g. a 3-up grid),
  // which also needs extra height for the legend row it adds.
  stacked?: boolean;
}) {
  const resolvedHeight = height ?? (stacked ? 320 : 220);
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((sum, d) => sum + d.value, 0);

  if (filtered.length === 0) {
    return <p className="text-sm text-zinc-500">No data yet.</p>;
  }

  // Beside the legend the donut gets less room than ag-charts' 300px default
  // floor, which it would otherwise overflow and have the bottom clipped off.
  const chartHeight = stacked ? resolvedHeight - 100 : resolvedHeight;

  const options: AgPolarChartOptions = {
    data: filtered,
    minHeight: chartHeight,
    minWidth: 120,
    background: { fill: "transparent" },
    padding: { top: 4, right: 4, bottom: 4, left: 4 },
    // Off in favour of the HTML legend below: the built-in one lays items out
    // in a wrapping row, can't show each slice's value, and orders them itself.
    legend: { enabled: false },
    series: [
      {
        type: "donut",
        angleKey: "value",
        legendItemKey: "label",
        calloutLabelKey: "label",
        innerRadiusRatio: 0.62,
        outerRadiusRatio: 0.82,
        sectorSpacing: 2,
        cornerRadius: 4,
        itemStyler: ({ datum }) => ({ fill: (datum as BarDatum).color }),
        calloutLabel: { enabled: false },
        innerLabels: [
          { text: total.toLocaleString(), fontSize: 20, fontWeight: "bold" as const, color: "#18181b" },
          { text: "Total", fontSize: 11, color: "#71717a", spacing: 2 },
        ],
        tooltip: {
          renderer: ({ datum }) => {
            const d = datum as BarDatum;
            return {
              title: d.label,
              data: [{ label: "Count", value: `${d.value.toLocaleString()} (${Math.round((d.value / total) * 100)}%)` }],
            };
          },
        },
      },
    ],
  };

  // Label left, count right — one row per slice, so the numbers line up in a
  // column and can be read down rather than hunted along a wrapping row.
  const legend = (
    <ul className={stacked ? "flex flex-col gap-2" : "flex min-w-36 flex-col gap-2"}>
      {filtered.map((d) => (
        <li key={d.label} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-zinc-600">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
            <span className="truncate">{d.label}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums text-zinc-900">
            {d.value.toLocaleString("en-IN")}
          </span>
        </li>
      ))}
    </ul>
  );

  if (stacked) {
    return (
      <div className="flex flex-col gap-4">
        <div style={{ height: chartHeight }}>
          <AgCharts options={options} />
        </div>
        {legend}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6" style={{ height: resolvedHeight }}>
      <div className="min-w-0 flex-1" style={{ height: chartHeight }}>
        <AgCharts options={options} />
      </div>
      {legend}
    </div>
  );
}
