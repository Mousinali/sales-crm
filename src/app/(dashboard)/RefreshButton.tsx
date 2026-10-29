"use client";

import { useState } from "react";

export default function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={refreshing}
      aria-label="Refresh"
      title="Refresh"
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <i className={`ri-refresh-line text-base ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      Refresh
    </button>
  );
}
