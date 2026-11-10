"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./NavLinks";
import { useMobileOverlay } from "./MobileOverlayContext";

// A mobile-only tab bar for the handful of routes someone reaches for
// constantly — the full nav tree (with nested children, section labels,
// everything else) still lives in the hamburger drawer; this is just the
// fast path, same idea as the sidebar's "active route" highlighting.
export default function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  // Both offcanvas overlays (hamburger drawer, notifications panel) sit
  // above this bar's z-index, but this bar's own footer content (Sign
  // out, Profile) can still land in the same screen region as theirs —
  // hiding it outright while either is open avoids that collision rather
  // than relying on z-index/dimming alone to make it unreachable.
  const { anyOpen } = useMobileOverlay();

  return (
    <nav
      aria-label="Primary"
      className={`fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden ${anyOpen ? "hidden" : ""}`}
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? "text-brand-600" : "text-zinc-500"}`}
          >
            <i className={`${item.icon} text-xl`} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
