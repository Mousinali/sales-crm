"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SummaryPeriod } from "@/lib/dashboard/superAdminSummary";

// Shared so the dropdown (rendered in the welcome row, left of the refresh
// button) and the stat tiles (rendered lower on the page) can both react to
// the same period pick without lifting state into the server component.
const SuperAdminPeriodContext = createContext<{ period: SummaryPeriod; setPeriod: (period: SummaryPeriod) => void } | null>(null);

export function SuperAdminPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<SummaryPeriod>("TODAY");
  return <SuperAdminPeriodContext.Provider value={{ period, setPeriod }}>{children}</SuperAdminPeriodContext.Provider>;
}

export function useSuperAdminPeriod() {
  const ctx = useContext(SuperAdminPeriodContext);
  if (!ctx) throw new Error("useSuperAdminPeriod must be used within SuperAdminPeriodProvider");
  return ctx;
}
