import type { ReactNode } from "react";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AppToaster from "./AppToaster";
import type { NavItem } from "./NavLinks";
import type { AuthUser } from "@/lib/auth/rbac";

export type { NavItem };

export default function DashboardShell({
  user,
  navItems,
  children,
}: {
  user: AuthUser;
  navItems: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <AppToaster />
      <MobileNav navItems={navItems} />
      <Sidebar navItems={navItems} />

      <div className="flex flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
