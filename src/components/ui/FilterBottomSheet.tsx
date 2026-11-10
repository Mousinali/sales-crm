"use client";

import { useEffect, type ReactNode } from "react";

// The mobile equivalent of a desktop filter bar's inline dropdown row —
// instead of cramming status/source/priority/date-range side by side on a
// phone-width screen, they all live in here, opened from one "Filter"
// button. Slides up from the bottom (same backdrop + transform-transition
// shape as the offcanvas drawers elsewhere), not a floating popup, so nothing
// inside it (the date-range calendar especially) needs its own viewport-aware
// positioning.
export default function FilterBottomSheet({
  open,
  onClose,
  onApply,
  title = "Filters",
  applyLabel = "Apply filters",
  children,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  title?: string;
  applyLabel?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 sm:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close filters"
        onClick={onClose}
        className={`absolute inset-0 bg-zinc-900/40 transition-opacity duration-200 ease-in-out ${open ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl transition-transform duration-200 ease-in-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-4">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <i className="ri-close-line text-xl" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">{children}</div>
        </div>
        <div className="border-t border-zinc-200 p-4">
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={onApply}
            className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
