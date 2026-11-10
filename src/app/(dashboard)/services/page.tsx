import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import PageHeading from "@/components/ui/PageHeading";
import ServicesView from "./ServicesView";

export default async function ServicesPage() {
  await requireRole(["SUPER_ADMIN"]);
  const services = await listServices(pool);

  return (
    <div>
      <PageHeading title="Services" count={services.length} crumbs={[{ label: "Services" }]} />
      <ServicesView initialServices={services} />
    </div>
  );
}
