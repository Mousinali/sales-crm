"use client";

import { useState } from "react";

// `iconOnly`: `true` drops the "Refresh" text everywhere; `"sm"` drops it
// only below the `sm` breakpoint (icon-only on mobile, icon+text on
// desktop) — every other call site passes neither and keeps the original
// icon+text pill unchanged at every size.
export default function RefreshButton({
  onRefresh,
  iconOnly,
}: {
  onRefresh: () => Promise<unknown> | void;
  iconOnly?: boolean | "sm";
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleClick() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const sizeClasses = iconOnly === "sm" ? "h-9 w-9 sm:h-auto sm:w-auto sm:px-3 sm:py-1" : iconOnly ? "h-9 w-9" : "px-3 py-1";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={refreshing}
      aria-label="Refresh"
      title="Refresh"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border bg-[#EFF6FF] border-zinc-300 text-sm font-medium text-[#305174] hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${sizeClasses}`}
    >
      <i className={`ri-refresh-line text-base ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      {iconOnly === true ? null : iconOnly === "sm" ? <span className="hidden sm:inline">Refresh</span> : "Refresh"}
    </button>
  );
}
