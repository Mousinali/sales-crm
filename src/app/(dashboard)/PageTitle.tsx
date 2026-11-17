"use client";

import { usePathname } from "next/navigation";

// Mirrors the labels in layout.tsx's nav, plus sub-routes (details, add,
// edit) that aren't nav entries of their own. Order matters: the first
// matching pattern wins, so a specific route (/leads/new) is checked before
// its bare parent (/leads).
const ROUTE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/dashboard$/, label: "Dashboard" },
  { pattern: /^\/calendar$/, label: "Calendar" },
  { pattern: /^\/chat$/, label: "Chat" },
  { pattern: /^\/notifications$/, label: "Notifications" },
  { pattern: /^\/team$/, label: "Team" },
  { pattern: /^\/companies\/[^/]+$/, label: "Company Details" },
  { pattern: /^\/companies$/, label: "Companies" },
  { pattern: /^\/leads\/new$/, label: "New Lead" },
  { pattern: /^\/leads\/bulk$/, label: "Bulk Upload Leads" },
  { pattern: /^\/leads\/\d+\/edit$/, label: "Edit Lead" },
  { pattern: /^\/leads\/\d+$/, label: "Lead Details" },
  { pattern: /^\/leads$/, label: "Leads" },
  { pattern: /^\/announcements$/, label: "Announcements" },
  { pattern: /^\/services$/, label: "Services" },
  { pattern: /^\/sales\/new$/, label: "Add Sale" },
  { pattern: /^\/sales\/\d+$/, label: "Sale Details" },
  { pattern: /^\/sales$/, label: "Sales" },
  { pattern: /^\/payments\/new$/, label: "New Payment" },
  { pattern: /^\/payments$/, label: "Payments" },
  { pattern: /^\/analysis\/sales\/group$/, label: "Sales Analysis" },
  { pattern: /^\/analysis\/payments\/group$/, label: "Payment Analysis" },
  { pattern: /^\/analysis\/sales$/, label: "Sales Analysis" },
  { pattern: /^\/analysis\/payments$/, label: "Payment Analysis" },
  { pattern: /^\/tasks$/, label: "Tasks" },
  { pattern: /^\/logs$/, label: "Logs" },
  { pattern: /^\/archive$/, label: "Archive" },
  { pattern: /^\/settings$/, label: "Settings" },
];

// A route with no entry above falls back to its first path segment ("/foo-bar/1" -> "Foo Bar")
// rather than a wrong page name.
function fallbackLabel(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return segment ? segment.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Dashboard";
}

export default function PageTitle() {
  const pathname = usePathname() ?? "";
  const label = ROUTE_LABELS.find((r) => r.pattern.test(pathname))?.label ?? fallbackLabel(pathname);
  return <h1 className="text-base font-semibold text-zinc-900">{label}</h1>;
}
