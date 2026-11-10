"use client";

import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIso(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplay(value: string): string | null {
  const date = fromIso(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
}

// A branded range calendar in place of two native <input type="date">
// fields — same from/to string values (yyyy-mm-dd) in and out, so the
// caller's filter state doesn't need to change shape.
export default function DateRangeFilter({
  from,
  to,
  onChange,
  inline = false,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  // For a host that's already its own modal (the mobile filter bottom
  // sheet) — skips the button/popup/positioning entirely and just renders
  // a single-month calendar directly, since a two-month `w-[44rem]` popup
  // anchored to a button has nowhere good to go on a phone-width screen.
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const range: DateRange = { from: fromIso(from), to: fromIso(to) };
  const fromLabel = formatDisplay(from);
  const toLabel = formatDisplay(to);

  function handleSelect(nextRange: DateRange | undefined) {
    onChange(nextRange?.from ? toIso(nextRange.from) : "", nextRange?.to ? toIso(nextRange.to) : "");
  }

  if (inline) {
    return (
      <div>
        <DayPicker
          className="brand-daypicker brand-daypicker--full-width"
          mode="range"
          numberOfMonths={1}
          selected={range}
          onSelect={handleSelect}
          defaultMonth={range.from ?? new Date()}
        />
        {(fromLabel || toLabel) && (
          <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2">
            <button type="button" onClick={() => onChange("", "")} className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              Clear dates
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <i className="ri-calendar-line text-zinc-400" aria-hidden="true" />
        {fromLabel || toLabel ? (
          <span>
            {fromLabel ?? "…"} – {toLabel ?? "…"}
          </span>
        ) : (
          <span className="text-zinc-400">From – To</span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close date picker" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          {/* An explicit width (rather than auto) gives the two-month
              view's `max-width: fit-content` a definite available space to
              resolve against, so the browser lays both months out side by
              side instead of falling back to its narrower wrapped layout. */}
          <div className="absolute right-0 top-full z-50 mt-1.5 w-[44rem] max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
            <DayPicker
              className="brand-daypicker"
              mode="range"
              numberOfMonths={2}
              selected={range}
              onSelect={handleSelect}
              defaultMonth={range.from ?? new Date()}
            />
            <div className="mt-2 flex justify-end gap-2 border-t border-zinc-100 pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange("", "");
                  setOpen(false);
                }}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
