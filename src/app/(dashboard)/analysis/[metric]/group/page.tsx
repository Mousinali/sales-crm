import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { DIMENSIONS, METRICS, getGroupDetail, type Dimension, type Metric } from "@/lib/analysis/performance";
import { RANKING_RANGES, type RankingRange } from "@/lib/dashboard/topClients";
import PageHeading from "@/components/ui/PageHeading";
import GroupDetailView from "./GroupDetailView";

const TITLES: Record<Metric, string> = { sales: "Sales Analysis", payments: "Payment Analysis" };
const PAGE_SIZE = 10;

// One client / employee / industry / category from the analysis table:
// its sales for the period plus a timeline of everything that happened on them.
export default async function AnalysisGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ dimension?: string; key?: string; name?: string; range?: string; page?: string }>;
}) {
  await requireRole(["SUPER_ADMIN"]);
  const { metric } = await params;
  const q = await searchParams;
  if (!METRICS.includes(metric as Metric) || !DIMENSIONS.includes(q.dimension as Dimension) || !q.key) notFound();
  const range: RankingRange = RANKING_RANGES.includes(q.range as RankingRange) ? (q.range as RankingRange) : "MONTH";
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);

  const detail = await getGroupDetail(pool, q.dimension as Dimension, q.key, range, { page, pageSize: PAGE_SIZE });
  const name = q.name || q.key;

  return (
    <div>
      <PageHeading
        title={name}
        crumbs={[{ label: "Analysis" }, { label: TITLES[metric as Metric], href: `/analysis/${metric}` }, { label: name }]}
      />
      <GroupDetailView detail={detail} dimension={q.dimension as Dimension} range={range} />
    </div>
  );
}
