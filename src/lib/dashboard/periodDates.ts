import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

// listLeads/listTasks take plain JS Date filters rather than the raw SQL
// snippets PERIOD_SINCE_SQL/PERIOD_UNTIL_SQL use (marketingHeadSummary.ts,
// superAdminSummary.ts) — this is the same TODAY/WEEK/MONTH/ALL_TIME
// window expressed as Dates instead, for preSalesSummary.ts and
// salespersonSummary.ts to pass straight into those helpers. `undefined`
// for ALL_TIME means "no bound", matching how those filters already treat
// an omitted dateFrom/dateTo/upcomingUntil.
function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function periodSinceDate(period: SummaryPeriod): Date | undefined {
  if (period === "ALL_TIME") return undefined;
  const start = startOfToday();
  if (period === "TODAY") return start;
  if (period === "WEEK") return new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000);
  return new Date(start.getTime() - 29 * 24 * 60 * 60 * 1000); // MONTH
}

export function periodUntilDate(period: SummaryPeriod): Date | undefined {
  if (period === "ALL_TIME") return undefined;
  const start = startOfToday();
  if (period === "TODAY") return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (period === "WEEK") return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000 - 1); // MONTH
}
