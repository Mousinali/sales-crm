import type { Pool } from "pg";
import { listLeads } from "@/lib/leads/list";
import { listTasks } from "@/lib/tasks/crud";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";
import { periodSinceDate, periodUntilDate } from "@/lib/dashboard/periodDates";

// The period-scoped counterpart to preSales.ts's all-time dashboard query,
// for the welcome row's 4 stat tiles. "Follow-ups due today" stays fixed
// to today regardless of period (there's no sensible "due today, but only
// counting last month" reading) — only "leads created"/"awaiting review"
// (scoped by when the lead was created) and "upcoming tasks" (scoped by
// how far forward the period's horizon reaches) actually change.
export async function getPreSalesPeriodSummary(pool: Pool, userId: number, period: SummaryPeriod) {
  const since = periodSinceDate(period);
  const until = periodUntilDate(period);

  const [leads, followUpsDueToday, upcomingTasks] = await Promise.all([
    listLeads(pool, { id: userId, role: "PRE_SALES" }, { dateFrom: since }),
    listTasks(pool, { id: userId, role: "PRE_SALES" }, { dueWithin: "TODAY" }),
    listTasks(pool, { id: userId, role: "PRE_SALES" }, { dueWithin: "UPCOMING", upcomingUntil: until }),
  ]);

  const leadsCreated = leads.filter((l) => l.created_by === userId);
  const leadsAwaitingReview = leads.filter((l) => l.status === "PENDING_REVIEW" || l.status === "MORE_INFO_REQUIRED");

  return {
    leadsCreated: leadsCreated.length,
    leadsAwaitingReview: leadsAwaitingReview.length,
    followUpsDueToday: followUpsDueToday.length,
    upcomingTasks: upcomingTasks.length,
  };
}
