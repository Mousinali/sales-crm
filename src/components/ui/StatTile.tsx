import type { CSSProperties } from "react";

const TONE_ICON_BG = {
  zinc: "bg-zinc-600",
  brand: "bg-brand-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
} as const;

type Tone = keyof typeof TONE_ICON_BG;

// Tailwind only emits a `--color-<family>-<shade>` custom property for
// shades some className in the codebase actually names (e.g. -500 here,
// via TONE_ICON_BG) — the gradient below needs -100/-300 too, which
// nothing else uses, so var(--color-x-300) would silently resolve to
// nothing. Spelling out each tone's -100/-300/-500 once here (copied
// from Tailwind's own default palette, plus this app's brand scale)
// sidesteps that rather than fighting Tailwind's tree-shaking.
const TONE_COLORS: Record<Tone, { 100: string; 300: string; 500: string }> = {
  zinc: { 100: "oklch(92% 0.004 286.32)", 300: "oklch(70.5% 0.015 286.067)", 500: "oklch(44.2% 0.017 285.786)" },
  brand: { 100: "#fcdfe9", 300: "#f48bb1", 500: "#e91e67" },
  emerald: { 100: "oklch(95% 0.052 163.051)", 300: "oklch(84.5% 0.143 164.978)", 500: "oklch(69.6% 0.17 162.48)" },
  rose: { 100: "oklch(94.1% 0.03 12.58)", 300: "oklch(81% 0.117 11.638)", 500: "oklch(64.5% 0.246 16.439)" },
  amber: { 100: "oklch(96.2% 0.059 95.617)", 300: "oklch(87.9% 0.169 91.605)", 500: "oklch(76.9% 0.188 70.08)" },
  teal: { 100: "oklch(95.3% 0.051 180.801)", 300: "oklch(85.5% 0.138 181.071)", 500: "oklch(70.4% 0.14 182.503)" },
  sky: { 100: "oklch(95.1% 0.026 236.824)", 300: "oklch(82.8% 0.111 230.318)", 500: "oklch(68.5% 0.169 237.323)" },
  violet: { 100: "oklch(94.3% 0.029 294.588)", 300: "oklch(81.1% 0.111 293.571)", 500: "oklch(60.6% 0.25 292.717)" },
};

function toneStyle(tone: Tone): CSSProperties {
  const c = TONE_COLORS[tone];
  return {
    "--tile-fill-from": c[100],
    "--tile-fill-to": "#ffffff",
    "--tile-border-from": c[300],
    "--tile-border-to": `color-mix(in srgb, ${c[500]} 55%, #6b7280 45%)`,
  } as CSSProperties;
}

export default function StatTile({
  label,
  value,
  icon,
  tone = "zinc",
}: {
  label: string;
  value: number | string;
  icon: string;
  tone?: Tone;
}) {
  return (
    <div className="stat-tile p-4" style={toneStyle(tone)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-semibold text-zinc-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
          <p className="mt-1 text-xs font-semibold text-zinc-500">{label}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${TONE_ICON_BG[tone]}`}>
          <i className={`${icon} text-base`} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
