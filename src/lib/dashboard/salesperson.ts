import type { Pool } from "pg";
import { listLeads } from "@/lib/leads/list";
import { listTasks } from "@/lib/tasks/crud";
import type { VisitRow } from "@/lib/visits/types";
import type { LeadActivityRow } from "@/lib/leads/activities";

export type UpcomingVisitRow = VisitRow & { company_name: string };

export async function getSalespersonDashboard(pool: Pool, userId: number) {
  const [leads, upcomingVisitsResult, followUpsDueToday, overdueTasks, recentActivitiesResult] = await Promise.all([
    listLeads(pool, { id: userId, role: "SALESPERSON" }, {}),
    pool.query<UpcomingVisitRow>(
      `SELECT v.*, l.company_name FROM client_visits v JOIN leads l ON l.id = v.lead_id
       WHERE v.salesperson_id = $1 AND v.status IN ('SCHEDULED', 'RESCHEDULED') AND v.visit_date >= current_date
       ORDER BY v.visit_date, v.start_time`,
      [userId],
    ),
    listTasks(pool, { id: userId, role: "SALESPERSON" }, { dueWithin: "TODAY" }),
    listTasks(pool, { id: userId, role: "SALESPERSON" }, { dueWithin: "OVERDUE" }),
    pool.query<LeadActivityRow>(
      "SELECT * FROM lead_activities WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 20",
      [userId],
    ),
  ]);

  const leadsByStatus: Record<string, number> = {};
  for (const lead of leads) {
    leadsByStatus[lead.status] = (leadsByStatus[lead.status] ?? 0) + 1;
  }

  return {
    assignedLeads: leads,
    upcomingVisits: upcomingVisitsResult.rows,
    followUpsDueToday,
    overdueTasks,
    recentActivities: recentActivitiesResult.rows,
    leadsByStatus,
    wonCount: leadsByStatus["CLOSED_WON"] ?? 0,
    lostCount: leadsByStatus["CLOSED_LOST"] ?? 0,
  };
}
