import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { ROLE_BADGE_CLASSES, ROLE_LABELS, initialsOf } from "@/app/(dashboard)/roleDisplay";
import { getSuperAdminDashboard } from "@/lib/dashboard/superAdmin";
import { getMarketingHeadDashboard } from "@/lib/dashboard/marketingHead";
import { getPreSalesDashboard } from "@/lib/dashboard/preSales";
import { getSalespersonDashboard } from "@/lib/dashboard/salesperson";

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function BreakdownList({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No data yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map(([key, count]) => (
            <li key={key} className="flex items-center justify-between">
              <span className="text-zinc-600">{key.replaceAll("_", " ")}</span>
              <span className="font-medium text-zinc-900">{count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WelcomeCard({ name, role }: { name: string; role: keyof typeof ROLE_LABELS }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
        {initialsOf(name)}
      </span>
      <div>
        <p className="text-base font-semibold text-zinc-900">Welcome back, {name}</p>
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[role]}`}>
          {ROLE_LABELS[role]}
        </span>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  // Re-validates the session here rather than trusting the layout above:
  // Next.js layouts don't re-render on navigation and don't gate their
  // child segments' RSC payload, so this page re-checks auth itself.
  const user = await requireUser();

  if (user.role === "HR") {
    return <WelcomeCard name={user.name} role={user.role} />;
  }

  if (user.role === "SUPER_ADMIN") {
    const d = await getSuperAdminDashboard(pool);
    return (
      <div className="flex flex-col gap-6">
        <WelcomeCard name={user.name} role={user.role} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="Email delivery failures" value={d.emailDeliveryFailures} />
          <StatTile label="Assignments (30d)" value={d.assignmentActivityCount30d} />
          <StatTile label="Transfers (30d)" value={d.transferActivityCount30d} />
          <StatTile label="Upcoming visits" value={d.upcomingVisits} />
          <StatTile label="Completed visits" value={d.completedVisits} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BreakdownList title="Active users by role" counts={d.activeUsersByRole} />
          <BreakdownList title="Leads by status" counts={d.leadsByStatus} />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Recent audit log</p>
          {d.recentAuditLogs.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.recentAuditLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-zinc-600">{log.action}</span>
                  <span className="text-xs text-zinc-400">{new Date(log.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (user.role === "MARKETING_HEAD") {
    const d = await getMarketingHeadDashboard(pool);
    return (
      <div className="flex flex-col gap-6">
        <WelcomeCard name={user.name} role={user.role} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="Total leads" value={d.totalLeads} />
          <StatTile label="Awaiting review" value={d.pendingReviewLeads} />
          <StatTile label="Qualified" value={d.qualifiedLeads} />
          <StatTile label="Converted" value={d.convertedLeads} />
          <StatTile label="Conversion rate" value={`${(d.conversionRate * 100).toFixed(1)}%`} />
          <StatTile label="Upcoming visits" value={d.upcomingVisits} />
          <StatTile label="Missed visits" value={d.missedVisits} />
          <StatTile label="Transfer history" value={d.transferHistoryCount} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BreakdownList title="Leads by status" counts={d.leadsByStatus} />
          <BreakdownList title="Leads by source" counts={d.leadsBySource} />
          <BreakdownList title="Leads by priority" counts={d.leadsByPriority} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BreakdownList title="Leads by Pre-sales owner" counts={d.leadsByPreSalesOwner} />
          <BreakdownList title="Leads by Salesperson owner" counts={d.leadsBySalespersonOwner} />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Overdue follow-ups ({d.overdueTasks.length})</p>
          {d.overdueTasks.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing overdue.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.overdueTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-zinc-900">{task.title}</span>
                  <span className="text-xs text-zinc-400">{new Date(task.due_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (user.role === "PRE_SALES") {
    const d = await getPreSalesDashboard(pool, user.id);
    return (
      <div className="flex flex-col gap-6">
        <WelcomeCard name={user.name} role={user.role} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatTile label="Leads created" value={d.leadsCreated.length} />
          <StatTile label="Awaiting review" value={d.leadsAwaitingReview.length} />
          <StatTile label="Follow-ups due today" value={d.followUpsDueToday.length} />
          <StatTile label="Upcoming tasks" value={d.upcomingTasks.length} />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Recently updated leads</p>
          {d.recentlyUpdatedLeads.length === 0 ? (
            <p className="text-sm text-zinc-500">No leads yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.recentlyUpdatedLeads.slice(0, 10).map((lead) => (
                <li key={lead.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-zinc-900">{lead.company_name}</span>
                  <span className="text-xs text-zinc-400">{new Date(lead.updated_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // SALESPERSON
  const d = await getSalespersonDashboard(pool, user.id);
  return (
    <div className="flex flex-col gap-6">
      <WelcomeCard name={user.name} role={user.role} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Assigned leads" value={d.assignedLeads.length} />
        <StatTile label="Upcoming visits" value={d.upcomingVisits.length} />
        <StatTile label="Due today" value={d.followUpsDueToday.length} />
        <StatTile label="Overdue" value={d.overdueTasks.length} />
        <StatTile label="Won" value={d.wonCount} />
        <StatTile label="Lost" value={d.lostCount} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownList title="Pipeline by status" counts={d.leadsByStatus} />
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Recent activity</p>
          {d.recentActivities.length === 0 ? (
            <p className="text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.recentActivities.slice(0, 10).map((activity) => (
                <li key={activity.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-zinc-600">{activity.type}</span>
                  <span className="text-xs text-zinc-400">{new Date(activity.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
