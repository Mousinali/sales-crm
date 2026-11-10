"use client";

import { useRouter } from "next/navigation";
import RefreshButton from "@/components/ui/RefreshButton";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

// The dashboard is a pure Server Component with no client-side fetch state
// of its own, so `router.refresh()` (re-run the server component, refetch
// from the DB) is enough — unlike the list views, there's no local state to
// reconcile afterward. Same 5-minute auto-refresh as the list views, on
// top of this manual button.
export default function DashboardRefreshButton() {
  const router = useRouter();
  useAutoRefresh(() => router.refresh());
  return <RefreshButton onRefresh={() => router.refresh()} iconOnly="sm" />;
}
