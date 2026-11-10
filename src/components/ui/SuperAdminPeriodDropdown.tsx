"use client";

import { useState } from "react";
import { useSuperAdminPeriod } from "@/components/ui/SuperAdminPeriodContext";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

const PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: "TODAY", label: "Today" },
  { value: "WEEK", label: "This week" },
  { value: "MONTH", label: "This month" },
];

const TODAY_LABEL = `Today, ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

function periodLabel(period: SummaryPeriod): string {
  return PERIODS.find((p) => p.value === period)!.label;
}

export default function SuperAdminPeriodDropdown() {
  const { period, setPeriod } = useSuperAdminPeriod();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-400 cursor-pointer sm:h-8.5 sm:py-1"
      >
        <i className="ri-calendar-line text-brand-600" aria-hidden="true" />
        <span className="sm:hidden">{periodLabel(period)}</span>
        <span className="hidden sm:inline">{period === "TODAY" ? TODAY_LABEL : periodLabel(period)}</span>
        <i className="ri-arrow-down-s-line text-zinc-400" aria-hidden="true" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close period picker" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPeriod(p.value);
                  setOpen(false);
                }}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                  period === p.value ? "bg-brand-50 text-brand-700" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
