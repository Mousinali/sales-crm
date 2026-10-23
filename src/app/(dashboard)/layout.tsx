import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/rbac";
import DashboardShell, { type NavItem } from "./DashboardShell";

// Phase 1 ships only the "Dashboard" item. Phase 2+ plans add new entries
// here (Team, Leads, etc.) as those pages land.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell user={user} navItems={NAV_ITEMS}>
      {children}
    </DashboardShell>
  );
}
