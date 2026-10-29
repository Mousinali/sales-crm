"use client";

import { usePathname } from "next/navigation";

// Mirrors the labels in layout.tsx's NAV_ITEMS, plus the sub-routes under
// /leads that aren't nav entries of their own. Order matters: the first
// matching pattern wins, so the more specific /leads/* routes are checked
// before the bare /leads fallback.
const ROUTE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/dashboard$/, label: "Dashboard" },
  { pattern: /^\/calendar$/, label: "Calendar" },
  { pattern: /^\/chat$/, label: "Chat" },
  { pattern: /^\/team$/, label: "Team" },
  { pattern: /^\/leads\/new$/, label: "New Lead" },
  { pattern: /^\/leads\/\d+\/edit$/, label: "Edit Lead" },
  { pattern: /^\/leads\/\d+$/, label: "Lead Details" },
  { pattern: /^\/leads$/, label: "Leads" },
  { pattern: /^\/announcements$/, label: "Announcements" },
  { pattern: /^\/tasks$/, label: "Tasks" },
  { pattern: /^\/services$/, label: "Services" },
];

export default function PageTitle() {
  const pathname = usePathname() ?? "";
  const label = ROUTE_LABELS.find((r) => r.pattern.test(pathname))?.label ?? "Dashboard";
  return <h1 className="text-base font-semibold text-zinc-900">{label}</h1>;
}
