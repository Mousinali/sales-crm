import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import NewLeadForm from "./NewLeadForm";

export default async function NewLeadPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  // Mirrors LeadsView's `canCreate` check — only these two roles ever see
  // the "New Lead" entry point, but the page itself re-enforces it rather
  // than trusting that nobody navigates here directly.
  if (user.role !== "PRE_SALES" && user.role !== "MARKETING_HEAD") {
    redirect("/leads");
  }

  const serviceOptions = await listServices(pool, { status: "ACTIVE" });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">New Lead</h1>
      <NewLeadForm serviceOptions={serviceOptions} />
    </div>
  );
}
