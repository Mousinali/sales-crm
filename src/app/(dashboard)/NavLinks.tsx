"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; children?: NavItem[] };

export default function NavLinks({ navItems, onNavigate }: { navItems: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  function linkClasses(href: string, indent = false) {
    const active = isActive(href);
    return `flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      indent ? "pl-11 pr-3" : "px-3"
    } ${active ? "bg-sidebar-elevated text-white" : "text-slate-300 hover:bg-sidebar-elevated/60 hover:text-white"}`;
  }

  function iconClasses(href: string) {
    return isActive(href) ? "text-indigo-400" : "text-slate-400";
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
            <i className={`${item.icon} text-lg ${iconClasses(item.href)}`} aria-hidden="true" />
            {item.label}
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
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
          childActive ? "bg-sidebar-elevated text-white" : "text-slate-300 hover:bg-sidebar-elevated/60 hover:text-white"
        }`}
      >
        <span className="flex items-center gap-3">
          <i className={`${item.icon} text-lg ${childActive ? "text-indigo-400" : "text-slate-400"}`} aria-hidden="true" />
          {item.label}
        </span>
        <i className={`ri-arrow-down-s-line text-base text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
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
        <div className="flex flex-col gap-1 overflow-hidden">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              aria-current={isActive(child.href) ? "page" : undefined}
              className={linkClasses(child.href, true)}
            >
              <i className={`${child.icon} text-base ${iconClasses(child.href)}`} aria-hidden="true" />
              {child.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
