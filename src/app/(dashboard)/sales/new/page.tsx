import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import PageHeading from "@/components/ui/PageHeading";
import NewSaleForm from "./NewSaleForm";

export default async function NewSalePage() {
  const user = await requireRole(["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  const serviceOptions = await listServices(pool, { status: "ACTIVE" });

  return (
    <div>
      <PageHeading title="Add Sale" crumbs={[{ label: "Sales", href: "/sales" }, { label: "Add Sale" }]} />
      <NewSaleForm viewerRole={user.role} serviceOptions={serviceOptions} />
    </div>
  );
}
