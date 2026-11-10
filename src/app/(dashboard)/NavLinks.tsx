"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; children?: NavItem[]; badge?: number };
// A group of items under an optional label (omitted for the top,
// ungrouped section) — Sidebar/MobileNav render one NavLinks per section.
export type NavSection = { label?: string; items: NavItem[] };

// Shared by every row (flat link, group button, sub-link): a neutral hover
// for anything not on the current route, a tinted brand-red background for
// the active route (distinct from hover's plain grey, so the two never
// read as the same state), a keyboard-only focus ring (not on mouse
// click), and a `:active` press shade for tactile click feedback.
const ROW_BASE =
  "group flex items-center rounded-lg py-2 text-sm font-medium outline-none transition-colors duration-150 " +
  "focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";
const ROW_ACTIVE = "bg-brand-50 text-brand-700";
const ROW_INACTIVE = "text-zinc-600 hover:bg-sidebar-elevated hover:text-zinc-900 active:bg-sidebar-elevated/80";

// Remix icon glyphs don't all occupy the same natural width, so without a
// fixed-width box around each one, every row's label starts at a slightly
// different x position — pinning the icon to one width is what makes the
// whole list actually line up into a column.
const ICON_BOX = "inline-flex w-5 shrink-0 justify-center";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-sidebar-elevated px-1.5 py-0.5 text-xs font-medium text-zinc-600">
      {count}
    </span>
  );
}

export default function NavLinks({ navItems, onNavigate }: { navItems: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  // Exactly one href in this section is "active": an exact match always
  // wins, and a prefix match (e.g. a lead's detail page falling under
  // /leads) only applies when no sibling already claims that exact route —
  // otherwise /leads/new's own link would also light up the unrelated
  // /leads list link, since it starts with "/leads/" too.
  const activeHref = useMemo(() => {
    const hrefs: string[] = [];
    for (const item of navItems) {
      hrefs.push(item.href);
      item.children?.forEach((child) => hrefs.push(child.href));
    }
    if (pathname != null && hrefs.includes(pathname)) return pathname;
    const prefixMatches = hrefs.filter((href) => pathname?.startsWith(`${href}/`));
    if (prefixMatches.length === 0) return null;
    return prefixMatches.reduce((longest, href) => (href.length > longest.length ? href : longest));
  }, [navItems, pathname]);

  function isActive(href: string) {
    return href === activeHref;
  }

  function linkClasses(href: string, indent = false) {
    const active = isActive(href);
    return `${ROW_BASE} justify-between gap-3 ${indent ? "pl-11 pr-3" : "px-3"} ${active ? ROW_ACTIVE : ROW_INACTIVE}`;
  }

  function iconClasses(href: string) {
    // Inactive icons darken on hover (group-hover) so the whole row
    // feels like one responsive control, not just a text color swap.
    return isActive(href) ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-600";
  }

  return (
    <>
      {navItems.map((item) =>
        item.children ? (
          <NavGroup key={item.href} item={item} isActive={isActive} linkClasses={linkClasses} iconClasses={iconClasses} onNavigate={onNavigate} />
        ) : (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={linkClasses(item.href)}
          >
            <span className="flex items-center gap-3">
              <i className={`${item.icon} ${ICON_BOX} text-lg transition-colors duration-150 ${iconClasses(item.href)}`} aria-hidden="true" />
              {item.label}
            </span>
            {item.badge != null && <Badge count={item.badge} />}
          </Link>
        ),
      )}
    </>
  );
}

function NavGroup({
  item,
  isActive,
  linkClasses,
  iconClasses,
  onNavigate,
}: {
  item: NavItem;
  isActive: (href: string) => boolean;
  linkClasses: (href: string, indent?: boolean) => string;
  iconClasses: (href: string) => string;
  onNavigate?: () => void;
}) {
  const children = item.children ?? [];
  const childActive = children.some((child) => isActive(child.href));
  const [open, setOpen] = useState(childActive);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`${ROW_BASE} w-full justify-between gap-3 px-3 ${
          // The group header never gets the active pill — that's reserved
          // for whichever single child is actually the current page
          // (below). Here it only gets a bolder label and a tinted icon,
          // so "this group contains the current page" never reads as "this
          // row IS the current page" the way an identical pink fill would.
          childActive ? "font-semibold text-zinc-900 hover:bg-sidebar-elevated" : ROW_INACTIVE
        }`}
      >
        <span className="flex items-center gap-3">
          <i
            className={`${item.icon} ${ICON_BOX} text-lg transition-colors duration-150 ${
              childActive ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-600"
            }`}
            aria-hidden="true"
          />
          {item.label}
        </span>
        <span className="flex items-center gap-2">
          {item.badge != null && <Badge count={item.badge} />}
          <i
            className={`ri-arrow-down-s-line text-base text-zinc-400 transition-transform duration-150 group-hover:text-zinc-600 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>
      {/* `grid-rows-[0fr]` -> `[1fr]` animates to the content's natural
          height without a hardcoded max-height, and the inner
          `overflow-hidden` is what actually clips it mid-transition. The
          children stay mounted throughout (that's what makes the height
          transition animate instead of snapping), so `aria-hidden` keeps
          them out of the accessibility tree — and out of Testing Library's
          role queries — while collapsed.
          shortcut: a sighted keyboard user can still Tab into a collapsed
          link (aria-hidden doesn't remove focusability); upgrade to `inert`
          once this project's jsdom/testing-library versions reliably
          support it in tests if that's ever reported as an issue. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        aria-hidden={!open}
      >
        <div className="relative flex flex-col gap-1 overflow-hidden">
          {/* A thin guide line under the indented children ties them back
              to their parent row instead of just floating at an indent. */}
          <div className="absolute top-0 bottom-2 left-[1.15rem] w-px bg-sidebar-border" aria-hidden="true" />
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              aria-current={isActive(child.href) ? "page" : undefined}
              className={linkClasses(child.href, true)}
            >
              <span className="flex items-center gap-3">
                <i className={`${child.icon} ${ICON_BOX} text-base transition-colors duration-150 ${iconClasses(child.href)}`} aria-hidden="true" />
                {child.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
