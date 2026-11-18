"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenu } from "./useFloatingMenu";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
// shortcut: 5-minute steps, no free-typed minutes; add a minute input if finer times are needed
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string): { hour12: number; minute: number; pm: boolean } | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  return { hour12: hour % 12 || 12, minute: Number(match[2]), pm: hour >= 12 };
}

function build(hour12: number, minute: number, pm: boolean): string {
  return `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

// A branded time picker in place of a native <input type="time">, matching
// DateField. Same 24-hour "HH:mm" string in and out.
export default function TimeField({
  id,
  value,
  onChange,
  placeholder = "Select time",
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
  const parsed = parse(value);
  const current = parsed ?? { hour12: 9, minute: 0, pm: false };

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

  const optionClass = (selected: boolean) =>
    `rounded-md py-1.5 text-center text-sm ${selected ? "bg-brand-600 font-semibold text-white" : "text-zinc-700 hover:bg-zinc-100"}`;

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
        <span className={parsed ? "text-zinc-900" : "text-zinc-400"}>
          {parsed ? `${pad(parsed.hour12)}:${pad(parsed.minute)} ${parsed.pm ? "PM" : "AM"}` : placeholder}
        </span>
        <i className="ri-time-line text-brand-600" aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, top: position.top, bottom: position.bottom }}
          className="z-[100] flex w-60 max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
        >
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Hour</p>
            <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Hour">
              {HOURS.map((h) => (
                <button key={h} type="button" className={optionClass(parsed?.hour12 === h)} onClick={() => onChange(build(h, current.minute, current.pm))}>
                  {pad(h)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Minute</p>
            <div className="grid grid-cols-6 gap-1" role="listbox" aria-label="Minute">
              {MINUTES.map((m) => (
                <button key={m} type="button" className={optionClass(parsed?.minute === m)} onClick={() => onChange(build(current.hour12, m, current.pm))}>
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1" role="listbox" aria-label="AM or PM">
            {[false, true].map((pm) => (
              <button key={String(pm)} type="button" className={optionClass(parsed?.pm === pm)} onClick={() => onChange(build(current.hour12, current.minute, pm))}>
                {pm ? "PM" : "AM"}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
