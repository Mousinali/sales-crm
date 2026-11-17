import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listCompaniesPage, viewerScope } from "@/lib/companies/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import CompaniesView from "./CompaniesView";

export default async function CompaniesPage() {
  const user = await requireRole(["SUPER_ADMIN", "ACCOUNTANT", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  const result = await listCompaniesPage(pool, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE }, viewerScope(user));

  return (
    <div>
      <PageHeading title="Companies" count={result.total} crumbs={[{ label: "Companies" }]} />
      <CompaniesView canDelete={user.role === "SUPER_ADMIN"} initialCompanies={result.items} initialTotal={result.total} initialTotalPages={result.totalPages} />
    </div>
  );
}
