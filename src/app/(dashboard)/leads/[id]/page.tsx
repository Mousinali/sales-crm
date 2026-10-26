import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { assertLeadVisible } from "@/lib/leads/guard";
import { listLeadActivities } from "@/lib/leads/activities";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import LeadDetailView from "./LeadDetailView";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    notFound();
  }

  let lead;
  try {
    lead = await assertLeadVisible(pool, user, leadId);
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) notFound();
    throw error;
  }

  const activities = await listLeadActivities(pool, user, lead.id);

  return <LeadDetailView lead={lead} activities={activities} viewerRole={user.role} viewerId={user.id} />;
}
