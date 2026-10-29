import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import DashboardShell, { type NavItem } from "./DashboardShell";

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

  const NAV_ITEMS: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" },
    { href: "/calendar", label: "Calendar", icon: "ri-calendar-line" },
    { href: "/chat", label: "Chat", icon: "ri-chat-3-line" },
    ...(user.role === "SUPER_ADMIN" || user.role === "HR" || user.role === "MARKETING_HEAD"
      ? [{ href: "/team", label: "Team", icon: "ri-team-line" }]
      : []),
    ...(user.role !== "HR"
      ? [
          {
            href: "/leads",
            label: "Leads",
            icon: "ri-contacts-line",
            children: [
              // Mirrors LeadsView's `canCreate` check (PRE_SALES/MARKETING_HEAD
              // only) — /leads/new redirects anyone else straight back to
              // /leads, so there's no point offering the link to them here.
              ...(user.role === "PRE_SALES" || user.role === "MARKETING_HEAD"
                ? [{ href: "/leads/new", label: "Add Lead", icon: "ri-add-line" }]
                : []),
              { href: "/leads", label: "Lead List", icon: "ri-list-check" },
            ],
          },
        ]
      : []),
    ...(user.role === "SUPER_ADMIN" || user.role === "MARKETING_HEAD"
      ? [{ href: "/announcements", label: "Announcements", icon: "ri-mail-send-line" }]
      : []),
    ...(user.role !== "HR" ? [{ href: "/tasks", label: "Tasks", icon: "ri-list-check-2" }] : []),
    ...(user.role === "SUPER_ADMIN" ? [{ href: "/services", label: "Services", icon: "ri-price-tag-3-line" }] : []),
  ];

  return (
    <DashboardShell user={user} navItems={NAV_ITEMS}>
      {children}
    </DashboardShell>
  );
}
