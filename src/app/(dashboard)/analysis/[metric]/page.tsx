import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { METRICS, type Metric } from "@/lib/analysis/performance";
import PageHeading from "@/components/ui/PageHeading";
import AnalysisView from "./AnalysisView";

const TITLES: Record<Metric, string> = { sales: "Sales Analysis", payments: "Payment Analysis" };

export default async function AnalysisPage({ params }: { params: Promise<{ metric: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const { metric } = await params;
  if (!METRICS.includes(metric as Metric)) notFound();

  return (
    <div>
      <PageHeading title={TITLES[metric as Metric]} crumbs={[{ label: "Analysis" }, { label: TITLES[metric as Metric] }]} />
      <AnalysisView metric={metric as Metric} />
    </div>
  );
}
