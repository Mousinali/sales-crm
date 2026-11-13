import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { getUnreadMessageCount } from "@/lib/chat/crud";
import DashboardShell, { type NavSection } from "./DashboardShell";
import pkg from "../../../package.json";

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

  const unreadMessages = await getUnreadMessageCount(pool, user.id);

  const NAV_SECTIONS: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" },
        { href: "/calendar", label: "Calendar", icon: "ri-calendar-line" },
        { href: "/chat", label: "Chat", icon: "ri-chat-3-line", badge: unreadMessages },
        { href: "/notifications", label: "Notifications", icon: "ri-notification-3-line" },
      ],
    },
    {
      label: "Organization",
      items: [
        ...(user.role === "SUPER_ADMIN" || user.role === "HR" || user.role === "MARKETING_HEAD"
          ? [{ href: "/team", label: "Team", icon: "ri-team-line" }]
          : []),
        ...(user.role === "SUPER_ADMIN" || user.role === "MARKETING_HEAD"
          ? [{ href: "/companies", label: "Companies", icon: "ri-building-line" }]
          : []),
        ...(user.role !== "HR"
          ? [
              {
                href: "/leads",
                label: "Leads",
                icon: "ri-contacts-line",
                children: [
                  // Mirrors LeadsView's `canCreate` check (PRE_SALES/MARKETING_HEAD/
                  // SALESPERSON only) — /leads/new redirects anyone else straight
                  // back to /leads, so there's no point offering the link to them here.
                  ...(user.role === "PRE_SALES" || user.role === "MARKETING_HEAD" || user.role === "SALESPERSON"
                    ? [{ href: "/leads/new", label: "Add Lead", icon: "ri-add-line" }]
                    : []),
                  { href: "/leads", label: "Lead List", icon: "ri-list-check" },
                ],
              },
            ]
          : []),
        ...(user.role === "SUPER_ADMIN" ? [{ href: "/services", label: "Services", icon: "ri-price-tag-3-line" }] : []),
      ],
    },
    {
      label: "Revenue",
      items: [
        ...(user.role === "MARKETING_HEAD" || user.role === "PRE_SALES" || user.role === "SALESPERSON"
          ? [
              {
                href: "/sales",
                label: "Sales",
                icon: "ri-money-dollar-circle-line",
                children: [
                  { href: "/sales/new", label: "Add Sale", icon: "ri-add-line" },
                  { href: "/sales", label: "Sales List", icon: "ri-list-check" },
                ],
              },
              {
                href: "/payments",
                label: "Payments",
                icon: "ri-bill-line",
                children: [
                  { href: "/payments/new", label: "New Payment", icon: "ri-add-line" },
                  { href: "/payments", label: "Payment List", icon: "ri-list-check" },
                ],
              },
            ]
          : []),
        // Super Admin gets read-only access to the sales/payment lists, not
        // the add-sale/new-payment forms those roles also get above.
        ...(user.role === "SUPER_ADMIN" ? [{ href: "/sales", label: "Sales", icon: "ri-money-dollar-circle-line" }] : []),
        ...(user.role === "SUPER_ADMIN" ? [{ href: "/payments", label: "Payments", icon: "ri-bill-line" }] : []),
      ],
    },
    {
      label: "Workflow",
      items: [
        ...(user.role !== "HR" ? [{ href: "/tasks", label: "Tasks", icon: "ri-list-check-2" }] : []),
        ...(user.role === "SUPER_ADMIN" || user.role === "MARKETING_HEAD"
          ? [{ href: "/announcements", label: "Announcements", icon: "ri-mail-send-line" }]
          : []),
      ],
    },
    {
      label: "General",
      items: [
        ...(user.role === "SUPER_ADMIN" ? [{ href: "/logs", label: "Logs", icon: "ri-history-line" }] : []),
        ...(user.role === "SUPER_ADMIN" ? [{ href: "/archive", label: "Archive", icon: "ri-archive-line" }] : []),
        { href: "/settings", label: "Settings", icon: "ri-settings-3-line" },
      ],
    },
  ].filter((section) => section.items.length > 0);

  // The 3-4 routes someone reaches for constantly, for the mobile tab bar —
  // everything else (Calendar, Chat, Settings, …) stays in the hamburger
  // drawer via NAV_SECTIONS above. Falls back to Team once a role has no
  // Sales of its own (SUPER_ADMIN, HR), so the bar is never just one tab.
  const BOTTOM_NAV_ITEMS = [
    { href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" },
    ...(user.role !== "HR" ? [{ href: "/leads", label: "Leads", icon: "ri-contacts-line" }] : []),
    ...(user.role === "MARKETING_HEAD" || user.role === "PRE_SALES" || user.role === "SALESPERSON"
      ? [{ href: "/sales", label: "Sales", icon: "ri-money-dollar-circle-line" }]
      : user.role === "SUPER_ADMIN" || user.role === "HR"
        ? [{ href: "/team", label: "Team", icon: "ri-team-line" }]
        : []),
    { href: "/settings", label: "Profile", icon: "ri-user-settings-line" },
  ];

  return (
    <DashboardShell user={user} navSections={NAV_SECTIONS} bottomNavItems={BOTTOM_NAV_ITEMS} version={pkg.version}>
      {children}
    </DashboardShell>
  );
}
