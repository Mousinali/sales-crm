const STAT_TONE_CLASSES = {
  zinc: "bg-zinc-100 text-zinc-600",
  brand: "bg-brand-50 text-brand-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  violet: "bg-violet-50 text-violet-600",
} as const;

export default function StatTile({
  label,
  value,
  icon,
  tone = "zinc",
}: {
  label: string;
  value: number | string;
  icon: string;
  tone?: keyof typeof STAT_TONE_CLASSES;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${STAT_TONE_CLASSES[tone]}`}>
          <i className={`${icon} text-base`} aria-hidden="true" />
        </span>
        <p className="text-sm text-zinc-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-zinc-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
