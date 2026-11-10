import type { Pool } from "pg";
import { listLeads } from "@/lib/leads/list";
import { listTasks } from "@/lib/tasks/crud";

export async function getPreSalesDashboard(pool: Pool, userId: number) {
  const [leads, followUpsDueToday, upcomingTasks] = await Promise.all([
    listLeads(pool, { id: userId, role: "PRE_SALES" }, {}),
    listTasks(pool, { id: userId, role: "PRE_SALES" }, { dueWithin: "TODAY" }),
    listTasks(pool, { id: userId, role: "PRE_SALES" }, { dueWithin: "UPCOMING" }),
  ]);

  const leadsCreated = leads.filter((l) => l.created_by === userId);
  const leadsAwaitingReview = leads.filter((l) => l.status === "PENDING_REVIEW" || l.status === "MORE_INFO_REQUIRED");
  const recentlyUpdatedLeads = [...leads].sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime()).slice(0, 10);

  const leadsByStatus: Record<string, number> = {};
  for (const lead of leads) {
    leadsByStatus[lead.status] = (leadsByStatus[lead.status] ?? 0) + 1;
  }

  return {
    leadsCreated,
    leadsAwaitingReview,
    followUpsDueToday,
    upcomingTasks,
    recentlyUpdatedLeads,
    leadsByStatus,
  };
}
