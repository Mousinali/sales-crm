import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { assertLeadVisible } from "@/lib/leads/guard";
import { listLeadServices } from "@/lib/leads/services";
import { listServices } from "@/lib/services/list";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import EditLeadForm from "./EditLeadForm";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Mirrors LeadDetailView's `canEdit` check — the page re-enforces it
  // rather than trusting that nobody navigates here directly.
  const canEdit =
    user.role === "MARKETING_HEAD" ||
    (user.role === "PRE_SALES" && (lead.pre_sales_owner_id === user.id || lead.created_by === user.id));
  if (!canEdit) {
    redirect(`/leads/${lead.id}`);
  }

  const [leadServices, serviceOptions] = await Promise.all([
    listLeadServices(pool, lead.id),
    listServices(pool, { status: "ACTIVE" }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit Lead</h1>
      <EditLeadForm lead={lead} serviceOptions={serviceOptions} initialServiceIds={leadServices.map((s) => s.id)} />
    </div>
  );
}
