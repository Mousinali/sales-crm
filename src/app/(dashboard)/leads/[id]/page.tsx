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

  // None of these four depend on each other's result (just on `lead`
  // itself, already fetched above) — running them one at a time serialized
  // every page load behind 4 round trips instead of the slowest one. Under
  // load-testing this page averaged ~500ms (p95 ~1s), 3x any other page in
  // the app, for exactly this reason.
  const [activities, services, latestSale, ownerNames] = await Promise.all([
    listLeadActivities(pool, user, lead.id),
    listLeadServices(pool, lead.id),
    getLatestSaleForLead(pool, lead.id),
    getLeadOwnerNames(pool, lead),
  ]);
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
