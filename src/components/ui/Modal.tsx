"use client";

import { useEffect, type ReactNode } from "react";

// Shared chrome for the "add"-style dialogs (assign, schedule a visit,
// transfer, record a payment, …) — one overlay/card/close-button
// implementation instead of each form re-building it.
export default function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${maxWidth} rounded-lg bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <i className="ri-close-line text-lg" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
