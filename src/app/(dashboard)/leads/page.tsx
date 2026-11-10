import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listLeadsPage } from "@/lib/leads/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import LeadsView from "./LeadsView";

export default async function LeadsPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  if (user.role === "HR") {
    redirect("/dashboard");
  }

  const result = await listLeadsPage(pool, user, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <LeadsView
      initialLeads={result.items}
      initialTotal={result.total}
      initialTotalPages={result.totalPages}
      viewerRole={user.role}
      viewerId={user.id}
    />
  );
}
