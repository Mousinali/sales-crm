import type { ReactNode } from "react";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import { MobileOverlayProvider } from "./MobileOverlayContext";
import AppToaster from "@/components/ui/AppToaster";
import type { NavItem, NavSection } from "./NavLinks";
import type { AuthUser } from "@/lib/auth/rbac";

export type { NavItem, NavSection };

export default function DashboardShell({
  user,
  navSections,
  bottomNavItems,
  version,
  children,
}: {
  user: AuthUser;
  navSections: NavSection[];
  bottomNavItems: NavItem[];
  version: string;
  children: ReactNode;
}) {
  return (
    <MobileOverlayProvider>
      <div className="flex min-h-screen flex-col bg-page lg:flex-row">
        <AppToaster />
        <MobileNav user={user} navSections={navSections} />
        <Sidebar navSections={navSections} version={version} />

        <div className="flex flex-1 flex-col">
          <TopBar user={user} />
          <main className="flex-1 px-4 py-6 pb-20 lg:px-8 lg:py-8 lg:pb-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>

        <BottomNav items={bottomNavItems} />
      </div>
    </MobileOverlayProvider>
  );
}
