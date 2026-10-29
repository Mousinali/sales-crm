import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { creatableRolesFor } from "@/lib/auth/roles";
import { listUsersPage } from "@/lib/users/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import TeamView from "./TeamView";

export default async function TeamPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD"]);
  const result = await listUsersPage(pool, user.role, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Team</h1>
      <TeamView
        initialUsers={result.items}
        initialTotal={result.total}
        initialTotalPages={result.totalPages}
        viewerRole={user.role}
        creatableRoles={[...creatableRolesFor(user.role)]}
      />
    </div>
  );
}
