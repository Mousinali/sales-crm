import type { Pool } from "pg";

export async function getSuperAdminDashboard(pool: Pool) {
  const [usersByRole, leadsByStatus, emailFailures, assignmentActivity, transferActivity, visits, auditLogs] =
    await Promise.all([
      pool.query<{ role: string; count: string }>("SELECT role, count(*) FROM users WHERE status = 'ACTIVE' GROUP BY role"),
      pool.query<{ status: string; count: string }>("SELECT status, count(*) FROM leads GROUP BY status"),
      pool.query<{ count: string }>("SELECT count(*) FROM email_logs WHERE status = 'FAILED'"),
      pool.query<{ count: string }>("SELECT count(*) FROM lead_assignments WHERE changed_at > now() - interval '30 days'"),
      pool.query<{ count: string }>("SELECT count(*) FROM lead_transfer_history WHERE transferred_at > now() - interval '30 days'"),
      pool.query<{ upcoming: string; completed: string }>(
        `SELECT
           count(*) FILTER (WHERE status IN ('SCHEDULED', 'RESCHEDULED') AND visit_date >= current_date) AS upcoming,
           count(*) FILTER (WHERE status = 'COMPLETED') AS completed
         FROM client_visits`,
      ),
      pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20"),
    ]);

  return {
    activeUsersByRole: Object.fromEntries(usersByRole.rows.map((r) => [r.role, Number(r.count)])),
    leadsByStatus: Object.fromEntries(leadsByStatus.rows.map((r) => [r.status, Number(r.count)])),
    emailDeliveryFailures: Number(emailFailures.rows[0].count),
    assignmentActivityCount30d: Number(assignmentActivity.rows[0].count),
    transferActivityCount30d: Number(transferActivity.rows[0].count),
    upcomingVisits: Number(visits.rows[0].upcoming),
    completedVisits: Number(visits.rows[0].completed),
    recentAuditLogs: auditLogs.rows,
  };
}
