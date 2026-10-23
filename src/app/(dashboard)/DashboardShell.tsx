"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import type { AuthUser } from "../../lib/auth/rbac";

export type NavItem = { href: string; label: string; icon: string };

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
    return `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      isActive(href)
        ? "bg-indigo-50 text-indigo-700"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    }`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 lg:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-sidebar"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <i
            className={mobileNavOpen ? "ri-close-line text-xl" : "ri-menu-line text-xl"}
            aria-hidden="true"
          />
        </button>
        <span className="text-base font-semibold text-zinc-900">Sales CRM</span>
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
            className="relative z-50 flex h-full w-64 flex-col gap-1 bg-white p-4 shadow-xl"
          >
            <p className="mb-4 px-2 text-lg font-semibold text-zinc-900">Sales CRM</p>
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
      <aside className="hidden w-64 flex-col border-r border-zinc-200 bg-white px-4 py-6 lg:flex">
        <p className="mb-6 px-2 text-lg font-semibold text-zinc-900">Sales CRM</p>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          <NavLinks navItems={navItems} isActive={isActive} navLinkClasses={navLinkClasses} />
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Desktop top bar */}
        <header className="hidden items-center justify-end gap-4 border-b border-zinc-200 bg-white px-6 py-3 lg:flex">
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-900">{user.name}</p>
            <p className="text-xs text-zinc-500">{user.role}</p>
          </div>
          <SignOutButton />
        </header>

        {/* Mobile user row */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 lg:hidden">
          <div>
            <p className="text-sm font-medium text-zinc-900">{user.name}</p>
            <p className="text-xs text-zinc-500">{user.role}</p>
          </div>
          <SignOutButton />
        </div>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
