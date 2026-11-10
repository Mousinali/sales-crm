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

  const options: AgPolarChartOptions = {
    data: filtered,
    background: { fill: "transparent" },
    padding: { top: 4, right: 4, bottom: 4, left: 4 },
    legend: {
      position: stacked ? "bottom" : "right",
      item: { marker: { shape: "circle", size: 8 }, label: { color: "#52525b", fontSize: 13 } },
    },
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

  return (
    <div className="overflow-hidden" style={{ height: resolvedHeight }}>
      <AgCharts options={options} />
    </div>
  );
}
