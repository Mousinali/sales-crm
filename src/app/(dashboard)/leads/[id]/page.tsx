import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { assertLeadVisible } from "@/lib/leads/guard";
import { listLeadActivities } from "@/lib/leads/activities";
import { listLeadServices } from "@/lib/leads/services";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import { getLatestSaleForLead } from "@/lib/sales/summary";
import { getLeadOwnerNames } from "@/lib/leads/owners";
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
  const services = await listLeadServices(pool, lead.id);
  const latestSale = await getLatestSaleForLead(pool, lead.id);
  const ownerNames = await getLeadOwnerNames(pool, lead);
  const leadWithSale = {
    ...lead,
    latest_sale_id: latestSale?.id ?? null,
    latest_sale_budget_amount: latestSale?.budget_amount ?? null,
    latest_sale_paid_amount: latestSale?.paid_amount ?? null,
    pre_sales_owner_name: ownerNames.preSalesOwnerName,
    salesperson_owner_name: ownerNames.salespersonOwnerName,
    created_by_name: ownerNames.createdByName,
  };

  return <LeadDetailView lead={leadWithSale} activities={activities} services={services} viewerRole={user.role} viewerId={user.id} />;
}
