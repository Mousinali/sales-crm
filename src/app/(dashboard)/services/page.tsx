import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import ServicesView from "./ServicesView";

export default async function ServicesPage() {
  await requireRole(["SUPER_ADMIN"]);
  const services = await listServices(pool);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Services</h1>
      <ServicesView initialServices={services} />
    </div>
  );
}
