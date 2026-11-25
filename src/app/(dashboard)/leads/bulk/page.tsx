import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import PageHeading from "@/components/ui/PageHeading";
import BulkUploadView from "./BulkUploadView";

export default async function BulkUploadLeadPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  // Mirrors /leads/new: only the roles that may create a lead get this page.
  if (user.role !== "SUPER_ADMIN" && user.role !== "PRE_SALES" && user.role !== "MARKETING_HEAD" && user.role !== "SALESPERSON") {
    redirect("/leads");
  }

  return (
    <div>
      <PageHeading
        title="Bulk Upload Leads"
        crumbs={[{ label: "Leads", href: "/leads" }, { label: "Bulk Upload" }]}
      />
      <BulkUploadView />
    </div>
  );
}
