"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import { ROLE_BADGE_CLASSES, ROLE_LABELS, initialsOf } from "./roleDisplay";
import type { AuthUser } from "../../lib/auth/rbac";

export type NavItem = { href: string; label: string; icon: string };

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-xs font-semibold text-white">
        S
      </span>
      <span className="text-base font-semibold tracking-tight text-white">Sales CRM</span>
    </div>
  );
}

function NavLinks({
  navItems,
  isActive,
  navLinkClasses,
  onNavigate,
}: {
  navItems: NavItem[];
  isActive: (href: string) => boolean;
  navLinkClasses: (href: string) => string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={navLinkClasses(item.href)}
        >
          <i className={`${item.icon} text-lg`} aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </>
  );
}

function UserBadge({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
        {initialsOf(user.name)}
      </span>
      <div className={compact ? "" : "text-right"}>
        <p className="text-sm font-medium text-zinc-900">{user.name}</p>
        <span
          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
        >
          {ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  );
}

export default function DashboardShell({
  user,
  navItems,
  children,
}: {
  user: AuthUser;
  navItems: NavItem[];
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  function navLinkClasses(href: string) {
    return `flex items-center gap-3 rounded-r-md border-l-2 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      isActive(href)
        ? "border-indigo-400 bg-slate-800/60 text-white"
        : "border-transparent text-slate-300 hover:bg-slate-800/40 hover:text-white"
    }`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-sidebar"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <i
            className={mobileNavOpen ? "ri-close-line text-xl" : "ri-menu-line text-xl"}
            aria-hidden="true"
          />
        </button>
        <Brand />
        <div className="w-9" aria-hidden="true" />
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-zinc-900/40"
          />
          <nav
            id="mobile-sidebar"
            aria-label="Primary"
            className="relative z-50 flex h-full w-64 flex-col gap-1 bg-slate-900 p-4"
          >
            <div className="mb-6">
              <Brand />
            </div>
            <NavLinks
              navItems={navItems}
              isActive={isActive}
              navLinkClasses={navLinkClasses}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col bg-slate-900 px-4 py-6 lg:flex">
        <div className="mb-6">
          <Brand />
        </div>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          <NavLinks navItems={navItems} isActive={isActive} navLinkClasses={navLinkClasses} />
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Desktop top bar */}
        <header className="hidden items-center justify-end gap-4 border-b border-zinc-200 bg-white px-6 py-3 lg:flex">
          <UserBadge user={user} />
          <SignOutButton />
        </header>

        {/* Mobile user row */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 lg:hidden">
          <UserBadge user={user} compact />
          <SignOutButton />
        </div>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
