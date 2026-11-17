import { useLayoutEffect, useState, type RefObject } from "react";

export type MenuPosition = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const GAP = 4;
const MARGIN = 8;
const MIN_ROOM = 220;

// Positions a dropdown menu against its trigger in viewport coordinates, so
// it can be rendered in a portal: an `absolute` menu inside a modal or a
// scrolling card gets clipped by that container's overflow, or runs off the
// bottom of the screen. Opens below the trigger, flips above when there's
// more room there, and caps its height to the space actually available.
export function useFloatingMenu(open: boolean, triggerRef: RefObject<HTMLElement | null>): MenuPosition | null {
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP - MARGIN;
      const above = rect.top - GAP - MARGIN;
      const openUp = below < MIN_ROOM && above > below;
      setPosition({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(openUp ? above : below, 120),
        ...(openUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    }
    update();
    // Capture so scrolling any ancestor (e.g. the modal body) re-anchors the menu.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  return open ? position : null;
}
