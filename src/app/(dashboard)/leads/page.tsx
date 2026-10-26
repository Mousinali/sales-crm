import { redirect } from "next/navigation";
import { requireRole } from "../../../lib/auth/rbac";
import { pool } from "../../../lib/db";
import { listLeads } from "../../../lib/leads/list";
import LeadsView from "./LeadsView";

export default async function LeadsPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  if (user.role === "HR") {
    redirect("/dashboard");
  }

  const leads = await listLeads(pool, user, {});

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Leads</h1>
      <LeadsView initialLeads={leads} viewerRole={user.role} />
    </div>
  );
}
