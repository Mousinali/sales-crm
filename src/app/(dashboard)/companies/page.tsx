import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listCompaniesPage } from "@/lib/companies/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import CompaniesView from "./CompaniesView";

export default async function CompaniesPage() {
  await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const result = await listCompaniesPage(pool, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeading title="Companies" count={result.total} crumbs={[{ label: "Companies" }]} />
      <CompaniesView initialCompanies={result.items} initialTotal={result.total} initialTotalPages={result.totalPages} />
    </div>
  );
}
