import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listSalesPage } from "@/lib/sales/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import SalesView from "./SalesView";

export default async function SalesPage() {
  const user = await requireRole(["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);

  const result = await listSalesPage(pool, user, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeading title="Sales" count={result.total} crumbs={[{ label: "Sales" }]} />
      <SalesView initialSales={result.items} initialTotal={result.total} initialTotalPages={result.totalPages} />
    </div>
  );
}
