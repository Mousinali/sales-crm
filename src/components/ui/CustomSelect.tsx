"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenu } from "./useFloatingMenu";

export type SelectOption = { value: string; label: string; icon?: string };

// A styled stand-in for a native <select> — browsers render the native
// popup with their own OS chrome (the dark, unstyled overlay this was built
// to replace), which can't show a per-option icon and never matches the
// rest of the page. Same open/close-on-outside-click/Escape pattern as
// MultiSelectSearch, plus its own search box once the list is long enough
// that scanning it beats scrolling.
const SEARCH_THRESHOLD = 7;

export default function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "—",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  // Filter dropdowns have no visible <label>, so without this a screen reader
  // announces them by whichever option happens to be selected and nothing else.
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingMenu(open, triggerRef);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const searchable = options.length > SEARCH_THRESHOLD;

  // Jumps straight to whichever option is already selected (if the list is
  // long enough that it might start off scrolled out of view) instead of
  // always opening at the top of the list regardless of where the current
  // value sits in it.
  const positioned = position !== null;
  useEffect(() => {
    // jsdom (unit tests) doesn't implement scrollIntoView at all.
    // `position`: the portaled menu only exists once it has been measured.
    if (open && positioned) selectedOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  // `positioned`, not `position`: scrolling the list re-measures position, which would snap back to the selection.
  }, [open, positioned]);

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

  function openMenu() {
    setOpen(true);
    setSearch("");
    if (searchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  const selected = options.find((o) => o.value === value);
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower ? options.filter((o) => o.label.toLowerCase().includes(searchLower)) : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        // combobox is the role for a control that expands a listbox; without it
        // this reads to assistive tech as a plain button.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon && (
            // eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize.
            <img src={selected.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          )}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <i className={`ri-arrow-down-s-line shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
          className="z-[100] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {searchable && (
            <div className="relative border-b border-zinc-200">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="w-full py-2 pr-3 pl-9 text-sm text-zinc-900 focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" style={{ maxHeight: Math.min(position.maxHeight - 50, 280) }} className="overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  ref={o.value === value ? selectedOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                    o.value === value ? "bg-brand-50 text-brand-700" : "text-zinc-700"
                  }`}
                >
                  {o.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize.
                    <img src={o.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  )}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
