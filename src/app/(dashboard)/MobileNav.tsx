"use client";

import { useEffect, useState } from "react";
import Brand from "./Brand";
import NavLinks, { type NavSection } from "./NavLinks";
import NotificationsBell from "./NotificationsBell";
import SignOutButton from "./SignOutButton";
import Avatar from "@/components/ui/Avatar";
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "./roleDisplay";
import { useMobileOverlay } from "./MobileOverlayContext";
import type { AuthUser } from "@/lib/auth/rbac";

export default function MobileNav({ user, navSections }: { user: AuthUser; navSections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const { setOverlayOpen } = useMobileOverlay();

  // The drawer overlays the page rather than replacing it, so without this
  // a touch-scroll or wheel event still scrolls the page underneath it.
  useEffect(() => {
    setOverlayOpen("hamburger-drawer", open);
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, setOverlayOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <NotificationsBell variant="mobile" />
          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="mobile-sidebar"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md p-2 text-sidebar-muted hover:bg-sidebar-elevated hover:text-sidebar-foreground focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <i className={open ? "ri-close-line text-xl" : "ri-menu-line text-xl"} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Stays mounted (rather than `{open && ...}`) so the transform/opacity
          transitions below actually have something to animate between —
          an unmounted-to-mounted swap would just pop in with no slide.
          `pointer-events-none` while closed stops the fully-offscreen drawer
          and transparent overlay from still capturing clicks or tab focus. */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-zinc-900/40 transition-opacity duration-200 ease-in-out ${open ? "opacity-100" : "opacity-0"}`}
        />
        <nav
          id="mobile-sidebar"
          aria-label="Primary"
          className={`relative z-50 flex h-full w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl transition-transform duration-200 ease-in-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-sidebar-border p-4">
            <Avatar name={user.name} imageUrl={user.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</p>
              <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}>
                {user.designation || ROLE_LABELS[user.role]}
              </span>
            </div>
          </div>

          <div className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto p-3">
            {navSections.map((section, index) => (
              <div key={section.label ?? `section-${index}`} className="flex flex-col gap-0">
                {section.label && (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.label}</p>
                )}
                <NavLinks navItems={section.items} onNavigate={() => setOpen(false)} />
              </div>
            ))}
          </div>

          <div className="border-t border-sidebar-border p-3">
            <SignOutButton className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/10" />
          </div>
        </nav>
      </div>
    </>
  );
}
