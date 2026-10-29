"use client";

import { useState } from "react";
import Brand from "./Brand";
import NavLinks, { type NavItem } from "./NavLinks";

export default function MobileNav({ navItems }: { navItems: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          aria-controls="mobile-sidebar"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md p-2 text-slate-300 hover:bg-sidebar-elevated hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <i className={open ? "ri-close-line text-xl" : "ri-menu-line text-xl"} aria-hidden="true" />
        </button>
        <Brand />
        <div className="w-9" aria-hidden="true" />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-zinc-900/40" />
          <nav id="mobile-sidebar" aria-label="Primary" className="relative z-50 flex h-full w-64 flex-col gap-1 bg-sidebar p-3">
            <div className="mb-4 border-b border-sidebar-border px-1 pb-4">
              <Brand />
            </div>
            <NavLinks navItems={navItems} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      )}
    </>
  );
}
