"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// The hamburger drawer and the mobile notifications panel are two
// independent components, each with their own open/closed state — but
// BottomNav (a third, separate component) needs to know "is *either* of
// them open" so it can get out of the way instead of visually colliding
// with whichever one is showing. A Set of open overlay ids (rather than a
// single boolean) means two overlays opening in any order never clobber
// each other's "I'm still open" state when one of them closes.
const MobileOverlayContext = createContext<{
  anyOpen: boolean;
  setOverlayOpen: (id: string, open: boolean) => void;
} | null>(null);

export function MobileOverlayProvider({ children }: { children: ReactNode }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const setOverlayOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return (
    <MobileOverlayContext.Provider value={{ anyOpen: openIds.size > 0, setOverlayOpen }}>{children}</MobileOverlayContext.Provider>
  );
}

// Falls back to a harmless no-op outside a provider (e.g. NotificationsBell
// rendered standalone in its own unit tests) rather than throwing — the
// "hide BottomNav while I'm open" behavior just doesn't apply there, which
// is correct since there's no BottomNav in that context either.
const NOOP_OVERLAY = { anyOpen: false, setOverlayOpen: () => {} };

export function useMobileOverlay() {
  return useContext(MobileOverlayContext) ?? NOOP_OVERLAY;
}
