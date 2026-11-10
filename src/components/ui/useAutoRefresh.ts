"use client";

import { useEffect, useRef } from "react";

const FIVE_MINUTES = 5 * 60 * 1000;

// Keeps a list view's data from going stale between manual Refresh clicks,
// without polling the server constantly: one fetch every 5 minutes, and
// only while the tab is actually visible — a backgrounded tab does nothing.
// A ref holds the latest callback so the interval itself is set up once,
// not torn down and recreated on every render.
export function useAutoRefresh(callback: () => void, intervalMs: number = FIVE_MINUTES) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") callbackRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
