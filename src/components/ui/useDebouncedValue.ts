"use client";

import { useEffect, useState } from "react";

// Delays reflecting a fast-changing value (a search box's keystrokes)
// until it's stayed still for `delayMs` — callers re-fetch off the
// debounced value instead of on every keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
