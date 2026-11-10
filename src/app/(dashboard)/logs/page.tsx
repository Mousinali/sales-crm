import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listAuditLogsPage } from "@/lib/audit/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import LogsView from "./LogsView";

export default async function LogsPage() {
  await requireRole(["SUPER_ADMIN"]);
  const result = await listAuditLogsPage(pool, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeading title="Logs" count={result.total} crumbs={[{ label: "Logs" }]} />
      <LogsView
        initialLogs={result.items.map((log) => ({ ...log, created_at: log.created_at.toISOString() }))}
        initialTotal={result.total}
        initialTotalPages={result.totalPages}
      />
    </div>
  );
}
