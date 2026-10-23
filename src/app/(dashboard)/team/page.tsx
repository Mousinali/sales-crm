import { requireRole } from "../../../lib/auth/rbac";
import { pool } from "../../../lib/db";
import { creatableRolesFor } from "../../../lib/auth/roles";
import { listUsers } from "../../../lib/users/list";
import TeamView from "./TeamView";

export default async function TeamPage() {
  const user = await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const users = await listUsers(pool, user.role, {});

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Team</h1>
      <TeamView initialUsers={users} viewerRole={user.role} creatableRoles={[...creatableRolesFor(user.role)]} />
    </div>
  );
}
