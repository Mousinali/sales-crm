"use client";

import { useEffect, useState } from "react";
import "@/components/ui/agChartsSetup";
import { AgCharts } from "ag-charts-react";
import type { AgCartesianChartOptions } from "ag-charts-community";

export type BarDatum = { label: string; value: number; color: string };

const AXIS_LABEL_STYLE = { fontSize: 12, color: "#71717a" };

// AG Charts doesn't reliably read its actual height back from the
// container's CSS — on first mount it's measured this as 300px
// regardless of what the wrapping div's real height was, so a fixed
// vertical chart ended up with its canvas drawn 80px taller than its
// `overflow-hidden` container and the bottom 80px (exactly where a
// bottom-axis category chart's labels live) silently clipped off.
// Passing `height` straight into the chart's own options is the only
// way confirmed to actually control it — this hook just supplies the
// right number for the current breakpoint.
function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDesktop(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);
  return isDesktop;
}

// Horizontal bars read better than vertical columns once labels are long or
// there are many categories (owner names, lead sources/statuses) — every
// current use of this component has one or the other, so it stays the
// default; pass `horizontal={false}` for a short, plain category set.
export default function BarChart({
  data,
  maxBars = 8,
  horizontal = true,
  // A time series needs its real chronological order and its real zeros
  // (a quiet hour is data, not nothing) — turn both off for that case
  // instead of the categorical default of ranking by magnitude.
  sortByValue = true,
  dropZero = true,
  showValueLabels = true,
  // A short magnitude-comparison chart relies on per-bar labels + hover
  // for exact figures and hides the axis scale to stay clean; a longer
  // time series has no per-bar labels (too dense) so it needs the scale
  // instead, to read values off the grid rather than just bar height.
  showValueAxis = false,
}: {
  data: BarDatum[];
  maxBars?: number;
  horizontal?: boolean;
  sortByValue?: boolean;
  dropZero?: boolean;
  showValueLabels?: boolean;
  showValueAxis?: boolean;
}) {
  const filtered = dropZero ? data.filter((d) => d.value > 0) : data;
  const sorted = sortByValue ? [...filtered].sort((a, b) => b.value - a.value) : filtered;
  const shown = sorted.slice(0, maxBars);
  const overflowCount = sorted.length - shown.length;

  const isDesktop = useIsDesktopViewport();
  const chartHeight = horizontal ? Math.max(shown.length * 34, 140) : isDesktop ? 300 : 220;

  if (shown.length === 0) {
    return <p className="text-sm text-zinc-500">No data yet.</p>;
  }

  const options: AgCartesianChartOptions = {
    data: shown,
    height: chartHeight,
    background: { fill: "transparent" },
    padding: { top: 8, right: 28, bottom: 8, left: 8 },
    axes: {
      x: {
        type: "category",
        position: horizontal ? "left" : "bottom",
        // Bottom-positioned category labels default to hiding themselves
        // entirely (not thinning to every Nth one) once they'd overlap at
        // the current width — a 7-or-30-point time series on a phone-width
        // card hits that every time. Rotating instead of hiding is what
        // keeps every tick labelled regardless of how little horizontal
        // room each one gets.
        label: horizontal ? AXIS_LABEL_STYLE : { ...AXIS_LABEL_STYLE, autoRotate: true, autoRotateAngle: 45 },
        line: { enabled: false },
        gridLine: { enabled: false },
      },
      y: {
        type: "number",
        position: horizontal ? "bottom" : "left",
        nice: true,
        label: showValueAxis ? { ...AXIS_LABEL_STYLE, formatter: ({ value }) => value.toLocaleString() } : { enabled: false },
        line: { enabled: false },
        gridLine: { style: [{ stroke: showValueAxis ? "#e4e4e7" : "#f4f4f5", lineDash: showValueAxis ? undefined : [4, 4] }] },
      },
    },
    series: [
      {
        type: "bar",
        xKey: "label",
        yKey: "value",
        direction: horizontal ? "horizontal" : "vertical",
        cornerRadius: 6,
        // A fixed pixel width stops a single (or near-single) category
        // from claiming its whole band and ballooning into a block — but
        // that same fixed width becomes a floor once there are enough
        // categories (a 30-point daily series) to force the chart wider
        // than its container. Past a few categories, a width *ratio* of
        // the band shrinks with it instead, so it never needs to overflow.
        ...(shown.length <= 6 ? { width: 28 } : { widthRatio: 0.6 }),
        itemStyler: ({ datum }) => ({ fill: (datum as BarDatum).color }),
        label: {
          enabled: showValueLabels,
          placement: "outside-end",
          color: "#18181b",
          fontWeight: "bold",
          fontSize: 12,
          formatter: ({ value }) => (typeof value === "number" ? value.toLocaleString() : String(value)),
        },
        tooltip: {
          renderer: ({ datum }) => ({
            title: (datum as BarDatum).label,
            data: [{ label: "Count", value: (datum as BarDatum).value.toLocaleString() }],
          }),
        },
      },
    ],
  };

  return (
    <div>
      <div className="overflow-hidden" style={{ height: chartHeight }}>
        <AgCharts options={options} />
      </div>
      {overflowCount > 0 && <p className="mt-1 text-xs text-zinc-400">+{overflowCount} more</p>}
    </div>
  );
}
