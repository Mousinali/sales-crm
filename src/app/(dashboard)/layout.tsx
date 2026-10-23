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
  // This check is a UX convenience only — it avoids a flash of the dashboard
  // chrome for an obviously-unauthenticated visit. It is NOT the security
  // boundary: Next.js layouts don't re-render on navigation and don't block
  // their child segments from being included in the RSC payload, so a
  // layout-only check cannot be relied on to protect the pages inside it.
  // Every protected page and route handler must independently call
  // `requireUser()` (or a future role-checking variant) from rbac.ts.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Same UX-convenience caveat as above: a user flagged must_change_password
  // (by Task 3's createUser or Task 6's resetUserAccess) is bounced to
  // /change-password before seeing the dashboard chrome. This isn't a new
  // security boundary either — the Route Handlers Task 8's dashboard pages
  // call remain unaffected and work normally regardless of this flag.
  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <DashboardShell user={user} navItems={NAV_ITEMS}>
      {children}
    </DashboardShell>
  );
}
