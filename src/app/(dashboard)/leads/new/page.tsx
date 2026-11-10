import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import PageHeading from "@/components/ui/PageHeading";
import NewLeadForm from "./NewLeadForm";

export default async function NewLeadPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  // Mirrors LeadsView's `canCreate` check — only these roles ever see
  // the "New Lead" entry point, but the page itself re-enforces it rather
  // than trusting that nobody navigates here directly.
  if (user.role !== "PRE_SALES" && user.role !== "MARKETING_HEAD" && user.role !== "SALESPERSON") {
    redirect("/leads");
  }

  const serviceOptions = await listServices(pool, { status: "ACTIVE" });

  return (
    <div>
      <PageHeading title="New Lead" crumbs={[{ label: "Leads", href: "/leads" }, { label: "New Lead" }]} />
      <NewLeadForm serviceOptions={serviceOptions} />
    </div>
  );
}
