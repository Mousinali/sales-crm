"use client";

import { useRouter } from "next/navigation";
import RefreshButton from "@/app/(dashboard)/RefreshButton";

// The dashboard is a pure Server Component with no client-side fetch state
// of its own, so `router.refresh()` (re-run the server component, refetch
// from the DB) is enough — unlike the list views, there's no local state to
// reconcile afterward.
export default function DashboardRefreshButton() {
  const router = useRouter();
  return <RefreshButton onRefresh={() => router.refresh()} />;
}
