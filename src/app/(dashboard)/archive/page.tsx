import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listLeadsPage } from "@/lib/leads/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import ArchiveView from "./ArchiveView";

export default async function ArchivePage() {
  const user = await requireRole(["SUPER_ADMIN"]);

  // Only the default (Leads) tab's first page loads server-side — Companies
  // and Users load lazily, the first time that tab is actually opened, so
  // visiting /archive doesn't fire three queries for views most visits
  // never switch to.
  const result = await listLeadsPage(pool, user, { archivedOnly: true }, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <PageHeading title="Archive" crumbs={[{ label: "Archive" }]} />
      <ArchiveView
        initialLeads={result.items.map((lead) => ({ ...lead, archived_at: lead.archived_at?.toISOString() ?? null }))}
        initialLeadsTotal={result.total}
        initialLeadsTotalPages={result.totalPages}
      />
    </div>
  );
}
