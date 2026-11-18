"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

// Rows that fit the viewport on desktop, so a list card needs no inner scroll.
// Sets `ref.current` on mount; callers send it as `pageSize` and re-fetch page 1
// from their own later effect if it differs from the server-rendered default.
// shortcut: fixed px estimates (not measured), fit once on load; upgrade if row/chrome heights vary.
export function useViewportPageSize(rowHeight = 41, chrome = 300) {
  const ref = useRef(DEFAULT_PAGE_SIZE);
  useEffect(() => {
    if (window.innerWidth < 640) return;
    ref.current = Math.min(100, Math.max(5, Math.floor((window.innerHeight - chrome) / rowHeight)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
