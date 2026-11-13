import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listPaymentsPage } from "@/lib/sales/payments";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import PaymentsView from "./PaymentsView";

export default async function PaymentsPage() {
  const user = await requireRole(["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);

  const result = await listPaymentsPage(pool, user, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeading title="Payments" count={result.total} crumbs={[{ label: "Payments" }]} />
      <PaymentsView initialPayments={result.items} initialTotal={result.total} initialTotalPages={result.totalPages} viewerRole={user.role} />
    </div>
  );
}
