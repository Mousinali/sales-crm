import type { ReactNode } from "react";
import Link from "next/link";

type Crumb = { label: string; href?: string };

// The title + count + "Home > …" breadcrumb at the top of a page, with an
// optional right-side `actions` slot — only pages with real page-level
// actions (e.g. Leads' Export/Refresh/New Lead cluster) pass one; most
// pages just get the title and breadcrumb.
export default function PageHeading({
  title,
  count,
  crumbs = [],
  actions,
}: {
  title: string;
  count?: number;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
          {count != null && (
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{count}</span>
          )}
        </div>
        <nav aria-label="Breadcrumb" className="mt-1 flex items-center gap-1 text-sm text-zinc-400">
          <Link href="/dashboard" className="hover:text-zinc-600">
            Home
          </Link>
          {crumbs.map((crumb) => (
            <span key={crumb.label} className="flex items-center gap-1">
              <i className="ri-arrow-right-s-line" aria-hidden="true" />
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-zinc-600">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-zinc-500">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
