const RANK_BADGE = ["bg-amber-100 text-amber-700", "bg-zinc-200 text-zinc-700", "bg-orange-100 text-orange-700"];

// 1-based rank: gold, silver and bronze for the top three, plain after that.
export default function RankBadge({ n }: { n: number }) {
  return (
    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${RANK_BADGE[n - 1] ?? "text-zinc-400"}`}>
      {n}
    </span>
  );
}
