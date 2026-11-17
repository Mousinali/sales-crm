"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { useFloatingMenu } from "./useFloatingMenu";

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromIso(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// A branded single-date picker in place of a native <input type="date">
// (the browser's own popup ignores the theme). Same yyyy-mm-dd string in
// and out, so callers keep their existing state shape.
export default function DateField({
  id,
  value,
  onChange,
  placeholder = "Select date",
  compact = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingMenu(open, triggerRef);
  const selected = fromIso(value);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white text-left text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 ${
          compact ? "px-2 py-1.5" : "px-3 py-2"
        } ${open ? "border-brand-500 ring-2 ring-brand-200" : "border-zinc-300 focus:border-brand-500"}`}
      >
        <span className={selected ? "text-zinc-900" : "text-zinc-400"}>
          {selected ? selected.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : placeholder}
        </span>
        <i className="ri-calendar-line text-brand-600" aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, top: position.top, bottom: position.bottom }}
          className="z-[100] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
        >
          <DayPicker
            className="brand-daypicker"
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={(date) => {
              onChange(date ? toIso(date) : "");
              setOpen(false);
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
