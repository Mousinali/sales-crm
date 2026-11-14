import type { ReactNode } from "react";
import Link from "next/link";
import DashboardRefreshButton from "./DashboardRefreshButton";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import { initialsOf } from "@/components/ui/initials";
import { getSuperAdminDashboard } from "@/lib/dashboard/superAdmin";
import { getMarketingHeadDashboard } from "@/lib/dashboard/marketingHead";
import { getPreSalesDashboard } from "@/lib/dashboard/preSales";
import { getSalespersonDashboard } from "@/lib/dashboard/salesperson";
import BarChart, { type BarDatum } from "@/components/ui/BarChart";
import PieChart from "@/components/ui/PieChart";
import Timeline from "@/components/ui/Timeline";
import EntriesChartCard from "@/components/ui/EntriesChartCard";
import SuperAdminSummaryTiles from "@/components/ui/SuperAdminSummaryTiles";
import MarketingHeadSummaryTiles from "@/components/ui/MarketingHeadSummaryTiles";
import PreSalesSummaryTiles from "@/components/ui/PreSalesSummaryTiles";
import SalespersonSummaryTiles from "@/components/ui/SalespersonSummaryTiles";
import SuperAdminPeriodDropdown from "@/components/ui/SuperAdminPeriodDropdown";
import { SuperAdminPeriodProvider } from "@/components/ui/SuperAdminPeriodContext";
import { leadStatusBarData, leadPriorityBarData, roleBarData, ownerBarData } from "@/app/(dashboard)/dashboardChartColors";
import { LEAD_STATUS_LABELS, LEAD_ACTIVITY_DISPLAY } from "@/app/(dashboard)/leadDisplay";

function ChartCard({ title, data }: { title: string; data: BarDatum[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <BarChart data={data} />
    </div>
  );
}

// A donut reads better than a bar for "how is this one total split up" when
// there are only a few segments — kept separate from ChartCard/BarChart
// (still the right choice for >6 categories or magnitude comparisons).
function PieCard({ title, data, stacked = false }: { title: string; data: BarDatum[]; stacked?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-zinc-900">{title}</p>
      <PieChart data={data} stacked={stacked} />
    </div>
  );
}

function WelcomeCard({
  name,
  role,
  designation,
  avatarUrl,
  extra,
}: {
  name: string;
  role: keyof typeof ROLE_LABELS;
  designation: string | null;
  avatarUrl?: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:p-6">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not a static asset next/image can optimize.
          <img src={avatarUrl} alt={name} className="hidden h-12 w-12 shrink-0 rounded-full object-cover sm:block" />
        ) : (
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600 sm:flex">
            {initialsOf(name)}
          </span>
        )}
        <div>
          <p className="text-sm font-semibold text-zinc-900 sm:text-base">
            <span className="hidden sm:inline">Welcome back, </span>
            {name}
          </p>
          <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium sm:text-xs ${ROLE_BADGE_CLASSES[role]}`}>
            {designation || ROLE_LABELS[role]}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        <DashboardRefreshButton />
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
    return (
      <SuperAdminPeriodProvider>
        <WelcomeCard
          name={user.name}
          role={user.role}
          designation={user.designation}
          avatarUrl={user.avatarUrl}
          extra={<SuperAdminPeriodDropdown />}
        />
      </SuperAdminPeriodProvider>
    );
  }

  if (user.role === "SUPER_ADMIN") {
    const d = await getSuperAdminDashboard(pool);
    return (
      <SuperAdminPeriodProvider>
        <div className="flex flex-col gap-6">
          <WelcomeCard
            name={user.name}
            role={user.role}
            designation={user.designation}
            avatarUrl={user.avatarUrl}
            extra={<SuperAdminPeriodDropdown />}
          />
          <SuperAdminSummaryTiles />
          <EntriesChartCard />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PieCard title="Active users by role" data={roleBarData(d.activeUsersByRole)} stacked />
            <PieCard title="Leads by priority" data={leadPriorityBarData(d.leadsByPriority)} stacked />
          </div>
        </div>
      </SuperAdminPeriodProvider>
    );
  }

  if (user.role === "MARKETING_HEAD") {
    const d = await getMarketingHeadDashboard(pool);
    return (
      <SuperAdminPeriodProvider>
        <div className="flex flex-col gap-6">
          <WelcomeCard
            name={user.name}
            role={user.role}
            designation={user.designation}
            avatarUrl={user.avatarUrl}
            extra={<SuperAdminPeriodDropdown />}
          />
          <MarketingHeadSummaryTiles />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EntriesChartCard />
            </div>
            <PieCard title="Leads by priority" data={leadPriorityBarData(d.leadsByPriority)} stacked />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard title="Leads by Pre-sales owner" data={ownerBarData(d.leadsByPreSalesOwner)} />
            <ChartCard title="Leads by Salesperson owner" data={ownerBarData(d.leadsBySalespersonOwner)} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-zinc-900">Overdue follow-ups ({d.overdueTasks.length})</p>
            <Timeline
              emptyText="Nothing overdue."
              entries={d.overdueTasks.map((task) => ({
                id: task.id,
                icon: "ri-alarm-warning-line",
                iconClass: "bg-rose-50 text-rose-600",
                title: task.title,
                timestamp: task.due_at,
              }))}
            />
          </div>
        </div>
      </SuperAdminPeriodProvider>
    );
  }

  if (user.role === "PRE_SALES") {
    const d = await getPreSalesDashboard(pool, user.id);
    return (
      <SuperAdminPeriodProvider>
        <div className="flex flex-col gap-6">
          <WelcomeCard
            name={user.name}
            role={user.role}
            designation={user.designation}
            avatarUrl={user.avatarUrl}
            extra={<SuperAdminPeriodDropdown />}
          />
          <PreSalesSummaryTiles />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChartCard title="Pipeline by status" data={leadStatusBarData(d.leadsByStatus)} />
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-zinc-900">Recently updated leads</p>
              <Timeline
                emptyText="No leads yet."
                entries={d.recentlyUpdatedLeads.slice(0, 10).map((lead) => ({
                  id: lead.id,
                  icon: "ri-refresh-line",
                  iconClass: "bg-sky-50 text-sky-600",
                  title: lead.company_name,
                  meta: LEAD_STATUS_LABELS[lead.status],
                  timestamp: lead.updated_at,
                }))}
              />
            </div>
          </div>
        </div>
      </SuperAdminPeriodProvider>
    );
  }

  // SALESPERSON
  const d = await getSalespersonDashboard(pool, user.id);
  return (
    <SuperAdminPeriodProvider>
      <div className="flex flex-col gap-6">
        <WelcomeCard
          name={user.name}
          role={user.role}
          designation={user.designation}
          avatarUrl={user.avatarUrl}
          extra={<SuperAdminPeriodDropdown />}
        />
        <SalespersonSummaryTiles />
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-900">Upcoming visits ({d.upcomingVisits.length})</p>
          {d.upcomingVisits.length === 0 ? (
            <p className="text-sm text-zinc-500">No visits scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.upcomingVisits.map((visit) => (
                <li key={visit.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                  <Link href={`/leads/${visit.lead_id}`} className="font-medium text-brand-700 hover:underline">
                    {visit.company_name}
                  </Link>
                  <span className="text-xs text-zinc-400">
                    {visit.visit_date} {visit.start_time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartCard title="Pipeline by status" data={leadStatusBarData(d.leadsByStatus)} />
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-zinc-900">Recent activity</p>
            <Timeline
              emptyText="No activity yet."
              entries={d.recentActivities.slice(0, 10).map((activity) => ({
                id: activity.id,
                icon: LEAD_ACTIVITY_DISPLAY[activity.type].icon,
                iconClass: LEAD_ACTIVITY_DISPLAY[activity.type].iconClass,
                title: LEAD_ACTIVITY_DISPLAY[activity.type].label,
                timestamp: activity.created_at,
              }))}
            />
          </div>
        </div>
      </div>
    </SuperAdminPeriodProvider>
  );
}
