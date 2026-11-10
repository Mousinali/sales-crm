import type { Pool } from "pg";

export async function getSuperAdminDashboard(pool: Pool) {
  const [usersByRole, leadsByPriority] = await Promise.all([
    pool.query<{ role: string; count: string }>("SELECT role, count(*) FROM users WHERE status = 'ACTIVE' GROUP BY role"),
    pool.query<{ priority: string; count: string }>("SELECT priority, count(*) FROM leads GROUP BY priority"),
  ]);

  return {
    activeUsersByRole: Object.fromEntries(usersByRole.rows.map((r) => [r.role, Number(r.count)])),
    leadsByPriority: Object.fromEntries(leadsByPriority.rows.map((r) => [r.priority, Number(r.count)])),
  };
}
